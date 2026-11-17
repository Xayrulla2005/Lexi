# Shared contracts (`@lex/contracts`)

Source: [`packages/contracts/src`](../../packages/contracts/src). Each contract is a
zod schema and a TypeScript type with the same name:

```ts
import { AnalysisResult } from "@lex/contracts";        // schema (runtime)
import type { AnalysisResult } from "@lex/contracts";   // type (compile time)
AnalysisResult.parse(untrusted);                         // throws if invalid
```

HTTP endpoints using these shapes: [openapi.yaml](openapi.yaml).

## AnalysisResult — produced by `ai/`

| Field | Type | Notes |
| --- | --- | --- |
| `schemaVersion` | `"2.0"` | Bump on breaking change. |
| `caseSummary` | `string` | Neutral summary. |
| `classification` | `Classification` | See below. |
| `risk` | `RiskAssessment` | See below. |
| `facts` | `{ statement, source: "USER_REPORTED" \| "ASSUMPTION" }[]` | Separates what the user said from what the model inferred. |
| `missingInformation` | `string[]` | Gaps that block a reliable answer. |
| `legalReferences` | `LegalReference[]` | Only retrieved documents (enforced by `CitationValidator`). |
| `followUpQuestions` | `string[]` | Short clarification questions. |
| `needsHumanReview` | `boolean` | Low confidence, unknown problem type or complex case. |

### Classification

| Field | Type |
| --- | --- |
| `domain` | `LegalDomain` — the 19 catalog domains (`sohalar`: `fuqarolik_nizo`, `mehnat`, …, `jamoat_tartibi`) |
| `problemId` | `ProblemId` (`"P01"` … `"P65"`) \| `null` — `null` routes to the fallback |
| `confidence` | `number` in [0, 1] |

The AI classifies only; it never returns an agency. `LegalDomain` and `ProblemId` are generated from
`legal-knowledge/catalog/problems.json` into `packages/contracts/src/generated/catalog.ts` by
`pnpm gen:contracts` (CI runs `pnpm gen:contracts --check`).

### RiskAssessment

| Field | Type |
| --- | --- |
| `level` | `"green" \| "yellow" \| "orange" \| "red"` — same values as the catalog `xavf`; `red` forces EMERGENCY |
| `signals` | `string[]` |
| `requiresImmediateAction` | `boolean` — forces the EMERGENCY route |

### LegalReference

| Field | Type |
| --- | --- |
| `documentId` | `string \| null` — id in `legal-knowledge/` when a source document exists; `null` for catalog citations |
| `documentName` | `string` — citation text as in the source (catalog: the full `qonunlar` entry) |
| `article` | `string \| null` |
| `sourceUrl` | `string` (URL) \| `null` |
| `status` | `ReviewStatus`: `"DRAFT" \| "VERIFIED_PENDING" \| "VERIFIED"` |
| `lastVerifiedAt` | ISO date-time \| `null` |

## RoutingDecision — produced only by `@lex/legal-engine`

| Field | Type | Notes |
| --- | --- | --- |
Built from `legal-knowledge/catalog/problems.json`; every text, phone and law is copied verbatim from the catalog.

| Field | Type | Notes |
| --- | --- | --- |
| `routeType` | `"EMERGENCY" \| "RULE_BASED" \| "FALLBACK"` | red risk → EMERGENCY; `problemId` → RULE_BASED; otherwise FALLBACK |
| `routeId` | `string \| null` | `P01`–`P65` or `EMERGENCY`; `null` for FALLBACK |
| `problemId` | `ProblemId \| null` | `null` for EMERGENCY/FALLBACK |
| `title` | `string \| null` | catalog `nom` |
| `agencyId` | `string \| null` | First route agency that is not `qarshi_taraf`; `null` for FALLBACK |
| `steps` | `RouteStep[]` | `{ order, action, agencyId, deadlineDays, documentTemplateId }`; step 1 = `birinchi_qadam` (with `documentTemplateId`), step 2 = "Javob bo'lmasa: <first escalation agency>"; agencies are not repeated as steps |
| `agencies` | `AgencyContact[]` | `{ id, name, phone, link }` — catalog `organlar` |
| `escalation` | `AgencyContact[]` | catalog `eskalatsiya` |
| `legalReferences` | `LegalReference[]` | catalog `qonunlar`, always `DRAFT` |
| `templateId` | `string \| null` | catalog `shablon_id` (`T01`…) |
| `reviewStatus` | `ReviewStatus` | from `legal-knowledge/catalog/review-status.json` |
| `reviewNotice` | `string \| null` | User-facing warning; `null` only for VERIFIED |
| `requiresHumanReview` | `boolean` | True unless the route is VERIFIED and the analysis is confident |

`deadlineDays` must stay `null` unless backed by a VERIFIED source. `AgencyContact.phone` and `link` are catalog strings (`link` may be an app name, not a URL).

## Case

