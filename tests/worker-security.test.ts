import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workerSecurityTestHooks } from "../worker/index";

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
});
