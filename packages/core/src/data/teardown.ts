import type { Logger } from "../logger/Logger.js";

export interface TrackedResource {
  type: string;
  id: string;
  deleteFn: () => Promise<void>;
}

export interface TeardownFailure {
  type: string;
  id: string;
  error: string;
  testNamespace: string;
  timestamp: string;
}

/**
 * Per-test LIFO cleanup stack. Teardown failures are logged and recorded, never
 * thrown — a cleanup hiccup must not mask (or override) the test's real assertion
 * result. Recorded failures feed the `audit` skill's teardown-failures report so
 * orphaned data doesn't go unnoticed even though it doesn't fail the run.
 */
export class TeardownStack {
  private readonly resources: TrackedResource[] = [];
  readonly failures: TeardownFailure[] = [];

  constructor(
    private readonly testNamespace: string,
    private readonly logger: Logger,
  ) {}

  track(resource: TrackedResource): void {
    this.resources.push(resource);
  }

  async runAll(): Promise<void> {
    while (this.resources.length > 0) {
      const resource = this.resources.pop();
      if (!resource) continue;
      try {
        await resource.deleteFn();
        this.logger.debug("teardown succeeded", { type: resource.type, id: resource.id });
      } catch (error) {
        const failure: TeardownFailure = {
          type: resource.type,
          id: resource.id,
          error: error instanceof Error ? error.message : String(error),
          testNamespace: this.testNamespace,
          timestamp: new Date().toISOString(),
        };
        this.failures.push(failure);
        this.logger.warn("teardown failed — resource may be orphaned", { ...failure });
      }
    }
  }
}
