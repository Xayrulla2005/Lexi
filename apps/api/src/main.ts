import "reflect-metadata";
import { resolve } from "node:path";
import { Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/** Loads the repo-root .env if present (Node >= 20.12). Real env vars take precedence. */
function loadEnv(): void {
  try {
    process.loadEnvFile(resolve(__dirname, "../../../.env"));
  } catch {
    // No .env file — rely on the process environment.
  }
}

async function bootstrap(): Promise<void> {
  loadEnv();
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
  app.enableShutdownHooks();

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
