import "../load-env";
import "reflect-metadata";
import { DataSource } from "typeorm";
import { ENTITIES } from "./database.module";
import { LexiInitialSchema1763712000000 } from "./migrations/1763712000000-LexiInitialSchema";

/**
 * DataSource for the TypeORM CLI (`pnpm --filter @lex/api db:migrate`). The connection string
 * comes only from DATABASE_URL (environment / .env, never from source). Schema sync is off;
 * migrations run only when invoked explicitly.
 */
if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set");

export default new DataSource({
  type: "postgres",
  url: process.env.DATABASE_URL,
  entities: ENTITIES,
  migrations: [LexiInitialSchema1763712000000],
  synchronize: false,
  migrationsRun: false,
});
