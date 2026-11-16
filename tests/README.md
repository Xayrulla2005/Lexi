# tests

| Folder | What | Runner |
| --- | --- | --- |
| `integration/` | HTTP tests against the full NestJS `AppModule` (Supertest). No DB, network or API keys. | `apps/api` Jest (`pnpm test`) |
| `scenarios/` | Synthetic end-to-end demo stories with expected risk / problem id / route. Used by the integration tests. | data only |

Unit tests live next to their package: `packages/*/test`, `ai/test`,
`apps/api/src/**/*.spec.ts`, `apps/web/src/**/*.test.ts`.

Rules for scenarios: synthetic text only, never real cases or personal data.
Expectations describe the current placeholder pipeline, not legal correctness.