| Field | Type |
| --- | --- |
| `id` | UUID |
| `userId` | `string \| null` — pseudonymous channel id |
| `channel` | `"web" \| "bot"` |
| `status` | `"OPEN" \| "ANALYZED" \| "SUBMITTED" \| "CLOSED"` |
| `messages` | `CaseMessage[]` |
| `analysis` | `AnalysisResult \| null` |
| `routingDecision` | `RoutingDecision \| null` |
| `createdAt`, `updatedAt` | ISO date-time |

## AgencySubmission

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `caseId`, `applicationId` | UUID | |
| `agencyId`, `agencyName` | `string` | catalog agency |
| `adapterType` | `"MOCK" \| "OFFICIAL"` | Only `MOCK` exists. |
| `status` | `"SUBMITTED" \| "RECEIVED" \| "IN_REVIEW" \| "ANSWERED" \| "OVERDUE" \| "ESCALATED"` | SUBMITTED → RECEIVED → IN_REVIEW → ANSWERED, or … → OVERDUE → ESCALATED |
| `receiptId` | `string` | Simulator receipts start with `SIM-`. |
| `submittedAt` | ISO date-time | |
| `dueAt` | ISO date-time \| `null` | `SIM_RESPONSE_DAYS` × `DEMO_SPEED` — simulated, not a legal deadline. |
| `simulatedDays`, `responseDays` | `number` | simulated days elapsed / deadline (`SIM_RESPONSE_DAYS`) |
| `history` | `{ status, at }[]` | |
| `response` | `{ text, respondedAt } \| null` | agency answer |

Clock: without `DEMO_SPEED` (default) the simulator clock is MANUAL — `dueAt` is `null` and days move only with `POST /sim/idora/submissions/:id/advance` (+15 days, cabinet button); with `DEMO_SPEED` it is AUTO. `GET /sim/idora/clock` → `SimClock`.

`SubmissionTracking` (`GET /submissions/:id`, citizen) adds `escalationApplicationId`: the draft prepared after OVERDUE (never auto-submitted).

`SubmissionPackage` (what the gateway receives): `pdfBase64` (ariza.pdf, exactly the signed bytes), `signature` (`EriSignature`), `caseInfo` (ish-malumoti: `problemId`, `title`, `facts`, `fields`), `consentAt`, `citizen` (`SimCitizen`).

## Application (SIMULATOR flow)

| Field | Type | Notes |
| --- | --- | --- |
| `id`, `caseId` | UUID | |
| `kind` | `"PRIMARY" \| "ESCALATION"` | |
| `parentSubmissionId` | UUID \| `null` | ESCALATION: the overdue submission |
| `citizenId` | `string` | OneID simulator test citizen |
| `templateId` | `string` | `legal-knowledge/templates/<id>.md` |
| `agency` | `AgencyContact` | receiving agency |
| `template` | `string` | template text, unchanged (leading comment removed) |
| `fields` | `{ key, value, source: "ONEID" \| "SYSTEM" \| "MANUAL" }[]` | |
| `missingFields` | `string[]` | |
| `consentAt` | ISO date-time \| `null` | reset when a field changes |
| `signature` | `EriSignature \| null` | `{ simulated: true, algorithm: "Ed25519", hashAlgorithm: "SHA-256", digest, signature, publicKey, signerCitizenId, signedAt }` |
| `submissionId` | UUID \| `null` | |

## Request contracts

| Schema | Used by |
| --- | --- |
| `CreateCaseRequest` `{ channel?, userId? }` | `POST /cases` |
| `AddMessageRequest` `{ text }` | `POST /cases/:id/messages` |
| `SimLoginRequest` `{ citizenId }` | `POST /sim/oneid/login` → `SimSession` (token goes to the `x-sim-session` header) |
| — | `POST /cases/:id/application` (session) → `Application` |
| `UpdateApplicationFieldsRequest` `{ values }` | `PATCH /applications/:id/fields` (MANUAL fields only) |
| `ConsentRequest` `{ consent: true }` | `POST /applications/:id/consent` |
| — | `POST /applications/:id/sign` (ERI simulator), `GET /applications/:id/pdf`, `GET /applications/:id/verify` |
| `SubmitToAgencyRequest` `{ applicationId, consent: true }` | `POST /submissions` — needs stored consent and a valid signature |
| `AgencyStatusUpdateRequest` `{ status: "RECEIVED" \| "IN_REVIEW" }` | `POST /sim/idora/submissions/:id/status` (cabinet simulator) |
| `AgencyRespondRequest` `{ text }` | `POST /sim/idora/submissions/:id/respond` (cabinet simulator) |
| `AnalyzeInput` `{ text, language? }` | `ai` `analyze()` |
| `LegalSourceDocument` | files in `legal-knowledge/` |

## Changing a contract

1. Edit the schema in `packages/contracts/src`.
2. Update every consumer in the same PR (`pnpm typecheck` finds them).
3. Update this file and `openapi.yaml`.
4. Breaking change to `AnalysisResult` ⇒ bump `ANALYSIS_SCHEMA_VERSION` and the AI prompt version.
