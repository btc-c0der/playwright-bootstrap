import type { ApiClient } from "../../fixtures/api-client.fixture.js";
import type { TeardownStack } from "../teardown.js";

export interface TestUser {
  id: string;
  email: string;
  password: string;
  displayName: string;
}

export interface CreateUserOptions {
  displayNamePrefix?: string;
  roles?: string[];
}

/**
 * Reference implementation of the factory pattern: every created resource is
 * namespaced (so parallel workers/shards never collide) and immediately pushed
 * onto the TeardownStack so it self-cleans regardless of test outcome. Copy this
 * shape for any other resource type (organizations, projects, API keys, ...).
 */
export function createUserFactory(deps: {
  apiClient: ApiClient;
  teardown: TeardownStack;
  testNamespace: string;
}) {
  return async function createUser(options: CreateUserOptions = {}): Promise<TestUser> {
    const email = `${options.displayNamePrefix ?? "user"}.${deps.testNamespace}@example.test`;
    const response = await deps.apiClient.request.post("/api/test-users", {
      data: {
        email,
        displayName: `${options.displayNamePrefix ?? "Test User"} (${deps.testNamespace})`,
        roles: options.roles ?? ["member"],
      },
    });
    if (!response.ok()) {
      throw new Error(`createUser failed: ${response.status()} ${await response.text()}`);
    }
    const body = (await response.json()) as { id: string; password: string };

    const user: TestUser = {
      id: body.id,
      email,
      password: body.password,
      displayName: `${options.displayNamePrefix ?? "Test User"} (${deps.testNamespace})`,
    };

    deps.teardown.track({
      type: "user",
      id: user.id,
      deleteFn: async () => {
        const del = await deps.apiClient.request.delete(`/api/test-users/${user.id}`);
        if (!del.ok() && del.status() !== 404) {
          throw new Error(`delete user ${user.id} failed: ${del.status()}`);
        }
      },
    });

    return user;
  };
}
