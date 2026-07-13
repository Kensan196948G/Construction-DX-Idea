import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker, { workerSecurityTestHooks } from "../worker/index";

const env = {
  DATABASE_URL: "",
  ANTHROPIC_API_KEY: "",
  SLACK_WEBHOOK_URL: "",
  AI_PROVIDER: "claude",
  AI_MODEL: "claude-sonnet-4-5",
  AI_ENABLED: "false",
  DAILY_AI_LIMIT: "10",
  MAX_INPUT_CHARS: "2000",
  APP_BASE_URL: "https://app.example.jp",
  ALLOWED_ORIGINS: "https://app.example.jp,https://admin.example.jp",
  ADMIN_EMAILS: "manager@example.jp",
  SYSTEM_ADMIN_EMAILS: "it-admin@example.jp",
  ALLOW_LOCAL_AUTH_BYPASS: "false",
  AI_INPUT_COST_PER_1K_TOKENS: "0.003",
  AI_OUTPUT_COST_PER_1K_TOKENS: "0.015",
};

describe("worker security helpers", () => {
  it("allows only configured CORS origins", () => {
    assert.equal(
      workerSecurityTestHooks.resolveCorsOrigin("https://app.example.jp", env),
      "https://app.example.jp",
    );
    assert.equal(
      workerSecurityTestHooks.resolveCorsOrigin("https://attacker.example", env),
      undefined,
    );
  });

  it("assigns admin roles only from explicit email settings", () => {
    assert.deepEqual(workerSecurityTestHooks.inferRoles("user@example.jp", env), ["user"]);
    assert.deepEqual(workerSecurityTestHooks.inferRoles("manager@example.jp", env), [
      "user",
      "admin",
    ]);
    assert.deepEqual(workerSecurityTestHooks.inferRoles("it-admin@example.jp", env), [
      "user",
      "admin",
      "system_admin",
    ]);
  });

  it("keeps health public but protects API data endpoints", async () => {
    const runtime = worker as {
      fetch(
        request: Request,
        runtimeEnv: typeof env,
        ctx: { waitUntil(promise: Promise<unknown>): void; passThroughOnException(): void; props: unknown },
      ): Promise<Response>;
    };
    const ctx = {
      waitUntil: () => undefined,
      passThroughOnException: () => undefined,
      props: {},
    };
    const health = await runtime.fetch(new Request("https://api.example.jp/api/health"), env, ctx);
    assert.equal(health.status, 200);

    const metrics = await runtime.fetch(new Request("https://api.example.jp/api/metrics"), env, ctx);
    const body = (await metrics.json()) as { code?: string; request_id?: string };
    assert.equal(metrics.status, 401);
    assert.equal(body.code, "UNAUTHENTICATED");
    assert.equal(typeof body.request_id, "string");
  });

  it("estimates AI cost from configured token rates", () => {
    assert.equal(workerSecurityTestHooks.estimateAiCost(env, 4000, 4000), 0.018);
  });
});
