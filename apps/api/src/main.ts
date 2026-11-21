import "./load-env";
import "reflect-metadata";
import { type INestApplication, Logger } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import type { NestExpressApplication } from "@nestjs/platform-express";
import type { Server } from "node:http";
import { AppModule } from "./app.module";
import { hardenHttp } from "./common/http-hardening";

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
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Before routes are registered (listen -> init): headers, body limits, trust proxy.
  hardenHttp(app);
  const origins = (process.env.CORS_ORIGIN ?? "http://localhost:3000")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  app.enableCors({ origin: origins });
  exitOnSignals(app);

  const port = Number(process.env.PORT ?? 3001);
  await app.listen(port);
  // Slow-client protection: a request (headers + body) must arrive within these bounds.
  const server = app.getHttpServer() as Server;
  server.headersTimeout = 20_000;
  server.requestTimeout = 60_000;
  Logger.log(`API listening on http://localhost:${port}`, "Bootstrap");
}

void bootstrap();
