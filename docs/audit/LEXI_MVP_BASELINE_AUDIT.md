# Lexi MVP — Baseline Repository Audit

Date: 2026-11-21 · Branch: `feat/lexi-intents` · HEAD: `59452617b7d429643b9393ad6b9322b181ad6180`
Scope: read-only audit. No source, config, lockfile or git state was changed; this file is the only file created.
`.env` was not opened (only its git-tracking status was checked). No secret values appear in this report.

---

## 1. Executive summary

The repository is a working **hackathon-grade demo** of the Lexi flow, not a production MVP. It runs from start to finish: chat → triage → intent → classification → cited explanation → roadmap → application → consent → simulated e-signature → simulated agency → tracking → escalation draft.

**What is real and reusable:**
- the Lexi conversation engine (server-side state machine);
- the deterministic legal router and a 65-problem catalog;
- the AI pipeline (Gemini plus an offline keyword fallback);
- citation filtering that drops invented references;
- template-based application drafts and the consent/sign/submit chain;
- zod contracts shared by API, web and bot;
- 181 automated tests (all passing) and a green CI pipeline.

**What is simulated or missing:**
- **Identity.** Users are 3 fictional citizens (OneID simulator); there is no real authentication.
- **Signatures and agencies.** ERI is a local Ed25519 simulator. The only agency connector is `MockAgencyAdapter`, and the agency cabinet has no authentication.
- **Persistence.** All state lives in JSON files under `data/runtime/`. The PostgreSQL entities are unused and there are no migrations.
- **Legal data review.** All 98 legal articles are `DRAFT`. 63 of 67 routes are `DRAFT`; the other 4 are `VERIFIED_PENDING`, none `VERIFIED`.
- **Not built at all:**
  - document upload;
  - audit/security events;
  - rate limiting and security headers;
  - the legal-professional marketplace;
  - speech-to-text.

**Biggest risks:**
- **Access control is capability-by-UUID.** Anyone with a conversation or case id can read it. Any session token rebinds a conversation to its own citizen.
- **The simulator agency cabinet** exposes submissions, citizen data and PDFs without authentication.
- **LLM-backed endpoints have no rate limit**, so the free Gemini quota can be drained.

---

## 2. Repository state

| Item | Value |
|---|---|
| Working dir | `D:\Project\lex-dispetcher` |
| Branch / HEAD | `feat/lexi-intents` / `5945261` "docs(reports): Lexi intents — flows, decisions, real Gemini transcripts" |
| `git status --short` | clean before and after all commands |
| Ahead of `main` | 6 commits (`a8c85e5`…`5945261`), not pushed |
| Tracked files | 422 |
| Package manager | pnpm 10.28.0 (`packageManager`), Node ≥ 22, `pnpm-lock.yaml` present |
| Workspaces | `apps/*`, `packages/*`, `ai`, `data/import` (`pnpm-workspace.yaml`) |
| CI | `.github/workflows/ci.yml`: install (frozen lockfile) → `gen:contracts --check` → `build:packages` → lint → typecheck → test → build → `import:data`. No secrets used. |
| Docker | `docker-compose.yml`: `pgvector/pgvector:pg16` and `redis:7-alpine` (dev). No Dockerfiles for the apps, no deployment config. Redis is not used by any code. |
| Root scripts | `lint`, `typecheck`, `test`, `build`, `build:packages`, `gen:contracts`, `dev:api/web/bot`, `mock` (Prism on `docs/api/openapi.yaml`), `import:data`, `eval:ai`, `rag:sources/index/query/eval` |

Top-level directories:
- `apps/{api,web,bot}`
- `packages/{contracts,legal-engine}`
- `ai/`
- `legal-knowledge/`
- `data/` (import, sim fixtures, agencies.csv)
- `docs/`
- `tests/` (integration specs and scenarios)
- `tools/legal-data/` (Python data tooling)

---

## 3. Actual architecture

```
apps/web (Next 15, client components) ─┐
apps/bot (grammY, polling)  ───────────┼─HTTP JSON─► apps/api (NestJS 10)
                                       │              ├─ conversations  (Lexi state machine)  ─┐
                                       │              ├─ cases / ai-analysis / legal-routing    │ uses
                                       │              ├─ legal-knowledge (retrieval, analysis)  │
                                       │              ├─ applications (template, intake, consent, ERI-sim sign, PDF)
                                       │              ├─ agency-gateway (AgencyGateway → MockAgencyAdapter, emergency-call sim, cabinet)
                                       │              ├─ case-tracking (GET /submissions/:id)
                                       │              ├─ sim (OneID simulator, ERI simulator)
                                       │              └─ database (TypeORM, only if DATABASE_URL; unused)
                                       │
          @lex/contracts (zod) ◄───────┴─ shared by api/web/bot
          @lex/legal-engine (catalog loader + DeterministicRoutingEngine)
          @lex/ai (providers, prompts, pipeline, RAG: bge-m3 ONNX + BM25 + RRF, in-memory index)
          legal-knowledge/ (catalog/problems.json, review-status.json, 98 article .md, 65 templates, index JSON)
State: JsonStore → data/runtime/{conversations,cases,applications,submissions,sessions,emergency-calls}.json (git-ignored)
```

**Component inventory**

