import type { Page } from "@playwright/test";
import type { ApiClient } from "./api-client.fixture.js";
import type { DataFactory } from "./data-factory.fixture.js";
import type { Logger } from "../logger/Logger.js";
import type { TestUser } from "../data/factories/index.js";

export interface AuthenticatedSession {
  user: TestUser;
  page: Page;
}

export interface SessionCookie {
  name: string;
  value: string;
  domain: string;
  path: string;
}

export interface AuthTestFixtures {
  authenticatedPage: AuthenticatedSession;
}

/**
 * Auth-via-API, not auth-via-UI: creating the session through the API and
 * injecting it (cookie/localStorage) is an order of magnitude faster and more
 * reliable at thousands-of-tests scale than driving a login form per test. UI
 * login flows still get their own dedicated spec(s) — this fixture is for every
 * *other* test that merely needs to already be signed in.
 */
export async function authenticatedPageFixture(
  {
    page,
    apiClient,
    dataFactory,
    logger,
  }: { page: Page; apiClient: ApiClient; dataFactory: DataFactory; logger: Logger },
  use: (session: AuthenticatedSession) => Promise<void>,
): Promise<void> {
  const user = await dataFactory.createUser({ displayNamePrefix: "auth" });
  const session = await establishSession(apiClient, user, logger);
  await page.context().addCookies(session.cookies);
  await page.addInitScript((storage: Record<string, string>) => {
    for (const [key, value] of Object.entries(storage)) {
      window.localStorage.setItem(key, value);
    }
  }, session.localStorage);

  await use({ user, page });
}

async function establishSession(
  apiClient: ApiClient,
  user: TestUser,
  logger: Logger,
): Promise<{ cookies: SessionCookie[]; localStorage: Record<string, string> }> {
  const response = await apiClient.request.post("/api/test-auth/session", {
    data: { email: user.email, password: user.password },
  });
  if (!response.ok()) {
    logger.error("failed to establish authenticated session", {
      user: user.id,
      status: response.status(),
    });
    throw new Error(`establishSession failed: ${response.status()}`);
  }
  const body = (await response.json()) as {
    cookies?: SessionCookie[];
    localStorage?: Record<string, string>;
  };
  return { cookies: body.cookies ?? [], localStorage: body.localStorage ?? {} };
}
