import { Module, type DynamicModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import type { DataSourceOptions } from "typeorm";
import { AgencySubmissionEntity } from "./entities/agency-submission.entity";
import { CaseEntity } from "./entities/case.entity";
import { LexiInitialSchema1763712000000 } from "./migrations/1763712000000-LexiInitialSchema";

/**
 * No TypeORM entities are registered: the schema is defined by the SQL migration and accessed
 * through parameterized repositories (pg-repositories.ts). The legacy CaseEntity and
 * AgencySubmissionEntity (camelCase columns) do NOT match that schema and must not be used.
 */
export const ENTITIES: NonNullable<DataSourceOptions["entities"]> = [];
/** Kept for reference only (see above). */
export const LEGACY_ENTITIES = [CaseEntity, AgencySubmissionEntity];

/**
 * PostgreSQL via TypeORM. Connects only when DATABASE_URL is set, so local
 * development, tests and CI run without a database (services are in-memory
 * for now). Schema changes must go through migrations — synchronize is off.
 */
@Module({})
export class DatabaseModule {
  static forRoot(env: NodeJS.ProcessEnv = process.env): DynamicModule {
    if (!env.DATABASE_URL) return { module: DatabaseModule };
    return {
      module: DatabaseModule,
      imports: [
        TypeOrmModule.forRoot({
          type: "postgres",
          url: env.DATABASE_URL,
          entities: ENTITIES,
          migrations: [LexiInitialSchema1763712000000],
          synchronize: false,
          migrationsRun: false,
        }),
      ],
    };
  }
}
