# LEX-DISPATCHER

AI-powered **legal action navigator** for Uzbekistan. LexHackathon 2026 — "Legal services" track.

A citizen describes a problem in their own words. The system asks short
clarifying questions, assesses risk, classifies the situation, retrieves
relevant legal sources, picks the route with **deterministic, reviewable rules**,
produces a step-by-step action plan, and — only with explicit consent —
submits to a **simulated** agency and tracks the status.

> This is not a generic chatbot and not legal advice. The AI only analyses;
> routing is decided by rules; every submission needs the user's confirmation;
> agency integration is a **simulator** — no real government API is connected.

## Architecture

```text
apps/
  api/                NestJS API — cases, analysis, routing, mock agency gateway, tracking
  web/                Next.js client — chat, results, /simulator panel
  bot/                Telegram bot (grammY)
packages/
  contracts/          Shared zod schemas + TS types (AnalysisResult, RoutingDecision, Case, …)
  legal-engine/       Deterministic routing rules (no LLM)
ai/
  models/             Model config + Hugging Face provider (Qwen, BGE-M3, Whisper)
  prompts/            Structured analysis prompt
  rag/                Embedding / retrieval / reranking / citation-validation interfaces
  pipeline/           analyze(): normalize → risk → retrieve → classify → validate
legal-knowledge/      Versioned legal sources with verification metadata (empty — nothing verified yet)
data/                 Team spreadsheets (CSV) + validator
tests/                Integration tests (Supertest) and demo scenarios
docs/                 Architecture, API contracts, legal-source workflow, ADRs
```

User input → AI analysis → validation → legal routing → action plan → user confirmation → mock agency gateway.
Details: [system overview](docs/architecture/system-overview.md) · [data flow](docs/architecture/data-flow.md) ·
[security](docs/architecture/security.md) · [contracts](docs/api/contracts.md) · [ADRs](docs/decisions/)

## Technology

| Area | Stack |
| --- | --- |
| Backend | Node.js 22, NestJS 11, TypeScript (strict), PostgreSQL, TypeORM |
| Frontend | Next.js 15, React 19 (see [ADR-002](docs/decisions/ADR-002-keep-nextjs-frontend.md)) |
| Bot | grammY |
| AI | Hugging Face Inference — Qwen (analysis), BGE-M3 (embeddings), Whisper (speech-to-text, optional) |
| Contracts | zod |
| Tests | Jest + Supertest (API), Vitest (packages, ai, web) |
| Monorepo | pnpm workspaces |

## Requirements

- Node.js ≥ 22
- pnpm 10 (`packageManager` pins `pnpm@10.28.0`; with Corepack: `corepack enable`)
- Docker (optional — PostgreSQL via `docker compose`)

## Setup

```bash
pnpm install
cp .env.example .env          # fill in locally; never commit .env
pnpm build:packages           # contracts → legal-engine → ai
```

Environment variables (see [.env.example](.env.example)):

| Variable | Required | Purpose |
| --- | --- | --- |
| `NODE_ENV` | no | `development` / `production` |
| `PORT` | no | API port (default 3001) |
| `CORS_ORIGIN` | no | Comma-separated allowed origins (default `http://localhost:3000`) |
| `DATABASE_URL` | no | PostgreSQL URL. Empty ⇒ API runs in memory |
| `HF_TOKEN` | no | Hugging Face token. Empty ⇒ offline stub pipeline |
| `HF_MODEL`, `HF_EMBEDDING_MODEL`, `HF_STT_MODEL` | no | Model ids |
| `DEMO_SPEED` | no | Simulator: milliseconds per simulated day |
| `TELEGRAM_BOT_TOKEN` | bot only | Telegram bot token |
| `API_URL`, `NEXT_PUBLIC_API_URL` | no | API base URL for bot / web |

## Development

```bash
docker compose up -d   # optional: PostgreSQL (+ Redis, reserved)
pnpm dev:api           # http://localhost:3001  (GET /health)
pnpm dev:web           # http://localhost:3000  (simulator: /simulator)
pnpm dev:bot           # needs TELEGRAM_BOT_TOKEN
pnpm mock              # Prism mock of docs/api/openapi.yaml on :4010
```

Quick check:

```bash
curl -X POST localhost:3001/cases -H 'content-type: application/json' -d '{"channel":"web"}'
```

## Quality commands

```bash
pnpm lint          # ESLint (whole repo)
pnpm typecheck     # builds packages, then tsc in every workspace
pnpm test          # builds packages, then Vitest + Jest/Supertest
pnpm build         # builds everything (incl. next build)
pnpm import:data   # validates data/raw/*.csv
pnpm eval:ai       # offline accuracy check on data/raw/test_cases.csv
pnpm format        # Prettier
```

CI ([.github/workflows/ci.yml](.github/workflows/ci.yml)) runs install, lint,
typecheck, tests, build and the CSV check on every PR, with no secrets.

## Contributing

`main` is protected: feature branch → issue → pull request → green CI → review → merge.
Conventional commits. Full rules and ownership: [CONTRIBUTING.md](CONTRIBUTING.md).

## Tez boshlash (o'zbekcha)

```bash
pnpm install
cp .env.example .env
pnpm dev:api      # http://localhost:3001
pnpm dev:web      # http://localhost:3000  (simulyator: /simulator)
```

Muhim qoidalar:

- `main` ga faqat pull request orqali.
- Idorani AI emas, `packages/legal-engine` tanlaydi.
- Murojaat faqat foydalanuvchi roziligi bilan yuboriladi (`consent: true`).
- Simulyator har doim "SIMULYATOR — demo rejim" yozuvi bilan ko'rsatiladi.
- Tekshirilmagan qonun moddasi, muddat yoki telefon raqamini "tasdiqlangan" deb ko'rsatmang.
