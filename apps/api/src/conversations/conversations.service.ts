import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import {
  analyzeWithArticles,
  answerMeansDanger,
  askFactQuestions,
  detectTriage,
  emergencyAgencyOrder,
  fieldContexts,
  getArticlesForProblem,
  isDontKnow,
  runIntake,
  type ProviderChoice,
  type RetrievedArticle,
} from "@lex/ai";
import {
  Conversation,
  type AgencyContact,
  type AnalysisResult,
  type ChatAction,
  type ChatCard,
  type LegalAnalysis,
  type RoadmapStep,
  type RoutingDecision,
  type SimCitizen,
} from "@lex/contracts";
import { EmergencyCallsService } from "../agency-gateway/emergency-calls.service";
import { SubmissionsService } from "../agency-gateway/submissions.service";
import { ApplicationsService } from "../applications/applications.service";
import { fieldKeys, loadTemplate } from "../applications/template";
import { CasesService } from "../cases/cases.service";
import { JsonStore } from "../common/json-store";
import { runtimeFile } from "../common/paths";
import { LegalRoutingService } from "../legal-routing/legal-routing.service";
import { ARTICLE_RETRIEVER, type ArticleRetriever, LLM_CHAT } from "../llm/llm.module";
import { OneIdSimulatorService } from "../sim/oneid.service";
import { LEXI } from "./lexi.texts";

/** Template fields filled automatically (OneID / server), never asked. */
const AUTO_FIELDS = new Set(["fio", "manzil", "telefon", "ariza_sanasi"]);
/** At most this many detail questions per conversation. */
const MAX_DETAIL_QUESTIONS = 4;
const OTHER_PARTY = "qarshi_taraf";

const yes = (t: string) => /^(ha|xa|ha,|да|yes|roziman|mayli|albatta)\b/i.test(t.trim());
const fieldLabel = (key: string) => key.replace(/_/g, " ");

/**
 * Lexi — the legal dispatcher. Server-side state machine per conversation
 * (persisted in data/runtime/conversations.json):
 *
 *   TRIAGE -> DETAILS -> EXPLAIN -> ROADMAP -> ACTION (with consent) -> TRACKING
 *
 * - Triage always comes first; a red keyword shows the emergency card at once.
 * - Facts are never invented: values come from the story (quoted) or the user's answers.
 * - Agencies, phones and deadlines come only from the catalog or cited articles.
 * - Nothing is sent without the user's explicit consent (application consent + ERI; emergency
 *   simulator calls need a confirmation click).
 * - The user's text is never logged.
 */
@Injectable()
export class ConversationsService {
  private readonly logger = new Logger(ConversationsService.name);
  private readonly store = new JsonStore<Conversation>(runtimeFile("conversations.json"), Conversation);

  constructor(
    @Inject(CasesService) private readonly cases: CasesService,
    @Inject(LegalRoutingService) private readonly routing: LegalRoutingService,
    @Inject(ApplicationsService) private readonly apps: ApplicationsService,
    @Inject(SubmissionsService) private readonly submissions: SubmissionsService,
    @Inject(EmergencyCallsService) private readonly calls: EmergencyCallsService,
    @Inject(OneIdSimulatorService) private readonly oneId: OneIdSimulatorService,
    @Inject(LLM_CHAT) private readonly chat: ProviderChoice,
    @Inject(ARTICLE_RETRIEVER) private readonly retriever: ArticleRetriever,
  ) {}

  // ------------------------------------------------------------------ public API

  async start(channel: Conversation["channel"]): Promise<Conversation> {
    const now = new Date().toISOString();
    const conv: Conversation = {
      id: randomUUID(),
      channel,
      citizenId: null,
      stage: "TRIAGE",
      story: "",
      caseId: null,
      problemId: null,
      triage: { signals: [], red: false, asked: false, danger: null },
      pending: null,
      queue: [],
      answers: [],
      understood: null,
      applicationId: null,
      submissionId: null,
      lastStatus: null,
      messages: [],
      createdAt: now,
      updatedAt: now,
    };
    this.say(conv, LEXI.greeting);
    return this.save(conv);
  }

