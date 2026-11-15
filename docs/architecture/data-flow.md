# Data flow

```mermaid
sequenceDiagram
  actor U as User
  participant C as Client (web / bot)
  participant API as apps/api
  participant AI as ai/ analyze()
  participant E as legal-engine
  participant GW as AgencyGateway (Mock)

  U->>C: problem (text; voice later)
  C->>API: POST /cases, POST /cases/:id/messages
  C->>API: POST /cases/:id/analyze
  API->>AI: analyze(text)
  AI->>AI: normalize → risk keywords → retrieve → classify → validate citations
  AI-->>API: AnalysisResult (zod-validated)
  API->>E: route({ analysis })
  E-->>API: RoutingDecision (+ trace)
  API-->>C: Case { analysis, routingDecision }
  C->>U: action plan + "needs review" notice
  U->>C: explicit confirmation (button)
  C->>API: POST /submissions { consent: true }
  API->>API: validate consent + agency ∈ routing decision
  API->>GW: submit()
  GW-->>API: AgencySubmission (MOCK, receipt SIM-…)
  C->>API: GET /submissions/:id
```

## Stages

1. **User input.** Free text in Uzbek (Latin/Cyrillic) or Russian. Voice →
   Whisper is planned (`SpeechToTextProvider`), not wired yet.
2. **AI analysis** (`ai/pipeline/analyze.ts`).
   - `normalize` — Cyrillic → Latin, whitespace.
   - `keywordRisk` — LLM-independent safety net; `CRITICAL` sets `requiresImmediateAction`.
   - `retrieve` — documents from `legal-knowledge/` (empty corpus today).
   - `classify` — keyword stub today; Qwen via `prompts/analysis.prompt.ts` later.
   - Clarification: missing facts go to `missingInformation` / `followUpQuestions`.
3. **Validation.**
   - `CitationValidator` drops references to documents that were not retrieved
     and copies verification metadata from the source, never from the model.
   - `AnalysisResult.parse()` rejects anything off-contract (unknown sub-case,
     bad risk level, etc.).
4. **Legal routing** (`packages/legal-engine`). Emergency override → first
   matching rule by priority → fallback. Any non-`VERIFIED` rule/route, low
   confidence or `needsHumanReview` sets `requiresHumanReview: true`.
5. **Action plan.** Currently the route's steps. The `action-plans` module will
   produce richer plans and drafts from the decision.
6. **User confirmation.** Clients submit only after an explicit action (web
   button, bot "Ha, yubor"). The API requires `consent: true` and that the
   agency is part of the case's routing decision.
7. **Mock agency gateway.** `MockAgencyAdapter` issues a `SIM-` receipt and
   advances status on timers (`DEMO_SPEED`). Nothing leaves the process.