| # | Component | Path | Responsibility | Status | Tests | MVP reuse |
|---|---|---|---|---|---|---|
| 1 | API bootstrap, health, common | `apps/api/src/{main,app.module}.ts`, `common/`, `health/` | CORS, graceful shutdown, ZodValidationPipe, JsonStore, timeouts, StepTimer | IMPLEMENTED | json-store.spec | Reuse |
| 2 | Lexi conversation engine | `apps/api/src/conversations/` (763-line service) | TRIAGE→INTENT→DETAILS→EXPLAIN→ROADMAP→ACTION→TRACKING; procedure, question and not_legal flows | IMPLEMENTED | `tests/integration/lexi.spec.ts` | Reuse (add ownership and persistence) |
| 3 | Cases | `apps/api/src/cases/` | Case CRUD, analyze, routing | PARTIALLY_IMPLEMENTED (JSON store, no auth, client-supplied `userId`) | cases.service.spec, api.spec | Modify |
| 4 | AI analysis adapter | `apps/api/src/ai-analysis/` | Wraps `@lex/ai.analyze` | IMPLEMENTED | via cases spec | Reuse |
| 5 | Legal knowledge | `apps/api/src/legal-knowledge/` | Retrieval and cited legal analysis; `POST /legal-knowledge/retrieve` | IMPLEMENTED | api.spec | Reuse (protect endpoint) |
| 6 | Legal routing | `apps/api/src/legal-routing/` + `packages/legal-engine` | Deterministic catalog routing, review notices | IMPLEMENTED | engine.test | Reuse |
| 7 | Action plans | `apps/api/src/action-plans/` | — | STUB (empty `@Injectable() class`) | none | Replace or remove (roadmap lives in conversations) |
| 8 | Applications | `apps/api/src/applications/` | Template fill, AI intake (≤3 questions), consent, simulated sign, PDF, escalation drafts | IMPLEMENTED (simulated identity) | applications.service.spec, template.spec | Reuse |
| 9 | Agency gateway (mock) | `apps/api/src/agency-gateway/` | `AgencyGateway` interface, `MockAgencyAdapter`, receipts, status history, OVERDUE→escalation | IMPLEMENTED as MOCK | mock-agency.adapter.spec, simulators.spec | Reuse interface, add real connectors |
| 10 | Case tracking | `apps/api/src/case-tracking/` | Owner-checked `GET /submissions/:id` | IMPLEMENTED | simulators.spec | Reuse |
| 11 | OneID / ERI simulators | `apps/api/src/sim/` | Fake login (3 citizens), Ed25519 test signatures | IMPLEMENTED as SIMULATOR | oneid/eri specs | Keep for demo; replace for production |
| 12 | Database | `apps/api/src/database/` | TypeORM module, 2 entities | STUB (entities unused, no migrations, only when `DATABASE_URL` is set) | none | Modify |
| 13 | Contracts | `packages/contracts` | zod schemas, generated catalog enums | IMPLEMENTED | contracts.test | Reuse (single owner) |
| 14 | AI pipeline | `ai/pipeline`, `ai/prompts`, `ai/models` | triage, normalize/transliterate, keyword and LLM classify, intake, facts, intents, legal analysis; Gemini provider with retries and a concurrency cap | IMPLEMENTED | 11 vitest files, 99 tests | Reuse |
| 15 | HuggingFace provider | `ai/models/huggingface.provider.ts` | Alternative LLM | UNKNOWN (not exercised live in this audit) | llm.test (mocked) | Optional |
| 16 | RAG | `ai/rag` | bge-m3 (local ONNX or HF), BM25, RRF, in-memory JSON index, catalog articles | PARTIALLY_IMPLEMENTED (no vector DB; 98 DRAFT articles; no procedure laws) | legal-index, bm25, catalog-retrieval tests | Modify |
| 17 | Legal knowledge data | `legal-knowledge/` | 65 problems, 67 review statuses, 98 articles, 65 templates | PARTIALLY_IMPLEMENTED (no route `VERIFIED`) | ai fetched-articles test, `import:data` | Reuse after lawyer review |
| 18 | Eval harness | `ai/eval` | 261-story dataset, LLM eval reports, cache | IMPLEMENTED | — | Reuse |
| 19 | Web chat | `apps/web/src/app/page.tsx`, `_parts/LexiChat.tsx`, `ChatCards.tsx` | Chat, cards (emergency, facts, roadmap, answer, status) | IMPLEMENTED | view.test | Reuse |
| 20 | Web application and review | `_parts/ApplicationPanel.tsx`, `SubmissionTracker.tsx` | Edit fields, consent, sign, submit, status | IMPLEMENTED (sim identity) | — | Reuse |
| 21 | Web agency cabinet | `apps/web/src/app/idora` | Simulated agency inbox | IMPLEMENTED (demo only) | — | Demo only |
| 22 | Web OneID login | `apps/web/src/app/kirish` | Pick a test citizen | IMPLEMENTED (simulator) | — | Replace |
| 23 | Legacy simulator page and API | `apps/web/src/app/simulator`, `simulator.controller.ts` | Old inbox list | IMPLEMENTED, legacy | — | Remove |
| 24 | Telegram bot | `apps/bot` | Same engine; inline buttons; tracking poll | PARTIALLY_IMPLEMENTED (in-memory chat map, no login, voice TODO) | lexi.test, reply.test | Modify |
| 25 | OpenAPI | `docs/api/openapi.yaml` | Mock server source | PARTIALLY_IMPLEMENTED (only 8 paths; conversations, applications, sim, legal-knowledge missing) | — | Regenerate |
| 26 | CI | `.github/workflows/ci.yml` | Full check pipeline | IMPLEMENTED | — | Reuse |
| 27 | Docker / deploy | `docker-compose.yml` | DB and Redis for dev | PARTIALLY_IMPLEMENTED | — | Create app images |
| 28 | Legal data tooling | `tools/legal-data/*.py` | Catalog and source build | UNKNOWN (not executed) | — | Reuse as tooling |
| 29 | Real authentication / users | — | — | MISSING | — | Create |
| 30 | Audit trail | submission `history[]`, `[timing]` logs | — | PARTIALLY_IMPLEMENTED (no AuditEvent store) | — | Create |
| 31 | Document upload / ApplicationDocument | — | — | MISSING (only the "Ilova:" line of templates lists documents) | — | Create |
| 32 | Real or sandbox agency connector | — | — | MISSING | — | Create |
| 33 | Security events / risk engine / anomaly detection | — | — | MISSING (`ai/pipeline/risk.ts` is *legal* risk) | — | Create |
| 34 | Legal marketplace | — | — | MISSING | — | Create |
| 35 | Speech-to-text | `SpeechToTextProvider` interface only | — | MISSING | — | Create (optional) |

