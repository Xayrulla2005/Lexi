# ADR-002: Keep Next.js for the web client (instead of Vite)

- Status: Accepted
- Date: 2026-11-15

## Context

The initial architecture brief proposed React + Vite. `apps/web` already
existed as a Next.js 15 (React 19) app with team-owned UI files
(`components/ui`, `content`, `styles`) and a working chat + simulator flow.

## Decision

Keep Next.js. Use Vitest for unit tests of client logic (`src/lib`). Linting
runs from the monorepo root, not inside `next build`.

## Consequences

- No frontend rewrite and no churn for UI contributors.
- The app is client-rendered ("use client") today; Vite would give a smaller toolchain
  but no functional benefit at this stage.
- Revisit if build time or deployment target (static hosting) becomes a problem.
