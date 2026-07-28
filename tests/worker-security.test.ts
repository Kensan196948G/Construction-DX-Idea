import assert from "node:assert/strict";
import { describe, it } from "node:test";
import worker, { workerSecurityTestHooks } from "../worker/index";

const env = {
  DATABASE_URL: "",
  ANTHROPIC_API_KEY: "",
  SLACK_WEBHOOK_URL: "",
  AI_PROVIDER: "claude",
  AI_MODEL: "claude-sonnet-5",
  AI_ENABLED: "false",
  DAILY_AI_LIMIT: "10",
  MAX_INPUT_CHARS: "2000",
  APP_BASE_URL: "https://app.example.jp",
  ALLOWED_ORIGINS: "https://app.example.jp,https://admin.example.jp",
  ADMIN_EMAILS: "manager@example.jp",
  SYSTEM_ADMIN_EMAILS: "it-admin@example.jp",
  ALLOW_LOCAL_AUTH_BYPASS: "false",
  CF_ACCESS_CERTS_URL: "https://access.example.jp/cdn-cgi/access/certs",
  CF_ACCESS_AUD: "construction-dx-idea",
  CF_ACCESS_ISSUER: "https://access.example.jp",
  AI_INPUT_COST_PER_1K_TOKENS: "0.003",
  AI_OUTPUT_COST_PER_1K_TOKENS: "0.015",
};

function base64UrlEncode(value: string | Uint8Array) {
  const bytes =
    typeof value === "string" ? new TextEncoder().encode(value) : value;
  return Buffer.from(bytes)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

async function createAccessJwt(
  claims: Partial<{
    aud: string | string[];
    email: string;
    exp: number;
    iss: string;
    nbf: number;
  }> = {},
) {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );

  const kid = `test-kid-${Math.random().toString(36).slice(2, 10)}`;
  const publicJwk = (await crypto.subtle.exportKey("jwk", keyPair.publicKey)) as JsonWebKey & {
    alg?: string;
    kid?: string;
    use?: string;
  };
  publicJwk.kid = kid;
  publicJwk.alg = "RS256";
  publicJwk.use = "sig";

  const now = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      aud: env.CF_ACCESS_AUD,
      email: "user@example.jp",
      exp: now + 300,
      iss: env.CF_ACCESS_ISSUER,
      ...claims,
    }),
  );
  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    keyPair.privateKey,
    new TextEncoder().encode(`${header}.${payload}`),
  );
  const jwt = `${header}.${payload}.${base64UrlEncode(new Uint8Array(signature))}`;
  return { jwt, jwks: { keys: [publicJwk] } };
}

