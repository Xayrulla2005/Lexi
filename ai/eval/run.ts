/**
 * Accuracy check: runs the stories in ai/eval/datasets/test_cases.csv through
 * analyze() + the routing engine and compares with the expected answers.
 *
 * Run: pnpm eval:ai                                   (keyword baseline, offline)
 *      pnpm eval:ai --provider gemini --label llm-gemini --limit 40
 *      pnpm eval:ai --out path/to/report.json
 *
 * --provider gemini|huggingface|keyword  (default: keyword)
 * --limit N   evenly spaced sample of N stories (deterministic); the keyword classifier is
 *             always measured on the same sample, so the comparison is like for like.
 * LLM replies are cached in ai/eval/cache/ (git-ignored); at most 2 requests run at once
 * (--concurrency 1 for one at a time).
 *
 * Metrics: problemId accuracy (null counts as a prediction), domain accuracy, red-risk
 * recall, first-agency accuracy, per style; top-10 confusions; LLM latency; degraded count.
 */
import "./load-env";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { createDefaultRoutingEngine } from "@lex/legal-engine";
import { analyze } from "../index";
import { llmProviderName, selectChatProvider, type ProviderChoice } from "../models/select";
import { AllowlistCitationValidator } from "../rag/citation-validator";
import { InMemoryRetriever } from "../rag/retrieve";
import { CachingProvider } from "./cache-provider";
import { parseCsv } from "./csv";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

interface CaseResult {
  id: string;
  style: string;
  expected: { problemId: string; domain: string; red: boolean; firstAgency: string };
  predicted: { problemId: string | null; domain: string; riskLevel: string; routeType: string; firstAgency: string | null };
  degraded: boolean;
}

interface Counts {
  cases: number;
  problemId: number;
  domain: number;
  firstAgency: number;
  redTotal: number;
  redCaught: number;
}

const empty = (): Counts => ({ cases: 0, problemId: 0, domain: 0, firstAgency: 0, redTotal: 0, redCaught: 0 });
const pct = (a: number, b: number): number | null => (b ? Math.round((a / b) * 1000) / 10 : null);

function add(c: Counts, r: CaseResult): void {
  c.cases++;
  if (r.predicted.problemId === r.expected.problemId) c.problemId++;
  if (r.predicted.domain === r.expected.domain) c.domain++;
  if (r.predicted.firstAgency === r.expected.firstAgency) c.firstAgency++;
  if (r.expected.red) {
    c.redTotal++;
    if (r.predicted.riskLevel === "red") c.redCaught++;
  }
}

function metrics(c: Counts) {
  return {
    cases: c.cases,
    problemIdAccuracy: pct(c.problemId, c.cases),
    domainAccuracy: pct(c.domain, c.cases),
    redRecall: pct(c.redCaught, c.redTotal),
    redCases: c.redTotal,
    firstAgencyAccuracy: pct(c.firstAgency, c.cases),
  };
}

const STYLE_ORDER = ["rasmiy", "qisqa", "sheva", "aralash", "kirill"];
/** Free tier: at most 2 requests at once; `--concurrency 1` runs strictly one by one. */
const CONCURRENCY = Math.min(2, Math.max(1, Number(arg("concurrency") ?? 2) || 2));

/** Evenly spaced, deterministic sample (keeps the mix of problems and styles). */
function sample<T>(rows: readonly T[], limit: number | null): T[] {
  if (!limit || limit >= rows.length) return [...rows];
  return Array.from({ length: limit }, (_, i) => rows[Math.floor((i * rows.length) / limit)] as T);
}

/** Runs fn over items with at most `n` in flight, keeping input order in the output. */
async function pool<T, R>(items: readonly T[], n: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array<R>(items.length);
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      for (;;) {
        const i = next++;
        if (i >= items.length) return;
        out[i] = await fn(items[i] as T);
      }
    }),
  );
  return out;
}

async function evaluate(rows: readonly Record<string, string>[], chat: ProviderChoice): Promise<CaseResult[]> {
  const engine = createDefaultRoutingEngine();
  const deps = { retriever: new InMemoryRetriever(), citationValidator: new AllowlistCitationValidator(), chat };
  let done = 0;
  return pool(rows, chat.provider ? CONCURRENCY : 1, async (c) => {
    const analysis = await analyze({ text: c.hikoya as string }, deps);
    const { decision } = engine.route({ analysis });
    done++;
    if (chat.provider && done % 10 === 0) console.log(`  ${done}/${rows.length}`);
    return {
      id: c.id as string,
      style: c.uslub as string,
      expected: {
        problemId: c.problem_id as string,
        domain: c.soha as string,
        red: c.xavf === "qizil",
        firstAgency: c.birinchi_idora as string,
      },
      predicted: {
        problemId: analysis.classification.problemId,
        domain: analysis.classification.domain,
        riskLevel: analysis.risk.level,
        routeType: decision.routeType,
        firstAgency: decision.agencyId,
      },
      degraded: analysis.meta?.degraded ?? false,
    };
  });
}

function summarize(results: readonly CaseResult[]) {
  const total = empty();
  const byStyle = new Map<string, Counts>();
  for (const r of results) {
    add(total, r);
    if (!byStyle.has(r.style)) byStyle.set(r.style, empty());
    add(byStyle.get(r.style) as Counts, r);
  }
  const styles = [...byStyle.keys()].sort(
    (a, b) => (STYLE_ORDER.indexOf(a) + 1 || 99) - (STYLE_ORDER.indexOf(b) + 1 || 99) || a.localeCompare(b),
  );
  return {
    summary: metrics(total),
    perStyle: Object.fromEntries(styles.map((s) => [s, metrics(byStyle.get(s) as Counts)])),
    styles,
  };
}

