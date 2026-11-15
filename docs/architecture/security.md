# Security and safety principles

## User consent

- No external submission happens without explicit user confirmation.
  `SubmitToAgencyRequest.consent` must be the literal `true`; anything else is `400`.
- The API additionally rejects submissions to agencies that are not part of the
  case's deterministic `RoutingDecision`.
- Clients send `consent: true` only from an explicit user action (web button,
  bot consent keyboard) — never automatically.

## Sensitive data protection

- Cases may contain information about violence, health and family. Treat all
  case content as sensitive personal data.
- Collect the minimum: no names, phone numbers or addresses are required by the contracts.
- `userId` is a pseudonymous channel id; do not store real identity documents.
- Never log full user stories in production. Routing traces contain rule ids only.
- Test data and `tests/scenarios/` are synthetic. Private spreadsheets use
  `*.private.csv` (git-ignored).
- TODO before any real pilot: encryption at rest, retention/deletion policy, access control.

## Secret management

- Secrets live only in `.env` (git-ignored). `.env.example` contains placeholders.
- `HF_TOKEN`, `TELEGRAM_BOT_TOKEN`, `DATABASE_URL` are read from the environment;
  nothing is hardcoded.
- CI needs no secrets: the AI pipeline runs offline and the provider refuses to
  make network calls without `HF_TOKEN`.
- If a secret is committed by mistake: rotate it immediately, then remove it from history.

## Legal source verification

- Every legal document, rule and route carries `verificationStatus`,
  `lastVerifiedAt` and `reviewer`. Placeholders are `PENDING`.
- The schema refuses `VERIFIED` documents without reviewer metadata.
- The AI may cite only retrieved documents; the citation validator enforces it.
- Unverified routes are always shown with `requiresHumanReview: true`; the UI
  must not label them as lawyer-approved.

## AI limitations

- The model can be wrong, biased or manipulated by the user's text. The prompt
  fences user text as data, and outputs are schema-validated.
- AI output is advisory. The AI never makes the final routing decision or authorizes a submission.
- Low confidence (< 0.6) or unknown sub-cases ⇒ human review.
- The product does not replace a lawyer; the UI points users to legal aid when review is required.

## Emergency escalation

- Keyword risk detection runs without the LLM, so emergencies are caught even if
  the model is down.
- `CRITICAL` risk or `requiresImmediateAction` overrides every rule and returns the
  `EMERGENCY` route.
- Emergency guidance is shown even though its contact details are still pending
  verification: safety takes precedence. Contact numbers must be verified by the legal team.
- Emergency cases are never auto-submitted; the user is directed to call emergency services.