**Counts:** IMPLEMENTED 17 · PARTIALLY_IMPLEMENTED 9 · STUB 2 · MISSING 5 · BROKEN 0 · UNKNOWN 2 (total 35).
The 17 IMPLEMENTED includes simulator-backed components 9, 11, 21 and 22, plus the legacy component 23.

---

## 4. Implemented features (verified by code and tests)

- **Conversation engine.**
  - Triage runs before anything else; a red keyword or a danger answer shows the emergency card from the catalog.
  - Emergency numbers (102/103/1146) appear only when there is a danger signal or orange/red risk.
- **Intents.** Each conversation is classified as dispute, procedure, question or not_legal. Low confidence shows three buttons; with no LLM, a regex fallback is used.
- **Classification.** Keyword classifier and Gemini structured classification (`classify.prompt.ts`, version 2026-11-20.2). Cyrillic input is transliterated first.
- **Deterministic routing** (`DeterministicRoutingEngine`): emergency override, catalog route or fallback. Human-review reasons are recorded.
- **Cited explanations.**
  - Claims must cite provided articles; others are dropped by `filterClaimCitations`. Duplicates are removed.
  - Procedure steps without a citation are flagged `general`.
  - Documents and deadlines are kept only if the cited article text supports them.
- **Application drafts.**
  - Deterministic templates (`legal-knowledge/templates`).
  - Field values come only from quoted story text or user answers (`quoteIsInStory`); at most 3 intake questions.
- **Consent gate.** Consent is stored server-side (`consentAt`) and reset whenever fields change.
- **Signing and submission.** Signing requires consent. Submission requires `consent: true` in the body, the stored consent, a valid signature and an agency equal to the routing decision.
- **Mock agency.** Receipts (`SIM-XX-00451`), status history, MANUAL/AUTO clock, OVERDUE detection, escalation draft (never auto-submitted).
- **Emergency call simulator.** Created only after an explicit `call_confirm` that Lexi actually offered.
- **Bot.** Renders the same cards; consent and signing are redirected to the web.

## 5. Partial implementations

- **Cases:** no ownership; client-supplied `userId`; JSON storage.
- **RAG:**
  - the in-memory index is rebuilt by a script, with no vector DB;
  - pgvector runs in compose but nothing uses it;
  - the article base lacks procedure laws (registration, inheritance procedure, civil service);
  - every article is `DRAFT`.
- **Legal data review:** 63 routes `DRAFT` and 4 `VERIFIED_PENDING`; the UI shows review notices.
- **Bot:**
  - `chats` map is in memory (`apps/bot/src/index.ts:20`); a restart loses chat↔conversation links;
  - no OneID binding;
  - voice is a TODO.
- **Audit:** only the per-submission `history[]` and timing logs.
- **OpenAPI:** stale (8 of ~35 routes).
- **Deploy:** no Dockerfiles or environment configuration for the apps.

## 6. Missing features

- Real authentication (OneID OAuth2/OIDC), user model, roles (citizen, agency, lawyer, admin).
- PostgreSQL persistence and migrations for every domain object.
- Document upload, `ApplicationDocument`, and document checklist validation against uploads.
- Any non-mock agency connector, credential storage, OAuth2 client credentials, mTLS, webhooks.
- AuditEvent and SecurityEvent stores; risk engine and anomaly detection.
- Rate limiting, security headers, idempotency keys.
- Marketplace: professionals, specialization, credential verification, location, availability, matching, consultations.
- Speech-to-text.
- Expected routes `POST /documents`, `POST /appeals`, `GET /appeals/:id/status` (see §8 for equivalents).

## 7. Broken components

None found. Lint, typecheck, all tests, build, `gen:contracts --check` and `import:data` pass.
Two components are dead or legacy rather than broken:
- `ActionPlansModule` (empty);
- `SimulatorController` + `/simulator` page (superseded by `/sim/idora` + `/idora`).

---

## 8. Backend / API findings

**Existing routes (actual):**

