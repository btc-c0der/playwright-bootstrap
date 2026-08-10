export interface TrackedSeedResource {
  type: string;
  id: string;
  deleteFn: () => Promise<void>;
}

export interface SeedTeardownFailure {
  type: string;
  id: string;
  error: string;
  timestamp: string;
}

/**
 * A framework-agnostic sibling of `@qaf/core`'s `TeardownStack` — same LIFO,
 * never-throws-on-cleanup-failure design (a teardown hiccup must not mask a
 * test's real result), but with no `Logger`/Playwright dependency, since a
 * `SeedTarget` (`seed-target.ts`) is meant to also work from a plain REST
 * caller with no Playwright fixtures in the picture at all. LIFO here is what
 * makes seeding/teardown symmetric for free: entities are *inserted* in
 * FK-respecting parent-first order (`topoSortEntities`), so popping the stack
 * in reverse deletes children before their parents without either side having
 * to know the dependency graph twice.
 */
export class IsolationTeardownStack {
  private readonly resources: TrackedSeedResource[] = [];
  readonly failures: SeedTeardownFailure[] = [];

  track(resource: TrackedSeedResource): void {
    this.resources.push(resource);
  }

  get size(): number {
    return this.resources.length;
  }

  async runAll(): Promise<void> {
    while (this.resources.length > 0) {
      const resource = this.resources.pop();
      if (!resource) continue;
      try {
        await resource.deleteFn();
      } catch (error) {
        this.failures.push({
          type: resource.type,
          id: resource.id,
          error: error instanceof Error ? error.message : String(error),
          timestamp: new Date().toISOString(),
        });
      }
    }
  }
}