  /** Current state; also turns submission status changes into Lexi messages (TRACKING). */
  async get(id: string, token?: string): Promise<Conversation> {
    const conv = this.load(id);
    this.bindCitizen(conv, token);
    const before = conv.messages.length;
    await this.refreshTracking(conv);
    return conv.messages.length !== before ? this.save(conv) : conv;
  }

  async message(id: string, text: string, token?: string): Promise<Conversation> {
    const conv = this.load(id);
    this.bindCitizen(conv, token);
    this.push(conv, "user", text, null, []);
    await this.handleText(conv, text);
    await this.refreshTracking(conv);
    return this.save(conv);
  }

  async action(id: string, action: string, token?: string): Promise<Conversation> {
    const conv = this.load(id);
    this.bindCitizen(conv, token);
    await this.handleAction(conv, action);
    await this.refreshTracking(conv);
    return this.save(conv);
  }

  // ------------------------------------------------------------------ state machine

  private async handleText(conv: Conversation, text: string): Promise<void> {
    if (!conv.story) {
      conv.story = text;
      return this.triage(conv);
    }
    const p = conv.pending;
    if (!p) {
      this.say(conv, LEXI.afterFlow);
      return;
    }
    switch (p.kind) {
      case "triage": {
        conv.pending = null;
        conv.triage.danger = answerMeansDanger(text);
        if (conv.triage.danger) this.emergencyCard(conv, LEXI.emergencyAfterAnswer);
        else this.say(conv, LEXI.safeOk);
        return this.classify(conv);
      }
      case "choose_problem": {
        conv.pending = null;
        const chosen = this.matchOption(text, p.options);
        return this.afterProblemChosen(conv, chosen);
      }
      case "field":
      case "fact":
        this.recordAnswer(conv, p.key ?? "", text);
        return this.nextQuestion(conv);
      case "offer":
        return yes(text) ? this.offerYes(conv) : this.offerNo(conv);
      case "escalate":
        return yes(text) ? this.escalateYes(conv) : this.escalateNo(conv);
      default:
        this.say(conv, LEXI.afterFlow);
    }
  }

  private async handleAction(conv: Conversation, action: string): Promise<void> {
    if (action === "offer_yes" && conv.pending?.kind === "offer") return this.offerYes(conv);
    if (action === "offer_no" && conv.pending?.kind === "offer") return this.offerNo(conv);
    if (action === "escalate_yes" && conv.pending?.kind === "escalate") return this.escalateYes(conv);
    if (action === "escalate_no" && conv.pending?.kind === "escalate") return this.escalateNo(conv);
    if (action === "call_cancel") {
      this.say(conv, LEXI.callCancelled);
      return;
    }
    const call = /^call:([a-z0-9_]+)$/.exec(action);
    if (call) {
      const agency = this.routing.agency(call[1] as string);
      if (!agency) throw new BadRequestException("Unknown agency");
      this.say(conv, LEXI.callConfirm(agency.name), null, [
        { label: LEXI.callConfirmYes, kind: "action", value: `call_confirm:${agency.id}` },
        { label: LEXI.callCancel, kind: "action", value: "call_cancel" },
      ]);
      return;
    }
    const confirm = /^call_confirm:([a-z0-9_]+)$/.exec(action);
    if (confirm) {
      // Consent: only after Lexi asked for this exact confirmation.
      const asked = conv.messages.some((m) => m.role === "lexi" && m.actions.some((a) => a.value === action));
      if (!asked) throw new BadRequestException("Confirmation was not requested");
      const created = await this.calls.create(confirm[1] as string, conv.story, conv.id, this.citizen(conv));
      this.say(conv, LEXI.callSent(created.agencyName), { type: "emergency_call", call: created });
      return;
    }
    throw new BadRequestException(`Action not available now: ${action}`);
  }

  // a) TRIAGE
  private async triage(conv: Conversation): Promise<void> {
    const t = detectTriage(conv.story);
    conv.triage.signals = t.signals;
    conv.triage.red = t.red;
    if (t.red) {
      conv.triage.danger = true;
      this.emergencyCard(conv, LEXI.emergencyRed);
      return this.classify(conv);
    }
    if (t.signals.length) {
      conv.triage.asked = true;
      conv.pending = { kind: "triage", key: null, question: LEXI.triageQuestion, options: [] };
      this.say(conv, LEXI.triageQuestion, null, [
        { label: LEXI.triageDanger, kind: "reply", value: LEXI.triageDanger },
        { label: LEXI.triageSafe, kind: "reply", value: LEXI.triageSafe },
      ]);
      return;
    }
    return this.classify(conv);
  }

