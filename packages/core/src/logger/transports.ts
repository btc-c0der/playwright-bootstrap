import type { LoggerOptions } from "pino";

/**
 * CI runners want structured JSON (machine-parseable by the flaky/health reporters);
 * local dev wants pino-pretty. Neither path ever touches console.* directly.
 */
export function buildPinoOptions(): LoggerOptions {
  const isCI = process.env.CI === "true" || process.env.CI === "1";
  const level = process.env.QAF_LOG_LEVEL ?? (isCI ? "info" : "debug");

  if (isCI) {
    return { level };
  }

  return {
    level,
    transport: {
      target: "pino-pretty",
      options: {
        colorize: true,
        translateTime: "HH:MM:ss.l",
        ignore: "pid,hostname",
      },
    },
  };
}
