# Legal sources: verification workflow

Applies to documents in `legal-knowledge/` and to rules/routes in
`packages/legal-engine`.

## Statuses

| Status | Meaning | Effect |
| --- | --- | --- |
| `PENDING` | Added, not reviewed | May be retrieved and shown with a "needs review" notice; forces `requiresHumanReview` |
| `VERIFIED` | Reviewed against the official source | Can be shown without a review flag |
| `REJECTED` | Wrong, outdated or superseded | Never retrieved; rules are skipped |

## Workflow

1. **Add** (any team member): create the JSON document as `PENDING`, with the
   official `sourceUrl` and `effectiveDate`. Open a PR with label `legal-source`.
2. **Review** (legal reviewer): compare text, article number and edition with the
   official publication. Set `verificationStatus`, `lastVerifiedAt`, `reviewer`.
3. **Route/rule review**: a route may become `VERIFIED` only if every step is backed
   by `VERIFIED` documents listed in `sourceDocumentIds`. Deadlines and contact
   numbers may only appear in verified routes.
4. **Re-verification**: when legislation changes, add a new document id for the new
   edition, mark the old one `REJECTED`, and re-review dependent routes.

## Current state (2026-11-15)

- No legal documents have been added.
- All routes (`UNPAID_WAGES`, `NEIGHBOR_DISPUTE`, `DOMESTIC_VIOLENCE`, `EMERGENCY`,
  `FALLBACK`) are structural placeholders with status `PENDING`.
- Agency data in `data/raw/agencies.csv` is team-collected and also unverified.