| Method | Path | Auth | Validation |
|---|---|---|---|
| GET | `/health` | none | — |
| POST | `/cases` | none | zod `CreateCaseRequest` (accepts arbitrary `userId`) |
| GET | `/cases/:id` | **none** | ParseUUID |
| POST | `/cases/:id/messages` | **none** | zod (≤5000 chars) |
| POST | `/cases/:id/analyze` | **none** | ParseUUID — triggers LLM |
| POST | `/legal-knowledge/retrieve` | **none** | zod — triggers embedding |
| POST | `/conversations` | none | zod |
| GET | `/conversations/:id` | optional sim session (no owner check) | ParseUUID |
| POST | `/conversations/:id/messages` | optional sim session (no owner check) | zod (≤5000) — triggers LLM |
| POST | `/conversations/:id/actions` | optional sim session (no owner check) | zod (≤100) |
| POST | `/cases/:id/application` | sim session | ParseUUID |
| GET | `/applications` | sim session | — |
| GET | `/applications/:id` | sim session and owner | ParseUUID |
| PATCH | `/applications/:id/fields` | sim session and owner | zod |
| POST | `/applications/:id/consent` | sim session and owner | zod `{consent:true}` |
| POST | `/applications/:id/intake` | sim session and owner | — triggers LLM |
| POST | `/applications/:id/answer` | sim session and owner | zod |
| POST | `/applications/:id/sign` | sim session and owner | requires consent |
| GET | `/applications/:id/verify`, `/applications/:id/pdf` | sim session and owner | — |
| POST | `/submissions` | sim session and owner | zod (`consent: true` literal) |
| GET | `/submissions/:id` | sim session and owner | ParseUUID |
| GET | `/simulator/:agencyId/submissions` | **none** (legacy) | — |
| GET/POST | `/sim/idora/...` (agencies, clock, inbox, calls, submissions/:id, pdf, status, respond, advance) | **none** | zod on bodies |
| GET/POST | `/sim/oneid/citizens`, `/login`, `/session` | none | zod |

**Expected endpoints:**

| Expected | Status | Actual equivalent |
|---|---|---|
| `POST /cases` | EXISTS | `cases.controller.ts:10` |
| `GET /cases/:id` | EXISTS (unauthenticated) | `cases.controller.ts:17` |
| `POST /cases/:id/analyze` | EXISTS (unauthenticated) | `cases.controller.ts:33` |
| `POST /documents` | MISSING | none (no upload anywhere) |
| `POST /appeals` | MISSING by name | `POST /cases/:id/application` (draft) + `POST /submissions` (send) |
| `GET /appeals/:id/status` | MISSING by name | `GET /submissions/:id` |

**Other findings:**
- **Two lifecycles exist:** `/cases` (older analysis API) and `/conversations` (the Lexi engine, which creates cases internally). Clients use conversations. Decide which one is canonical before Sprint 1 to avoid duplicate models.
- **`submissions` controllers:** `SubmissionsController` (POST) and `CaseTrackingController` (GET) share the prefix. Not a conflict, but split ownership.
- **Missing infrastructure:** no global guard, interceptor or exception filter; no OpenAPI generation (handwritten YAML is stale); no rate limiting; no idempotency keys.
- **Error handling:**
  - Nest default exceptions;
  - timeouts → 504 "Qayta urinib ko'ring";
  - LLM failures degrade to keyword logic.

## 9. Database findings

- **Actual storage:** `JsonStore` (in-memory map mirrored to `data/runtime/*.json`, atomic rename, git-ignored). Single-process only: no locking across instances, no transactions, no queries.
- **Encryption:** none; story text and citizen data are stored in plain text.
- **TypeORM:**
  - only connects when `DATABASE_URL` is set;
  - `synchronize: false`, no migrations directory, no migration files;
  - `CaseEntity` and `AgencySubmissionEntity` exist but are not used by any service.
- **Constraints:** no indexes, foreign keys or tenant isolation (except the `@Index` on `agency_submissions.caseId`).

| Entity | Actual implementation |
|---|---|
| User | MISSING — only `SimCitizen` (zod, fixtures in `data/sim/citizens.json`, fake PINFL) |
| Case | zod `Case` (`packages/contracts/src/case.ts`) + unused `CaseEntity` |
| Message | `CaseMessage` and `ConversationMessage` (embedded arrays) |
| LegalAnalysis | zod `legal-analysis.ts`, embedded in Case |
| Application | zod `Application` (`application.ts`), JSON store |
| ApplicationDocument | MISSING |
| Agency | `AgencyContact` from the catalog (`problems.json`) + `data/agencies.csv` (33 rows), read-only |
| AgencyConnector | `AgencyGateway` interface + `MockAgencyAdapter` (code, not data) |
| ApplicationReceipt | `receiptId` field inside `AgencySubmission` |
| ApplicationStatus | `SubmissionStatus` enum + `history[]` inside the submission |
| LegalProfessional, ProfessionalAvailability, Consultation | MISSING |
| AuditEvent, SecurityEvent | MISSING |

Do not create a second Case or Message model. Map the zod contracts to tables.

## 10. AI / legal engine findings

| Stage | Status | Where |
|---|---|---|
| user_problem | IMPLEMENTED | conversations `handleText` |
| legal_classification | IMPLEMENTED | `ai/pipeline/{classify,llm-classify}.ts`, `classify.prompt.ts` |
| clarification | IMPLEMENTED | `facts.ts` (dispute), `intents.ts:clarifyProcedure` (≤2), `intake.ts` (≤3) |
| legal_retrieval | PARTIALLY_IMPLEMENTED | `rag/catalog-retrieval.ts` (catalog articles + top-k RAG), `legal-index.ts` (bge-m3 + BM25 + RRF) |
| analysis | IMPLEMENTED | `legal-analysis.ts` + citation filter + dedupe |
| roadmap | IMPLEMENTED | dispute: catalog route steps; procedure: `planProcedure` with `validateStep` |
| application_draft | IMPLEMENTED | `apps/api/src/applications/template.ts` (deterministic) + AI intake |

