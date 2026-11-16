# legal-knowledge

Versioned, traceable legal sources used by retrieval (`ai/rag`) and citation
validation. **Nothing in this directory is verified yet.**

## Legal data catalog

| | |
| --- | --- |
| **Source** | Team dataset `huquq-data` (version `2026-11-15`), built from three PDFs supplied by a team member (problem table, stories, application samples) and cleaned/extended; see [catalog/README.md](catalog/README.md). Original PDFs: [docs/legal-sources/pdf/](../docs/legal-sources/pdf/). Rebuild scripts: [tools/legal-data/](../tools/legal-data/). |
| **Status** | **DRAFT — awaiting legal review.** Parts of the data may originate from ChatGPT; articles for P51–P65 are named without article numbers. Nothing here may be presented as verified. |
| **Review checklist** | [TEKSHIRISH.md](TEKSHIRISH.md) (for the legal reviewer). |

| Path | Content |
| --- | --- |
| `catalog/problems.json` | 19 domains (`sohalar`), 33 agencies (`idoralar`), 65 problem types P01–P65 (laws, agencies, escalation, first step, "too early" agencies, review notes, template id) |
| `templates/T01.md … T65.md` | Application templates with `{{fio}}`, `{{summa}}`, `{{malumot_N}}` fields |
| `TEKSHIRISH.md` | Items that must be checked on lex.uz / official sites |

Related data: agencies `data/agencies.csv`, evaluation stories `ai/eval/datasets/test_cases.csv`.
`pnpm import:data` validates both against `catalog/problems.json`.

Files in `catalog/`, `templates/` and `TEKSHIRISH.md` are kept verbatim from the
dataset. Do not edit legal content (articles, phone numbers, deadlines) by hand —
report issues to the legal reviewer.

## Layout

| Folder | Domain id (`@lex/contracts` `LegalDomain`) | Example catalog problem |
| --- | --- | --- |
| `labor/` | `mehnat` | `P12` |
| `neighborhood/` | `qoshnichilik` | `P44` |
| `family-violence/` | `zoravonlik` | `P25` |

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