  private emergencyCard(conv: Conversation, text: string): void {
    if (conv.messages.some((m) => m.card?.type === "emergency")) return;
    const contacts = emergencyAgencyOrder(conv.triage.signals as Parameters<typeof emergencyAgencyOrder>[0])
      .map((id) => this.routing.agency(id))
      .filter((a): a is AgencyContact => a !== null);
    const actions: ChatAction[] = [
      ...contacts.filter((a) => a.phone).map((a) => ({ label: `📞 ${a.phone} — ${a.name}`, kind: "tel" as const, value: a.phone as string })),
      ...contacts.map((a) => ({ label: LEXI.callButton(a.name), kind: "action" as const, value: `call:${a.id}` })),
    ];
    this.say(conv, text, { type: "emergency", contacts, signals: conv.triage.signals }, actions);
    this.say(conv, LEXI.emergencyContinue);
  }

  // classification + (optional) disambiguation
  private async classify(conv: Conversation): Promise<void> {
    conv.stage = "DETAILS";
    const c = this.cases.create(conv.channel, conv.citizenId);
    this.cases.addMessage(c.id, conv.story);
    const analyzed = await this.cases.analyze(c.id, { legalAnalysis: false });
    conv.caseId = c.id;
    const a = analyzed.analysis as AnalysisResult;
    if (a.risk.level === "red") {
      conv.triage.danger = true;
      this.emergencyCard(conv, LEXI.emergencyRed);
    }
    const problemId = a.classification.problemId;
    const candidates = a.meta?.candidates ?? [];
    if (!problemId && candidates.length) {
      const options = candidates.slice(0, 2);
      conv.pending = { kind: "choose_problem", key: null, question: LEXI.chooseProblem, options };
      this.say(conv, LEXI.chooseProblem, null, [
        ...options.map((id) => ({ label: this.routing.problemTitle(id) ?? id, kind: "reply" as const, value: this.routing.problemTitle(id) ?? id })),
        { label: LEXI.noneOfThem, kind: "reply", value: LEXI.noneOfThem },
      ]);
      return;
    }
    return this.afterProblemChosen(conv, problemId);
  }

  private matchOption(text: string, options: readonly string[]): string | null {
    const t = text.trim().toLowerCase();
    if (t === "1" || t === "2") return options[Number(t) - 1] ?? null;
    return options.find((id) => {
      const title = (this.routing.problemTitle(id) ?? id).toLowerCase();
      return t === title || t === id.toLowerCase() || (t.length > 6 && title.includes(t));
    }) ?? null;
  }

  /** Route with the confirmed problem; after an emergency the protection route is still shown. */
  private routeFor(conv: Conversation, problemId: string | null): RoutingDecision {
    const c = this.cases.get(conv.caseId as string);
    const a = c.analysis as AnalysisResult;
    const calm: AnalysisResult = {
      ...a,
      // The emergency card was already shown; the route below is the legal protection path.
      risk: { ...a.risk, level: a.risk.level === "red" ? "orange" : a.risk.level, requiresImmediateAction: false },
    };
    const d = problemId ? this.routing.decideFor(calm, problemId) : this.routing.decide({ ...calm, classification: { ...calm.classification, problemId: null } });
    this.cases.setRouting(c.id, d);
    return d;
  }

