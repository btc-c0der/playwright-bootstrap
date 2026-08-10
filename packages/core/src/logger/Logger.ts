import pino, { type Logger as Pino } from "pino";
import { buildPinoOptions } from "./transports.js";

export type LogFields = Record<string, unknown>;

/**
 * The only sanctioned output path in this framework — @qaf/eslint-plugin-qaf's
 * `no-console` rule fails any `console.*` call in test/framework code specifically
 * because output must flow through here: it's what makes logs structured, correlated
 * to a test/worker/shard, and consumable by the flaky/health reporters and CI.
 */
export class Logger {
  private constructor(private readonly pino: Pino) {}

  static root(): Logger {
    return new Logger(pino(buildPinoOptions()));
  }

  child(bindings: LogFields): Logger {
    return new Logger(this.pino.child(bindings));
  }

  debug(message: string, fields?: LogFields): void {
    this.pino.debug(fields ?? {}, message);
  }

  info(message: string, fields?: LogFields): void {
    this.pino.info(fields ?? {}, message);
  }

  warn(message: string, fields?: LogFields): void {
    this.pino.warn(fields ?? {}, message);
  }

  error(message: string, fields?: LogFields): void {
    this.pino.error(fields ?? {}, message);
  }
}