- **Provider abstraction:** `ChatModelProvider` with Gemini (default; 2 concurrent, retries, 20 s timeout) and HuggingFace. `keyword` mode runs fully offline.
- **Tool calling:** none (LLM output is JSON only, validated with zod; the model never triggers actions).
- **Vector DB:** none (in-memory index file); pgvector is unused.
- **Eval:**
  - `ai/eval/run.ts`: 261-story dataset with cached reports. The latest n40 LLM evals are in `ai/eval/reports/`.
  - `rag:eval`: retrieval recall.
- **Legal response quality:**
  - **Cites sources:** yes. Only citations to provided articles survive; procedure steps without a citation are marked "umumiy yo'nalish".
  - **Facts vs assumptions:** facts are user quotes or answers; unknown values show "ma'lum emas". The explanation does not explicitly label assumptions.
  - **Fabricated references:** blocked in code (`filterClaimCitations`, `validateStep`, agency ids only from the catalog).
  - **Insufficient evidence:** the question flow says "not found"; a procedure without a plan points to the official source; routes with low confidence or `DRAFT` status show review notices.
  - **Guaranteed outcomes:** prompts forbid promises, but there is no automated check of output wording.
- **Weaknesses:**
  - Every article is `DRAFT`.
  - Procedure laws are missing, so procedure roadmaps are generic.
  - Real-Gemini results differ between runs (see `docs/reports/2026-11-20-intents.md`).
  - Tangential citations can pass the filter.

## 11. Government integration findings

| Capability | Classification | Evidence |
|---|---|---|
| Mock government agency | MOCK IMPLEMENTATION | `mock-agency.adapter.ts` ("Nothing leaves this process"), `adapterType: "MOCK"` |
| Secure connector architecture | DOCUMENTED ONLY (interface) | `AgencyGateway` interface; the module comment says a `RealAgencyAdapter` would be swapped in |
| Agency-specific credentials | NOT IMPLEMENTED | — |
| OAuth 2.0 | NOT IMPLEMENTED | — |
| mTLS | NOT IMPLEMENTED | — |
| Receipt and status tracking | MOCK IMPLEMENTATION | receipts `SIM-*`, status history, polling via `GET /submissions/:id` and conversation refresh |
| Retry / idempotency / webhooks | NOT IMPLEMENTED | double-submit guard is a non-atomic check (SEC-06) |
| OneID / ERI | MOCK IMPLEMENTATION | `sim/oneid.service.ts`, `sim/eri.service.ts` (Ed25519 test keys in git-ignored `data/sim/keys/`) |

There is **no real or sandbox government integration** in the code or configuration.

## 12. Security findings

No secrets were found in tracked files. The scan covered Google API keys, OpenAI/HF tokens, Telegram bot tokens, private-key PEM blocks, credentialed DB URLs and password literals (all tracked files except legal texts, PDFs and the lockfile).
`.env` exists locally, is ignored by `.gitignore:12` and is **not tracked**. `.env.example` holds only names and no secret values.
The Gemini key is passed to the SDK and never logged; provider errors omit request text and the key (`gemini.provider.ts`). User text is not logged anywhere in `apps/` or `ai/` runtime code.

**Severity summary:** CRITICAL 0 · HIGH 4 · MEDIUM 6 · LOW 4 · INFO 2.

