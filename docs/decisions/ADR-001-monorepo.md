# ADR-001: Use a pnpm monorepo

- Status: Accepted
- Date: 2026-11-15

## Context

A small hackathon team builds an API, a web client, a Telegram bot, an AI
pipeline and a rules engine at the same time. All of them share the same data
shapes (analysis result, routing decision, case, submission). Contract drift
between separately versioned repos would cost more time than it saves.

## Decision

Use one repository with pnpm workspaces:

- `apps/*` — deployable apps (api, web, bot)
- `packages/*` — shared libraries (contracts, legal-engine)
- `ai/` — AI pipeline package
- `data/import` — data validation tool

Shared code is consumed via `workspace:*`. The backend stays a single NestJS
process (modular monolith), not microservices.

## Consequences

- One PR can change a contract and all its consumers atomically; CI type-checks everything together.
- One lockfile, one CI pipeline, one place for docs and standards.
- Packages must be built in dependency order (`pnpm build:packages`) before
  dependent apps are type-checked or tested.
- Ownership boundaries are enforced by `CODEOWNERS` and PR review instead of repository permissions.
- If a component later needs independent deployment or scaling, it can be
  extracted because module boundaries already exist.
