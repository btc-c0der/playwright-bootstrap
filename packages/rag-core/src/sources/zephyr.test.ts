import { test } from "node:test";
import assert from "node:assert/strict";
import {
  createZephyrScaleApiSource,
  createZephyrSourceFromTestCases,
  normalizeZephyrTestCases,
} from "./zephyr.js";

test("normalizeZephyrTestCases joins name/objective/precondition/steps", () => {
  const docs = normalizeZephyrTestCases([
    {
      key: "PROJ-T1",
      name: "Login with valid credentials",
      objective: "Verify a user can log in.",
      precondition: "User account exists.",
      steps: ["Navigate to login", "Enter credentials", "Assert dashboard shown"],
    },
  ]);
  assert.equal(docs[0]?.id, "zephyr:PROJ-T1");
  assert.equal(docs[0]?.namespace, "zephyr");
  assert.match(docs[0]?.text ?? "", /Verify a user can log in/);
  assert.match(docs[0]?.text ?? "", /Assert dashboard shown/);
});

test("createZephyrSourceFromTestCases normalizes via the injected loader", async () => {
  const source = createZephyrSourceFromTestCases(async () => [
    { key: "PROJ-T2", name: "Second case" },
  ]);
  const docs = await source.fetch();
  assert.equal(docs[0]?.id, "zephyr:PROJ-T2");
});

test("createZephyrScaleApiSource paginates until isLast and normalizes results", async () => {
  const calls: string[] = [];
  const fakeFetch = (async (url: string) => {
    calls.push(url);
    const startAt = Number(new URL(url).searchParams.get("startAt"));
    if (startAt === 0) {
      return {
        ok: true,
        status: 200,
        statusText: "OK",
        json: async () => ({
          values: [
            { key: "P-1", name: "First", testScript: { steps: [{ description: "step 1" }] } },
          ],
          isLast: false,
        }),
      };
    }
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ values: [{ key: "P-2", name: "Second" }], isLast: true }),
    };
  }) as unknown as typeof fetch;

  const source = createZephyrScaleApiSource({
    baseUrl: "https://api.zephyrscale.smartbear.com/v2",
    apiToken: "token",
    projectKey: "PROJ",
    pageSize: 1,
    fetchImpl: fakeFetch,
  });

  const docs = await source.fetch();
  assert.equal(calls.length, 2);
  assert.deepEqual(
    docs.map((d) => d.id),
    ["zephyr:P-1", "zephyr:P-2"],
  );
  assert.match(docs[0]?.text ?? "", /step 1/);
});

test("createZephyrScaleApiSource throws with status on a non-ok response", async () => {
  const fakeFetch = (async () => ({
    ok: false,
    status: 401,
    statusText: "Unauthorized",
    json: async () => ({}),
  })) as unknown as typeof fetch;

  const source = createZephyrScaleApiSource({
    baseUrl: "https://api.zephyrscale.smartbear.com/v2",
    apiToken: "bad",
    projectKey: "PROJ",
    fetchImpl: fakeFetch,
  });

  await assert.rejects(() => source.fetch(), /401/);
});