| ID | Sev | Location | Evidence | Impact | Remediation |
|---|---|---|---|---|---|
| SEC-01 | HIGH | `apps/api/src/conversations/conversations.service.ts:126-149, 729-736` | `get/message/action` load a conversation by id only. `bindCitizen` sets `conv.citizenId` from **any** valid session token, overwriting a previous owner. | Anyone with a conversation id reads the full story and messages. A second citizen can take over a conversation and create an application from it. Ids travel in URLs (`/?c=<id>` at `apps/web/src/app/page.tsx:37`, `apps/bot/src/lexi.ts:60,88`). | Bind the owner once and reject a different citizen (403). Require the owner session for bound conversations. For anonymous ones, issue a separate secret conversation token (not the id) and stop putting ids in shareable URLs. |
| SEC-02 | HIGH | `apps/api/src/agency-gateway/agency-cabinet.controller.ts:22-96`, `simulator.controller.ts:10`, `agency-gateway.module.ts:21` | The cabinet controller has no guard and is always registered. Its comment says "No authentication". | Anyone can list every agency inbox and emergency call, read citizen data (FIO, PINFL, address, phone; fictional today), download signed PDFs, change status, respond and advance the clock. With real users this becomes CRITICAL. | Register sim controllers only when `SIM_MODE=true`. Add an agency-role guard. Remove the legacy `SimulatorController`. |
| SEC-03 | HIGH | `apps/api/src/main.ts:31-41` (no throttler); LLM-triggering routes listed in §8 | No rate limiting. Each conversation message can make several Gemini calls; `/legal-knowledge/retrieve` runs the embedding model. | Free-tier quota exhaustion (denial of service for all users) and CPU exhaustion. | Per-IP and per-session throttling (e.g. `@nestjs/throttler`, a new dependency needing approval), request body size limit, per-conversation message cap. |
| SEC-04 | HIGH | `apps/api/src/sim/oneid.service.ts:36-48`; system-wide | The only identity is a simulator: pick a citizen, get a UUID token. No real authentication or roles. | No real user can be authenticated or authorized; it blocks every production use. | OneID OIDC adapter behind an `AuthProvider` interface; a `CurrentUser` guard; roles. |
| SEC-05 | MEDIUM | `apps/api/src/cases/cases.controller.ts:10-39` | `/cases*` endpoints have no auth; `userId` comes from the request body (line 12). | Case stories are readable and editable by id; `userId` can be spoofed. | Derive the user from the session; enforce ownership or retire the `/cases` API in favour of conversations. |
| SEC-06 | MEDIUM | `apps/api/src/agency-gateway/submissions.service.ts:50, 81-83` | The `submissionId` check and `markSubmitted` are separated by awaits (pdf, verify, gateway). | Two concurrent `POST /submissions` for one application can both reach the gateway (double submission). | Atomic state transition (DB row lock or a `SUBMITTING` status) plus an `Idempotency-Key` header. |
| SEC-07 | MEDIUM | `apps/api/src/sim/oneid.service.ts:19, 44-48` | Session tokens never expire and are persisted in plain text to `data/runtime/sessions.json`. | A stolen token is valid forever. | TTL and expiry, logout, store a token hash. |
| SEC-08 | MEDIUM | `apps/api/src/common/json-store.ts`; `common/paths.ts:15-19` | Stories, applications, citizen data and packages are stored unencrypted on disk. | PII at rest without protection or retention policy. | PostgreSQL with column encryption for PII, a retention policy, PII minimization in `caseInfo`. |
| SEC-09 | MEDIUM | `apps/api/src/legal-knowledge/legal-knowledge.controller.ts:18-21` | Public `POST /legal-knowledge/retrieve` runs an embedding search. | CPU denial of service; not needed by clients. | Remove from public routes or guard and throttle it. |
| SEC-10 | MEDIUM | `legal-knowledge/catalog/review-status.json`; `legal-knowledge/articles/**` | 63 DRAFT and 4 VERIFIED_PENDING routes; all 98 articles DRAFT. | Users receive legal guidance not checked by a lawyer (UI notices exist). | Lawyer review workflow; show only reviewed routes in production. |
| SEC-11 | LOW | `apps/api/src/main.ts`; `apps/web/next.config.mjs` | No security headers (helmet, CSP, frame-ancestors, HSTS). | Clickjacking and weaker XSS defence. | Add helmet to the API and a `headers()` CSP in Next. |
| SEC-12 | LOW | prompts in `ai/prompts/*`, `ai/pipeline/{facts,intents}.ts` | The story is wrapped in `<<< >>>` with "data, not instructions"; output is zod-validated and citations filtered; no tools. | Prompt injection can still bias text and labels, but cannot trigger actions or invent citations. | Keep; add injection cases to the eval set; strip delimiter sequences from user text. |
| SEC-13 | LOW | `docker-compose.yml:6` | A dev DB password literal is tracked (`POSTGRES_PASSWORD`, dev-only value). | Copy-paste into a real environment. | Read it from env in compose; document that the value is dev-only. |
| SEC-14 | LOW | `apps/bot/src/index.ts:20, 96-104` | The chat↔conversation map is in memory; the tracking poll reads conversations without a session. | Lost links on restart; the bot cannot do authorized steps (signing is redirected to the web). | Persist the map; link the Telegram user to the account after web login. |
| SEC-15 | INFO | `apps/api/src/conversations/conversations.service.ts:223-230` | Emergency simulator calls need a Lexi-offered `call_confirm`. | Good: consent enforced server-side. | Keep; add AuditEvent. |
| SEC-16 | INFO | `submissions.controller.ts:14-25`, `applications.service.ts:147-217` | Consent is required in the body and stored; it resets on field change; signing needs consent; the agency must match routing. | Good: AI cannot submit. | Keep as invariants in the new lifecycle. |

Not observed:
- SQL injection (no SQL in use);
- path traversal (template ids and citizen ids are slug-validated: `eri.service.ts` `^[a-z0-9_]+$`);
- XSS sinks (no `dangerouslySetInnerHTML`/`innerHTML`/`eval` in web or bot);
- SSRF (no user-controlled outbound URLs);
- CSRF (header token, no cookies);
- insecure CORS (allowlist from `CORS_ORIGIN`, default `http://localhost:3000`).

Dependency audit was not run (`pnpm audit` contacts the registry; not done in a read-only audit).

## 13. Frontend / bot findings

| Area | State |
|---|---|
| Chat interface | Usable (`/`): messages, buttons, cards, polling, scroll fix applied (`a8c85e5`) |
| Legal roadmap UI | Usable: steps, agencies, citation tags, "umumiy yo'nalish" badge, answer card |
| Application form and review | Usable (`ApplicationPanel`): fields, intake questions, consent checkbox, sign, PDF view, submit |
| Receipt and status view | Usable (`SubmissionTracker`, status cards in chat) |
| Professional marketplace | Missing |
| Authentication flow | Simulator only (`/kirish`); session in `sessionStorage` (`apps/web/src/lib/session.ts`) |
| Agency cabinet | `/idora` (simulator, public) |
| Consent and privacy UX | Consent before signing and submission; emergency call confirmation. No privacy notice or data-retention text; no consent for processing the story itself. |
| Telegram bot | `/start`, text messages, inline callbacks, tracking poll. Signing is redirected to the web. Voice replies "soon". No `/help`, `/privacy` or `/delete`. Not tested end-to-end in Telegram. |

