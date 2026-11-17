import { GatewayTimeoutException, type Logger } from "@nestjs/common";

/** Upper bound for every file or external operation in a request (ms). OP_TIMEOUT_MS overrides it (tests). */
export const opTimeoutMs = (): number => {
  const n = Number(process.env.OP_TIMEOUT_MS);
  return Number.isFinite(n) && n > 0 ? n : 5000;
};

/** User-facing message on a timeout (Uzbek, latin). */
export const RETRY_MESSAGE = "Qayta urinib ko'ring";

export class OperationTimeoutError extends GatewayTimeoutException {
  constructor(readonly operation: string) {
    super({ statusCode: 504, message: RETRY_MESSAGE, operation });
  }
}

/**
 * Resolves like `work`, or rejects with OperationTimeoutError (HTTP 504, "Qayta urinib ko'ring")
 * after `ms`. The request never waits forever; the underlying operation is not cancelled.
 */
export function withTimeout<T>(work: Promise<T> | (() => Promise<T>), operation: string, ms = opTimeoutMs()): Promise<T> {
  const promise = typeof work === "function" ? work() : work;
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new OperationTimeoutError(operation)), ms);
    timer.unref();
    promise.then(
      (v) => {
        clearTimeout(timer);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(timer);
        reject(e);
      },
    );
  });
}

/**
 * Times the steps of one request and logs them in one line, e.g.
 * `submit 1a2b: pdf=3ms verify=1ms gateway=12ms total=20ms`.
 * Async steps get the operation timeout.
 */
export class StepTimer {
  private readonly started = performance.now();
  private readonly parts: string[] = [];

  constructor(
    private readonly label: string,
    private readonly logger: Logger,
  ) {}

  async step<T>(name: string, fn: () => Promise<T> | T): Promise<T> {
    const t0 = performance.now();
    try {
      const out = fn();
      return out instanceof Promise ? await withTimeout(out, `${this.label}:${name}`) : out;
    } finally {
      this.parts.push(`${name}=${Math.round(performance.now() - t0)}ms`);
    }
  }

  /** Logs the timings; call in `finally` so failed and timed-out requests are logged too. */
  done(outcome = "ok"): void {
    const total = Math.round(performance.now() - this.started);
    this.logger.log(`[timing] ${this.label}: ${this.parts.join(" ")} total=${total}ms (${outcome})`);
  }
}