async function withMockedFetch<T>(
  handler: (input: string | URL | Request) => Response | Promise<Response>,
  run: () => Promise<T>,
) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = (async (input: string | URL | Request) => handler(input)) as typeof fetch;
  try {
    return await run();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

async function expectJwtFailure(
  claims: Parameters<typeof createAccessJwt>[0],
  expectedMessage: string,
  jwksTransform?: (jwks: { keys: JsonWebKey[] }) => { keys: JsonWebKey[] },
) {
  const { jwt, jwks } = await createAccessJwt(claims);
  const testEnv = {
    ...env,
    CF_ACCESS_CERTS_URL: `${env.CF_ACCESS_CERTS_URL}?case=${Math.random().toString(36).slice(2, 10)}`,
  };
  await withMockedFetch(
    async () => new Response(JSON.stringify(jwksTransform ? jwksTransform(jwks) : jwks)),
    async () => {
      await assert.rejects(
        () => workerSecurityTestHooks.verifyAccessJwt(jwt, testEnv),
        (error: unknown) => {
          assert.ok(error instanceof Error);
          assert.equal(error.message, expectedMessage);
          return true;
        },
      );
    },
  );
}

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

  it("sanitizes common secret shapes before runtime logging", () => {
    const databaseUrl = "postgres" + "ql://user:password" + "@db.example/app";
    const sanitized = workerSecurityTestHooks.sanitizeLog(
      "sk-ant-secret https://hooks.slack.com/services/T000/B000/XXXX " +
        `${databaseUrl} Bearer abc.def.ghi ` +
        "api_key=plain-secret token:another-secret",
    );

    assert.equal(sanitized.includes("sk-ant-secret"), false);
    assert.equal(sanitized.includes("hooks.slack.com/services"), false);
    assert.equal(sanitized.includes("user:password@db.example"), false);
    assert.equal(sanitized.includes("Bearer abc.def.ghi"), false);
    assert.equal(sanitized.includes("plain-secret"), false);
    assert.match(sanitized, /\[ANTHROPIC_API_KEY]/);
    assert.match(sanitized, /\[SLACK_WEBHOOK_URL]/);
    assert.match(sanitized, /\[DATABASE_URL]/);
    assert.match(sanitized, /Bearer \[TOKEN]/);
  });

  it("masks bare Neon passwords that are not valid connection URLs", () => {
    // Regression for #25: a bare password pasted as DATABASE_URL does not
    // match the postgres:// pattern and used to pass through unmasked.
    const barePassword = "npg_" + "AbCdEf123456";
    const sanitized = workerSecurityTestHooks.sanitizeLog(
      `NeonDbError: neon() is not a valid URL. Connection string: ${barePassword}`,
    );

    assert.equal(sanitized.includes(barePassword), false);
    assert.match(sanitized, /\[NEON_PASSWORD]/);
  });

  it("accepts only postgres connection URLs for the database configuration", () => {
    const valid = "postgres" + "ql://user:password" + "@db.example/app?sslmode=require";
    assert.equal(workerSecurityTestHooks.isValidDatabaseUrl(valid), true);
    assert.equal(
      workerSecurityTestHooks.isValidDatabaseUrl("postgres" + "://user:pw" + "@host/db"),
      true,
    );
    assert.equal(workerSecurityTestHooks.isValidDatabaseUrl("npg_" + "AbCdEf123456"), false);
    assert.equal(
      workerSecurityTestHooks.isValidDatabaseUrl("mysql" + "://user:pw" + "@host/db"),
      false,
    );
    assert.equal(workerSecurityTestHooks.isValidDatabaseUrl("not a url"), false);
  });

  it("verifies a valid Cloudflare Access JWT against JWKS", async () => {
    const { jwt, jwks } = await createAccessJwt();
    const testEnv = {
      ...env,
      CF_ACCESS_CERTS_URL: `${env.CF_ACCESS_CERTS_URL}?case=valid`,
    };

    await withMockedFetch(
      async (input) => {
        const url = typeof input === "string" ? input : input instanceof Request ? input.url : input.toString();
        assert.equal(url, testEnv.CF_ACCESS_CERTS_URL);
        return new Response(JSON.stringify(jwks));
      },
      async () => {
        const payload = await workerSecurityTestHooks.verifyAccessJwt(jwt, testEnv);
        assert.equal(payload.email, "user@example.jp");
        assert.equal(payload.iss, env.CF_ACCESS_ISSUER);
      },
    );
  });

  it("rejects expired Cloudflare Access JWTs", async () => {
    await expectJwtFailure({ exp: Math.floor(Date.now() / 1000) - 5 }, "Cloudflare Access JWT is expired.");
  });

  it("rejects Cloudflare Access JWTs before nbf", async () => {
    await expectJwtFailure(
      { nbf: Math.floor(Date.now() / 1000) + 300 },
      "Cloudflare Access JWT is not active yet.",
    );
  });

  it("rejects Cloudflare Access JWTs with issuer mismatch", async () => {
    await expectJwtFailure({ iss: "https://other-access.example.jp" }, "Cloudflare Access JWT issuer is invalid.");
  });

  it("rejects Cloudflare Access JWTs with audience mismatch", async () => {
    await expectJwtFailure({ aud: "other-audience" }, "Cloudflare Access JWT audience is invalid.");
  });

  it("rejects Cloudflare Access JWTs when the JWKS kid does not match", async () => {
    await expectJwtFailure({}, "Cloudflare Access JWT key is unknown.", (jwks) => ({
      keys: jwks.keys.map((key) => ({ ...key, kid: "different-kid" })),
    }));
  });
});