  // b) DETAILS
  private async afterProblemChosen(conv: Conversation, problemId: string | null): Promise<void> {
    conv.problemId = problemId;
    const d = this.routeFor(conv, problemId);
    const provider = this.chat.provider;
    if (d.routeType === "RULE_BASED" && d.templateId) {
      const template = await loadTemplate(d.templateId);
      const keys = fieldKeys(template).filter((k) => !AUTO_FIELDS.has(k));
      const res = await runIntake(provider, conv.story, fieldContexts(template, keys), d.title ?? "");
      for (const e of res.extracted) conv.answers.push({ key: e.key, label: fieldLabel(e.key), value: e.value, source: "hikoya" });
      conv.queue = res.questions
        .slice(0, MAX_DETAIL_QUESTIONS)
        .map((q) => ({ key: q.key, label: fieldLabel(q.key), question: q.question, kind: "field" as const }));
      conv.understood = res.understood;
    } else {
      const res = await askFactQuestions(provider, conv.story);
      conv.queue = res.questions
        .slice(0, MAX_DETAIL_QUESTIONS)
        .map((q, i) => ({ key: `fakt_${i + 1}`, label: q, question: q, kind: "fact" as const }));
      conv.understood = res.understood;
    }
    this.say(conv, `${LEXI.understood} ${this.understoodText(conv)}`);
    return this.nextQuestion(conv);
  }

  private understoodText(conv: Conversation): string {
    const parts = [conv.understood ?? conv.story.slice(0, 200)];
    for (const a of conv.answers.filter((x) => x.source === "javob")) {
      parts.push(`${a.label}: ${a.value ?? LEXI.unknownValue}.`);
    }
    return parts.join(" ").replace(/\s+/g, " ").trim();
  }

  private recordAnswer(conv: Conversation, key: string, text: string): void {
    const q = conv.pending;
    conv.pending = null;
    // Facts are labelled by their question (no template field behind them).
    const label = q?.kind === "fact" ? q.question : fieldLabel(key);
    conv.answers.push({ key, label, value: isDontKnow(text) ? null : text.trim(), source: "javob" });
    this.say(conv, `${LEXI.understood} ${this.understoodText(conv)}`);
  }

  private async nextQuestion(conv: Conversation): Promise<void> {
    const q = conv.queue.shift();
    if (q) {
      conv.pending = { kind: q.kind, key: q.key, question: q.question, options: [] };
      this.say(conv, q.question, null, [{ label: LEXI.dontKnow, kind: "reply", value: LEXI.dontKnow }]);
      return;
    }
    return this.explain(conv);
  }

  // c) EXPLAIN
  private async explain(conv: Conversation): Promise<void> {
    conv.stage = "EXPLAIN";
    const d = this.cases.get(conv.caseId as string).routingDecision as RoutingDecision;
    const onCatalog = d.routeType === "RULE_BASED" && !!conv.problemId;
    const facts = conv.answers.filter((a) => a.value).map((a) => `${a.label}: ${a.value}`);
    const fullStory = facts.length ? `${conv.story}\n\nQo'shimcha ma'lumotlar:\n${facts.join("\n")}` : conv.story;

    let articles: RetrievedArticle[] = [];
    try {
      articles = await this.retriever(fullStory, onCatalog ? conv.problemId : null);
    } catch (e) {
      this.logger.warn(`[lexi] retrieval failed (${(e as Error).name})`);
      articles = onCatalog && conv.problemId ? getArticlesForProblem(conv.problemId) : [];
    }
    const agencyOptions = onCatalog ? [] : this.routing.agencies().map((a) => ({ id: a.id, name: a.name }));
    let analysis: LegalAnalysis | null = null;
    if (this.chat.provider && (articles.length || agencyOptions.length)) {
      try {
        analysis = await analyzeWithArticles(this.chat.provider, fullStory, articles, null, agencyOptions);
      } catch (e) {
        this.logger.warn(`[lexi] explanation failed: ${(e as Error).message.slice(0, 100)}`);
      }
    }
    const hasClaims = !!analysis && analysis.rights.length + analysis.obligations.length + analysis.summary.length > 0;
    if (analysis && hasClaims) {
      const cited = new Set([...analysis.summary, ...analysis.rights, ...analysis.obligations, ...analysis.deadlines].flatMap((c) => c.citations));
      this.say(conv, LEXI.explainIntro, {
        type: "explanation",
        rights: [...analysis.summary, ...analysis.rights],
        obligations: analysis.obligations,
        deadlines: analysis.deadlines,
        articles: articles
          .filter((a) => cited.has(a.key))
          .map((a) => ({ key: a.key, article: a.article, title: a.title, document: a.document, sourceUrl: a.sourceUrl, text: a.text })),
      });
    } else if (onCatalog || conv.triage.signals.length) {
      this.say(conv, LEXI.noArticles);
    }
    return this.roadmap(conv, d, onCatalog, analysis);
  }

