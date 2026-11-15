# ADR-003: TypeORM for persistence, zod for shared contracts

- Status: Accepted
- Date: 2026-11-15

## Context

The previous skeleton contained an unused Prisma schema. The brief specifies
PostgreSQL + TypeORM. Contracts must be shared by API, clients, AI and the
legal engine, and AI output must be validated at runtime.

## Decision

- Replace Prisma with TypeORM (`@nestjs/typeorm`). Entities live in
  `apps/api/src/database/entities`, use explicit column types, `synchronize: false`.
  The connection is created only when `DATABASE_URL` is set.
- Define contracts as zod schemas in `@lex/contracts`; TypeScript types are inferred
  from them (one definition, both compile-time and runtime safety).

## Consequences

- Development, tests and CI run without a database until services move to repositories.
- Migrations still need to be set up (TypeORM CLI + `DataSource`) before persisting data.
- Request bodies are validated with `ZodValidationPipe` instead of class-validator DTOs.