## 14. Verification results

All commands were run from the repo root with existing dependencies. Nothing was installed. `git status --short` was clean afterwards. Build outputs (`dist/`, `.next/`) are git-ignored.

| Command | Exit | Result |
|---|---|---|
| `pnpm lint` | 0 | PASS (no warnings printed) |
| `pnpm typecheck` | 0 | PASS (all 7 workspaces) |
| `pnpm test` | 0 | PASS. ai 99/99 (11 files); api 45/45 (10 suites, including integration specs `api`, `lexi`, `simulators`). contracts, legal-engine, web and bot suites also passed (re-run per package: 1, 1, 1 and 2 files; counts not captured in this run). |
| `pnpm build` | 0 | PASS (Next: 5 static routes; api, ai and packages tsc) |
| `pnpm gen:contracts --check` | 0 | PASS ("up to date (19 domains, 65 problems)") |
| `pnpm import:data` | 0 | PASS (agencies.csv 33/33; test_cases.csv 261/261, matches catalog) |
| E2E (browser) | — | NOT AVAILABLE (no e2e suite in the repo) |
| Real Gemini | — | Not run in this audit (latest run documented in `docs/reports/2026-11-20-intents.md`) |

An attempt to run all checks as one background batch was blocked by the session's permission classifier. The checks were then run one by one as listed above.

---

## 15. MVP reuse matrix

### Sprint 1 — Lexi Core

| Capability | Existing implementation | Status | Action | Dependencies |
|---|---|---|---|---|
| Legal chat | `conversations/*`, web `LexiChat`, bot | IMPLEMENTED | Reuse + ownership fix (SEC-01) | Auth guard |
| Legal classification | `ai/pipeline/{classify,llm-classify,intents}.ts` | IMPLEMENTED | Reuse; extend eval | Eval set |
| Legal roadmap | catalog routes + `planProcedure` | IMPLEMENTED (DRAFT data) | Reuse; lawyer review; add procedure laws | Legal data |
| RAG | `ai/rag/*` in-memory | PARTIALLY_IMPLEMENTED | Modify: pgvector `VectorStore` impl, more sources | DB |
| Application draft | `applications/template.ts`, `intake.ts` | IMPLEMENTED | Reuse | — |
| Document checklist | template "Ilova:" line, procedure steps `documents` | PARTIALLY_IMPLEMENTED | Create structured checklist per template | ApplicationDocument |

### Sprint 2 — Application Gateway

| Capability | Existing implementation | Status | Action | Dependencies |
|---|---|---|---|---|
| Application lifecycle | `Application` + `AgencySubmission` statuses | IMPLEMENTED (JSON store) | Modify: DB tables, explicit state machine | DB, migrations |
| User confirmation | consent + sign gates | IMPLEMENTED | Reuse | Auth |
| Mock agency connector | `MockAgencyAdapter` | IMPLEMENTED | Reuse behind `SIM_MODE` | — |
| Submission | `SubmissionsService.submit` | IMPLEMENTED | Modify: idempotency, atomic transition (SEC-06) | DB |
| Receipt | `receiptId` | MOCK | Modify: `ApplicationReceipt` entity | DB |
| Status tracking | `GET /submissions/:id`, conversation tracking | IMPLEMENTED | Reuse; add webhook/poll interface | Connector |
| Audit trail | submission `history[]` only | PARTIALLY_IMPLEMENTED | Create `AuditEvent` (append-only) | DB |

### Sprint 3 — Security and AI Security

| Capability | Existing implementation | Status | Action | Dependencies |
|---|---|---|---|---|
| PII minimization | fictional citizens; full citizen object in package | MISSING | Create: minimal `caseInfo`, retention | DB |
| Encryption | none | MISSING | Create: column encryption, TLS config | DB, KMS decision |
| API security | zod validation, CORS allowlist | PARTIALLY_IMPLEMENTED | Create: guards, throttling, helmet | Auth |
| Prompt injection screening | delimiters + output validation | PARTIALLY_IMPLEMENTED | Modify: screening step + eval cases | Eval |
| Tool authorization | no LLM tools; actions are server-side buttons | IMPLEMENTED (by design) | Keep invariant | — |
| Security events | none | MISSING | Create `SecurityEvent` | DB |
| Risk engine | legal risk only (`risk.ts`) | MISSING (security risk) | Create | SecurityEvent |
| Anomaly detection | none | MISSING | Create (after events exist) | Risk engine |

### Sprint 4 — Legal Marketplace

| Capability | Existing implementation | Status | Action | Dependencies |
|---|---|---|---|---|
| Professional profiles | none | MISSING | Create | Auth (lawyer role), DB |
| Specialization | `LegalDomain` enum in contracts (19 domains) | PARTIALLY_IMPLEMENTED | Reuse enum | — |
| Credential verification workflow | none | MISSING | Create (admin review) | Auth roles, AuditEvent |
| Location | none (agencies have no geo) | MISSING | Create | — |
| Availability | none | MISSING | Create | DB |
| Matching | none (routing picks agencies only) | MISSING | Create (domain + location + availability) | Profiles |
| Consultation requests | none | MISSING | Create (consent-gated like submissions) | Matching |

