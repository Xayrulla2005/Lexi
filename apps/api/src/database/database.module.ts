import { Module, type DynamicModule } from "@nestjs/common";
import { TypeOrmModule } from "@nestjs/typeorm";
import { AgencySubmissionEntity } from "./entities/agency-submission.entity";
import { CaseEntity } from "./entities/case.entity";

export const ENTITIES = [CaseEntity, AgencySubmissionEntity];

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
          synchronize: false,
          migrationsRun: false,
        }),
      ],
    };
  }
}
