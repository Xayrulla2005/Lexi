/**
 * BM25 keyword search over index chunks + Reciprocal Rank Fusion with the dense ranking.
 * No model, no network. Parameters are textbook defaults and were NOT tuned on the eval set.
 */
import { normalize } from "../pipeline/normalize";
import type { Chunk, LegalIndex, RetrievedChunk } from "./legal-index";

/** Crude stemming for an agglutinative language: keep the first STEM_LEN letters. */
export const STEM_LEN = 6;
const K1 = 1.2;
const B = 0.75;
/** RRF constant (Cormack et al., 2009). */
export const RRF_K = 60;

const STOPWORDS = new Set([
  "va", "bilan", "uchun", "bu", "u", "ular", "men", "meni", "menga", "ham", "yoki", "deb", "edi", "esa",
  "bir", "har", "shu", "ushbu", "mazkur", "lekin", "ammo", "agar", "qilib", "kabi", "emas", "bor", "yoq",
  "ga", "da", "dan", "ni", "ning", "nima", "qanday", "qayerga", "qilay", "kerak",
]);

/** Lowercase latin (Cyrillic transliterated), apostrophes dropped, stopwords removed, stemmed. */
export function tokenize(text: string): string[] {
  return normalize(text)
    .replace(/['ʻʼ‘’`]/g, "")
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 1 && !STOPWORDS.has(t))
    .map((t) => t.slice(0, STEM_LEN));
}

export class Bm25 {
  private readonly docs: { chunk: Chunk; tf: Map<string, number>; len: number }[];
  private readonly df = new Map<string, number>();
  private readonly avgLen: number;

  constructor(chunks: readonly Chunk[]) {
    this.docs = chunks.map((chunk) => {
      const tokens = tokenize(chunk.text);
      const tf = new Map<string, number>();
      for (const t of tokens) tf.set(t, (tf.get(t) ?? 0) + 1);
      for (const t of tf.keys()) this.df.set(t, (this.df.get(t) ?? 0) + 1);
      return { chunk, tf, len: tokens.length };
    });
    this.avgLen = this.docs.reduce((s, d) => s + d.len, 0) / Math.max(1, this.docs.length);
  }

  /** All chunks ranked by BM25 score (descending); chunks with score 0 are omitted. */
  rank(query: string): RetrievedChunk[] {
    const q = [...new Set(tokenize(query))];
    const n = this.docs.length;
    const scored = this.docs.map(({ chunk, tf, len }) => {
      let score = 0;
      for (const t of q) {
        const f = tf.get(t);
        if (!f) continue;
        const df = this.df.get(t) ?? 0;
        const idf = Math.log(1 + (n - df + 0.5) / (df + 0.5));
        score += (idf * f * (K1 + 1)) / (f + K1 * (1 - B + (B * len) / this.avgLen));
      }
      return { ...chunk, score };
    });
    return scored.filter((c) => c.score > 0).sort((a, b) => b.score - a.score);
  }
}

/** Reciprocal Rank Fusion of several rankings (each best-first). Score = Σ 1 / (RRF_K + rank). */
export function rrf(rankings: readonly (readonly RetrievedChunk[])[], k: number): RetrievedChunk[] {
  const fused = new Map<string, RetrievedChunk>();
  for (const ranking of rankings) {
    ranking.forEach((c, i) => {
      const prev = fused.get(c.id);
      const add = 1 / (RRF_K + i + 1);
      fused.set(c.id, { ...c, score: (prev?.score ?? 0) + add });
    });
  }
  return [...fused.values()].sort((a, b) => b.score - a.score).slice(0, k);
}

const bm25Cache = new WeakMap<LegalIndex, Bm25>();

/** BM25 over the chunks of an index (built once per index object). */
export function bm25For(index: LegalIndex): Bm25 {
  let bm = bm25Cache.get(index);
  if (!bm) {
    bm = new Bm25(index.chunks.map(({ vector: _v, ...c }) => c));
    bm25Cache.set(index, bm);
  }
  return bm;
}
