# legal-knowledge

Versioned, traceable legal sources used by retrieval (`ai/rag`) and citation
validation. **Nothing in this directory is verified yet.**

## Layout

| Folder | Domain id (`@lex/contracts` `LegalDomain`) | Related sub-case |
| --- | --- | --- |
| `labor/` | `mehnat` | `UNPAID_WAGES` |
| `neighborhood/` | `qoshnichilik` | `NEIGHBOR_DISPUTE` |
| `family-violence/` | `zoravonlik` | `DOMESTIC_VIOLENCE` |

## File format

One JSON file per article/section, named `<documentId>.json`. Each file must
validate against `LegalSourceDocument` in `packages/contracts/src/legal-source.ts`:

```json
{
  "documentId": "EXAMPLE-LABOR-0001",
  "documentName": "<official title of the act, exactly as published>",
  "article": "<article / section number>",
  "domain": "mehnat",
  "text": "<verbatim text of the cited edition>",
  "sourceUrl": "<official URL of this edition, e.g. on lex.uz>",
  "effectiveDate": "YYYY-MM-DD",
  "verificationStatus": "PENDING",
  "lastVerifiedAt": null,
  "reviewer": null
}
```

| Field | Rule |
| --- | --- |
| `documentId` | Stable and unique. Never reuse an id for different content. Latin letters, digits, `_`, `-`. |
| `documentName`, `article` | Copied from the official publication. |
| `text` | Verbatim; no paraphrase. |
| `sourceUrl` | Official source for the exact edition. |
| `effectiveDate` | Date the cited edition entered into force. |
| `verificationStatus` | `PENDING` when added. Only a reviewer sets `VERIFIED` or `REJECTED`. |
| `lastVerifiedAt` | ISO timestamp of review; required for `VERIFIED`. |
| `reviewer` | Reviewer name/handle; required for `VERIFIED`. |

## Rules

- Never label placeholder or unreviewed content as `VERIFIED` (the schema rejects
  `VERIFIED` without `reviewer` and `lastVerifiedAt`).
- When the law changes, add a **new** document id for the new edition and mark
  the old one `REJECTED` — do not edit verified text in place.
- No personal data in this directory.
- See [docs/legal-sources/README.md](../docs/legal-sources/README.md) for the review workflow.