## 16. Sprint dependency plan

```
S0 Foundation (blocking): Auth abstraction + ownership guards ─► DB persistence + migrations ─► AuditEvent
   │
   ├─► S1 Lexi Core: canonical lifecycle (conversations→cases), checklist, RAG on pgvector, lawyer review flags
   ├─► S2 Gateway: ApplicationDocument, atomic submit + idempotency, Receipt entity, connector interface v2 (credentials, OAuth2/mTLS config slots), SIM_MODE gating
   ├─► S3 Security: throttling, headers, PII minimization, encryption, SecurityEvent, risk engine (needs S0 audit + S2 lifecycle events)
   └─► S4 Marketplace: needs roles (S0) + DB (S0) + consent pattern (S2)
```

## 17. Multi-agent implementation plan

**Rules:**
- One owner per path.
- Shared files are changed only by their owner, through a contract PR (a small change agreed first).
- Agents never edit `.env` or `.env.example`; new env names are proposed to the maintainer.
- Text files owned by other teammates are append-only (new keys only):
  - `apps/web/src/content/texts.uz.ts`
  - `apps/bot/src/texts.uz.ts`
  - `apps/bot/src/keyboards.ts`

| Agent | Responsibility | May modify | Must not modify |
|---|---|---|---|
| A0 Contracts owner | zod schemas for new entities and API payloads | `packages/contracts/**` | everything else |
| A1 Platform | Auth abstraction, guards, DB, migrations, throttling, headers | `apps/api/src/{auth,database,common}/**` (auth is new), `apps/api/src/main.ts`, `apps/api/src/app.module.ts`, `apps/api/migrations/**` (new) | feature modules |
| A2 Lexi engine | Conversations and cases on the new persistence; ownership | `apps/api/src/{conversations,cases,ai-analysis,legal-knowledge,legal-routing,action-plans}/**` | `ai/**`, contracts |
| A3 AI / legal | Pipeline, RAG on pgvector (`VectorStore`), eval, injection cases | `ai/**`, `packages/legal-engine/**`, `legal-knowledge/{articles,index,sources}/**` | `legal-knowledge/catalog/review-status.json` (lawyers only) |
| A4 Gateway | Applications, documents, submissions, receipts, connectors, sim gating | `apps/api/src/{applications,agency-gateway,case-tracking,sim,documents}/**` (documents is new) | conversations |
| A5 Security | AuditEvent/SecurityEvent services, risk engine, PII policy | `apps/api/src/{audit,security}/**` (new), `docs/architecture/security.md` | common, main.ts (ask A1) |
| A6 Web | UI for all of the above | `apps/web/**` (texts: append-only) | API |
| A7 Bot | Persistence of the chat map, account link, new cards | `apps/bot/**` (texts/keyboards: append-only) | API |
| A8 Marketplace (Sprint 4) | Professionals, availability, matching, consultations | `apps/api/src/{professionals,consultations}/**` (new) | others |

**Serialized shared files** (one change at a time, owner listed):
- `package.json`, `pnpm-lock.yaml` (A1; new dependencies need maintainer approval);
- `apps/api/src/app.module.ts` (A1);
- `packages/contracts/src/index.ts` (A0);
- `tests/integration/*.spec.ts` (each agent adds a new spec file instead of editing others');
- `docs/api/openapi.yaml` (A1, generated);
- `.github/workflows/ci.yml` (A1).

**Contracts between agents:**
- `AuthProvider` and `CurrentUser` (A1 → all);
- repository interfaces per entity (A1 → A2/A4/A5/A8);
- `AuditSink.record(event)` (A5 → A2/A4/A8);
- `AgencyGateway` v2 (A4);
- `VectorStore` (A3).

**Checkpoints:**
1. Contracts merged.
2. Auth and DB skeleton with tests green.
3. Feature modules moved to repositories.
4. UI wired.
5. Security pass.

Verify every checkpoint with: `pnpm lint && pnpm typecheck && pnpm test && pnpm build && pnpm gen:contracts --check && pnpm import:data`.

## 18. Critical blockers

1. **Identity.** No real authentication and no ownership on conversations and cases (SEC-01, SEC-04, SEC-05).
2. **Persistence.** No database persistence or migrations; JSON files are single-process and unencrypted (SEC-08).
3. **Simulator exposure.** Simulator endpoints are public and always on (SEC-02).
4. **Unreviewed legal content.** No route is `VERIFIED`; procedure laws are missing from the knowledge base.
5. **Government integration.** No real or sandbox agency integration, credentials or specifications exist. Sprint 2 can only target the mock until agency API access is obtained.

## 19. Recommended first implementation task

**"Ownership and access foundation" (A1 + A2, about 1–2 days):**
1. An `AuthProvider` interface with the existing OneID simulator as the first implementation, plus a `CurrentCitizen` guard/decorator.
2. Bind a conversation's owner once. Reject access from another citizen (403). Give anonymous conversations a separate secret token instead of the bare id. Stop putting ids in shareable URLs.
3. Register `/sim/*` and `/simulator/*` controllers only when `SIM_MODE=true`; delete the legacy `SimulatorController`.
4. Integration tests: cross-citizen access is denied; the cabinet is absent when `SIM_MODE` is off.

This closes the three highest-impact findings without new dependencies. It also defines the user and ownership seam that the database, audit and marketplace work all depend on.
