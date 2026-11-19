import "./load-env";
import "reflect-metadata";
import { type INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

/** Upper bound for a graceful shutdown before the process exits anyway. */
const SHUTDOWN_TIMEOUT_MS = 5000;

/**
 * Graceful, bounded shutdown. The ONNX runtime (RAG model) and timers can keep the
 * event loop alive after app.close(), so the process used to ignore SIGTERM until
 * `tsx watch` or the terminal killed it. Now it closes the app and always exits.
 */
function exitOnSignals(app: INestApplication): void {
  let closing = false;
  const shutdown = (signal: NodeJS.Signals) => {
    if (closing) return;
    closing = true;
    Logger.log(`${signal}: shutting down`, "Bootstrap");
    setTimeout(() => process.exit(0), SHUTDOWN_TIMEOUT_MS).unref();
    app
      .close()
      .catch((e: unknown) => Logger.error(`shutdown failed: ${(e as Error).message}`, "Bootstrap"))
      .finally(() => process.exit(0));
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);
  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
  exitOnSignals(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
