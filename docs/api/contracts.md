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
| `schemaVersion` | `"1.0"` | Bump on breaking change. |
| `caseSummary` | `string` | Neutral summary. |
| `classification` | `Classification` | See below. |
| `risk` | `RiskAssessment` | See below. |
| `facts` | `{ statement, source: "USER_REPORTED" \| "ASSUMPTION" }[]` | Separates what the user said from what the model inferred. |
| `missingInformation` | `string[]` | Gaps that block a reliable answer. |
| `legalReferences` | `LegalReference[]` | Only retrieved documents (enforced by `CitationValidator`). |
| `followUpQuestions` | `string[]` | Short clarification questions. |
| `needsHumanReview` | `boolean` | Low confidence, unknown sub-case or complex case. |

### Classification

| Field | Type |
| --- | --- |
| `domain` | `LegalDomain` — team taxonomy ids (`mehnat`, `qoshnichilik`, `zoravonlik`, …) |
| `subcase` | `"UNPAID_WAGES" \| "NEIGHBOR_DISPUTE" \| "DOMESTIC_VIOLENCE" \| null` |
| `confidence` | `number` in [0, 1] |

### RiskAssessment

| Field | Type |
| --- | --- |
| `level` | `"LOW" \| "NORMAL" \| "HIGH" \| "CRITICAL"` |
| `signals` | `string[]` |
| `requiresImmediateAction` | `boolean` — forces the EMERGENCY route |

### LegalReference

| Field | Type |
| --- | --- |
| `documentId` | `string` — id in `legal-knowledge/` (traceability) |
| `documentName` | `string` |
| `article` | `string` |
| `sourceUrl` | `string` (URL) |
| `verificationStatus` | `"VERIFIED" \| "PENDING" \| "REJECTED"` |
| `lastVerifiedAt` | ISO date-time \| `null` |

## RoutingDecision — produced only by `@lex/legal-engine`

| Field | Type | Notes |
| --- | --- | --- |
| `routeType` | `"EMERGENCY" \| "RULE_BASED" \| "FALLBACK"` | |
| `routeId` | `string \| null` | `null` for FALLBACK |
| `agencyId` | `string \| null` | Agency registry id (`data/raw/agencies.csv`) |
| `steps` | `RouteStep[]` | `{ order, action, agencyId, deadlineDays, documentTemplateId }` |
| `requiresHumanReview` | `boolean` | True unless rule, route are VERIFIED and analysis is confident |

`deadlineDays` must stay `null` unless backed by a VERIFIED source.

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
| `id` | UUID | |
| `caseId` | UUID | |
| `agencyId` | `string` | |
| `adapterType` | `"MOCK" \| "OFFICIAL"` | Only `MOCK` exists. |
| `status` | `"SUBMITTED" \| "RECEIVED" \| "IN_REVIEW" \| "ANSWERED" \| "OVERDUE" \| "ESCALATED"` | |
| `receiptId` | `string` | Simulator receipts start with `SIM-`. |
| `submittedAt` | ISO date-time | |
| `dueAt` | ISO date-time \| `null` | Simulated, not a legal deadline. |

## Request contracts

| Schema | Used by |
| --- | --- |
| `CreateCaseRequest` `{ channel?, userId? }` | `POST /cases` |
| `AddMessageRequest` `{ text }` | `POST /cases/:id/messages` |
| `SubmitToAgencyRequest` `{ caseId, agencyId, documentId?, consent: true }` | `POST /submissions` |
| `AnalyzeInput` `{ text, language? }` | `ai` `analyze()` |
| `LegalSourceDocument` | files in `legal-knowledge/` |

## Changing a contract

1. Edit the schema in `packages/contracts/src`.
2. Update every consumer in the same PR (`pnpm typecheck` finds them).
3. Update this file and `openapi.yaml`.
4. Breaking change to `AnalysisResult` ⇒ bump `ANALYSIS_SCHEMA_VERSION` and the AI prompt version.
