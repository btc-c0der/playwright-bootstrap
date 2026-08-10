import type { APIRequestContext } from "@playwright/test";

export interface ApiClient {
  request: APIRequestContext;
  baseURL: string;
}

export interface ApiClientTestFixtures {
  apiClient: ApiClient;
}

/**
 * Thin wrapper around Playwright's native `request` fixture. Kept as its own
 * fixture (rather than having factories reach for `request` directly) so a
 * consuming repo can swap auth headers / base URL resolution in one place.
 */
export async function apiClientFixture(
  { request, baseURL }: { request: APIRequestContext; baseURL: string | undefined },
  use: (client: ApiClient) => Promise<void>,
): Promise<void> {
  await use({ request, baseURL: baseURL ?? "" });
}