  // d) ROADMAP + e) ACTION offer
  private async roadmap(conv: Conversation, d: RoutingDecision, onCatalog: boolean, analysis: LegalAnalysis | null): Promise<void> {
    conv.stage = "ROADMAP";
    if (onCatalog) {
      const documents = d.templateId ? await this.templateDocuments(d.templateId) : [];
      const deadline = analysis?.deadlines[0]?.text ?? null;
      const steps: RoadmapStep[] = [{ order: 1, title: d.steps[0]?.action ?? d.title ?? "", agency: null, documents, deadline }];
      for (const a of d.agencies) {
        steps.push({ order: steps.length + 1, title: a.name, agency: a, documents: [], deadline: null });
      }
      const next = d.escalation[0];
      if (next) steps.push({ order: steps.length + 1, title: `Javob bo'lmasa: ${next.name}`, agency: next, documents: [], deadline: null });
      this.say(conv, LEXI.roadmapIntro, { type: "roadmap", steps, notYet: d.notYet, source: "catalog" });

      const target = d.agencies.find((a) => a.id === d.agencyId);
      if (d.templateId && target) {
        conv.stage = "ACTION";
        conv.pending = { kind: "offer", key: target.id, question: LEXI.offer(target.name), options: [] };
        this.say(conv, LEXI.offer(target.name), null, [
          { label: LEXI.yes, kind: "action", value: "offer_yes" },
          { label: LEXI.no, kind: "action", value: "offer_no" },
        ]);
      }
      return;
    }
    // Outside the catalog: agencies only from the catalog list the LLM picked (no route, no application).
    const picked = (analysis?.suggestedAgencyIds ?? [])
      .map((id) => this.routing.agency(id))
      .filter((a): a is AgencyContact => a !== null && a.id !== OTHER_PARTY);
    if (picked.length) {
      const steps = picked.map((a, i) => ({ order: i + 1, title: a.name, agency: a, documents: [], deadline: null }));
      this.say(conv, LEXI.roadmapLlmIntro, { type: "roadmap", steps, notYet: [], source: "llm" });
      this.say(conv, LEXI.noApplication);
      conv.stage = "DONE";
      return;
    }
    if (!conv.triage.signals.length && !(analysis && analysis.rights.length)) {
      // Not a legal question: the free legal advice line from the catalog.
      const adliya = this.routing.agency("adliya");
      this.say(conv, LEXI.notLegal, adliya ? { type: "roadmap", steps: [{ order: 1, title: adliya.name, agency: adliya, documents: [], deadline: null }], notYet: [], source: "catalog" } : null);
    }
    conv.stage = "DONE";
  }

  /** "Ilova: a, b, c." line of the application template. */
  private async templateDocuments(templateId: string): Promise<string[]> {
    const template = await loadTemplate(templateId);
    const line = /^Ilova:\s*(.+)$/m.exec(template)?.[1] ?? "";
    return line
      .replace(/\.\s*$/, "")
      .split(/,\s*/)
      .map((s) => s.trim())
      .filter((s) => s && !s.includes("{{"));
  }

  private async offerYes(conv: Conversation): Promise<void> {
    const citizen = this.citizen(conv);
    if (!citizen) {
      this.say(conv, LEXI.loginFirst, { type: "login", url: `/kirish?c=${conv.id}` });
      return;
    }
    conv.pending = null;
    let app = await this.apps.createForCase(conv.caseId as string, citizen);
    const manual = new Set(app.fields.filter((f) => f.source === "MANUAL").map((f) => f.key));
    const values: Record<string, string> = {};
    for (const a of conv.answers) if (a.value && manual.has(a.key)) values[a.key] = a.value;
    if (Object.keys(values).length) app = this.apps.updateFields(app.id, citizen.id, values);
    await this.apps.persist("lexi.application");
    conv.applicationId = app.id;
    conv.stage = "ACTION";
    this.say(conv, LEXI.applicationReady, { type: "application", applicationId: app.id });
  }

  private offerNo(conv: Conversation): void {
    conv.pending = null;
    conv.stage = "DONE";
    this.say(conv, LEXI.offerDeclined);
  }