const fmt = (v: number | null) => (v === null ? "—" : `${v}%`);

async function main(): Promise<void> {
  const file = join(__dirname, "datasets/test_cases.csv");
  const all = parseCsv(readFileSync(file, "utf8")).filter((c) => c.hikoya);
  const limitArg = arg("limit");
  const rows = sample(all, limitArg ? Number(limitArg) : null);

  const providerName = llmProviderName({ LLM_PROVIDER: arg("provider") ?? "keyword" });
  const keywordChoice: ProviderChoice = { name: "keyword", provider: null, unavailable: null };
  let chat = keywordChoice;
  let cache: CachingProvider | null = null;
  if (providerName !== "keyword") {
    const choice = selectChatProvider({ ...process.env, LLM_PROVIDER: providerName });
    if (!choice.provider) throw new Error(`${providerName} is not available: ${choice.unavailable ?? "unknown"}`);
    cache = new CachingProvider(choice.provider, join(__dirname, "cache"));
    chat = { ...choice, provider: cache };
  }

  console.log(`Hikoyalar: ${rows.length}/${all.length}, provider: ${chat.provider?.id ?? "keyword"}`);
  const t0 = Date.now();
  const results = await evaluate(rows, chat);
  const keywordResults = chat.provider ? await evaluate(rows, keywordChoice) : results;
  const main = summarize(results);
  const kw = summarize(keywordResults);

  console.table(
    Object.fromEntries(
      [["JAMI", main.summary] as const, ...main.styles.map((s) => [s, main.perStyle[s]] as const)].map(([name, m]) => [
        name,
        {
          Hikoyalar: m!.cases,
          problemId: fmt(m!.problemIdAccuracy),
          Soha: fmt(m!.domainAccuracy),
          "1-idora": fmt(m!.firstAgencyAccuracy),
          "Qizil recall": `${fmt(m!.redRecall)} (${m!.redCases})`,
        },
      ]),
    ),
  );

  const metricKeys = ["problemIdAccuracy", "domainAccuracy", "firstAgencyAccuracy", "redRecall"] as const;
  const comparison = chat.provider
    ? metricKeys.map((k) => ({ metric: k, keyword: kw.summary[k], llm: main.summary[k] }))
    : null;
  if (comparison) {
    console.log("Kalit so'z tasnifi bilan solishtirish (bir xil namuna):");
    console.table(Object.fromEntries(comparison.map((c) => [c.metric, { keyword: fmt(c.keyword), [providerName]: fmt(c.llm) }])));
  }

  const confusions = new Map<string, number>();
  for (const r of results) {
    if (r.predicted.problemId === r.expected.problemId) continue;
    const key = `${r.expected.problemId} -> ${r.predicted.problemId ?? "null"}`;
    confusions.set(key, (confusions.get(key) ?? 0) + 1);
  }
  const topConfusions = [...confusions.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, 10)
    .map(([pair, n]) => ({ pair, n }));
  if (chat.provider) {
    console.log("Eng ko'p adashgan 10 juftlik (kutilgan -> topilgan):");
    console.table(topConfusions);
  }

  const lat = [...(cache?.stats.liveLatencies ?? [])].sort((a, b) => a - b);
  const q = (p: number) => (lat.length ? (lat[Math.min(lat.length - 1, Math.floor(p * lat.length))] as number) : null);
  const latency = cache
    ? { liveCalls: lat.length, cacheHits: cache.stats.hits, p50: q(0.5), p90: q(0.9), max: lat.at(-1) ?? null }
    : null;
  const degraded = results.filter((r) => r.degraded).length;
  if (latency) {
    console.log(`Kechikish (jonli so'rovlar): ${JSON.stringify(latency)}; degraded: ${degraded}; vaqt: ${Math.round((Date.now() - t0) / 1000)} s`);
  }

  // Local calendar date (the team works in UTC+5; toISOString() would give the UTC day).
  const now = new Date();
  const date = [now.getFullYear(), now.getMonth() + 1, now.getDate()].map((n) => String(n).padStart(2, "0")).join("-");
  const label = arg("label") ?? (chat.provider ? providerName : "baseline");
  const suffix = limitArg ? `-n${rows.length}` : "";
  const out = resolve(arg("out") ?? join(__dirname, "reports", `${date}-${label}${suffix}.json`));
  const report = {
    label,
    classifier: chat.provider ? chat.provider.id : "keyword (ai/pipeline/classify.ts)",
    generatedAt: now.toISOString(),
    dataset: relative(join(__dirname, "../.."), file).replace(/\\/g, "/"),
    sample: { size: rows.length, of: all.length, ids: rows.map((r) => r.id) },
    summary: main.summary,
    perStyle: main.perStyle,
    keywordOnSameSample: chat.provider ? { summary: kw.summary, perStyle: kw.perStyle } : undefined,
    comparison,
    topConfusions,
    latency,
    degraded,
    errors: results.filter(
      (r) =>
        r.predicted.problemId !== r.expected.problemId ||
        r.predicted.firstAgency !== r.expected.firstAgency ||
        (r.expected.red && r.predicted.riskLevel !== "red"),
    ),
  };
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, `${JSON.stringify(report, null, 2)}\n`);
  console.log(`Hisobot: ${relative(process.cwd(), out)}`);
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e);
  process.exitCode = 1;
});