  // f) TRACKING
  private async refreshTracking(conv: Conversation): Promise<void> {
    if (!conv.applicationId || !conv.citizenId) return;
    const app = this.apps.get(conv.applicationId);
    if (app.submissionId && app.submissionId !== conv.submissionId) {
      conv.submissionId = app.submissionId;
      conv.lastStatus = null;
      conv.stage = "TRACKING";
    }
    if (!conv.submissionId) return;
    const t = await this.submissions.tracking(conv.submissionId, conv.citizenId);
    if (t.status === conv.lastStatus) return;
    conv.lastStatus = t.status;
    const card: ChatCard = {
      type: "status",
      submissionId: t.id,
      receiptId: t.receiptId,
      agencyName: t.agencyName,
      status: t.status,
      cabinetUrl: `/idora?submission=${t.id}`,
    };
    const cabinet: ChatAction = { label: LEXI.cabinetLink, kind: "link", value: card.cabinetUrl };
    switch (t.status) {
      case "SUBMITTED":
        this.say(conv, LEXI.status.SUBMITTED(t.agencyName, t.receiptId), card, [cabinet]);
        break;
      case "RECEIVED":
        this.say(conv, LEXI.status.RECEIVED(t.agencyName), card, [cabinet]);
        break;
      case "IN_REVIEW":
        this.say(conv, LEXI.status.IN_REVIEW(t.agencyName), card, [cabinet]);
        break;
      case "ANSWERED":
        conv.stage = "DONE";
        this.say(conv, LEXI.status.ANSWERED(t.agencyName, t.response?.text ?? ""), card, [cabinet]);
        break;
      case "OVERDUE": {
        const next = this.cases.get(conv.caseId as string).routingDecision?.escalation[0];
        if (next && t.escalationApplicationId) {
          conv.pending = { kind: "escalate", key: t.escalationApplicationId, question: LEXI.status.OVERDUE(next.name), options: [] };
          this.say(conv, LEXI.status.OVERDUE(next.name), card, [
            { label: LEXI.yes, kind: "action", value: "escalate_yes" },
            { label: LEXI.no, kind: "action", value: "escalate_no" },
          ]);
        } else {
          this.say(conv, LEXI.status.OVERDUE_NO_NEXT, card, [cabinet]);
        }
        break;
      }
      case "ESCALATED":
        this.say(conv, LEXI.status.ESCALATED, card, [cabinet]);
        break;
    }
  }

  private escalateYes(conv: Conversation): void {
    const draftId = conv.pending?.key;
    conv.pending = null;
    if (!draftId) return;
    conv.applicationId = draftId;
    conv.submissionId = null;
    conv.lastStatus = null;
    conv.stage = "ACTION";
    this.say(conv, LEXI.escalateReady, { type: "application", applicationId: draftId });
  }

  private escalateNo(conv: Conversation): void {
    conv.pending = null;
    this.say(conv, LEXI.escalateDeclined);
  }

  // ------------------------------------------------------------------ helpers

  private bindCitizen(conv: Conversation, token: string | undefined): void {
    if (!token) return;
    try {
      conv.citizenId = this.oneId.session(token).citizen.id;
    } catch {
      // Unknown/expired simulator session: stay anonymous.
    }
  }

  private citizen(conv: Conversation): SimCitizen | null {
    return conv.citizenId ? this.oneId.citizen(conv.citizenId) : null;
  }

  private say(conv: Conversation, text: string, card: ChatCard | null = null, actions: ChatAction[] = []): void {
    this.push(conv, "lexi", text, card, actions);
  }

  private push(conv: Conversation, role: "user" | "lexi", text: string, card: ChatCard | null, actions: ChatAction[]): void {
    conv.messages.push({ id: randomUUID(), role, text, at: new Date().toISOString(), card, actions });
  }

  private load(id: string): Conversation {
    const c = this.store.get(id);
    if (!c) throw new NotFoundException("Conversation not found");
    return structuredClone(c);
  }

  private async save(conv: Conversation): Promise<Conversation> {
    conv.updatedAt = new Date().toISOString();
    const parsed = Conversation.parse(conv);
    this.store.set(parsed.id, parsed);
    await this.store.persist("conversation.save");
    return parsed;
  }
}
