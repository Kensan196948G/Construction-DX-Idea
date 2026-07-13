import { neon } from "@neondatabase/serverless";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { inspectIssueInput, inspectStructuredIdea, maskSensitiveText } from "../src/lib/privacy";
import {
  type AiConnectionTestResult,
  type AiQuestion,
  type AiSettings,
  type DashboardMetrics,
  type Idea,
  type IdeaStage,
  type IssueInput,
  type StructuredIdea,
  ideaStages,
  issueInputSchema,
  structuredIdeaSchema,
} from "../src/lib/shared";

type Env = {
  DATABASE_URL?: string;
  ANTHROPIC_API_KEY?: string;
  SLACK_WEBHOOK_URL?: string;
  AI_PROVIDER: string;
  AI_MODEL: string;
  AI_ENABLED: string;
  DAILY_AI_LIMIT: string;
  MAX_INPUT_CHARS: string;
  APP_BASE_URL: string;
  ALLOWED_ORIGINS?: string;
  ADMIN_EMAILS?: string;
  SYSTEM_ADMIN_EMAILS?: string;
  ALLOW_LOCAL_AUTH_BYPASS?: string;
  CF_ACCESS_CERTS_URL?: string;
  CF_ACCESS_AUD?: string;
  CF_ACCESS_ISSUER?: string;
  AI_INPUT_COST_PER_1K_TOKENS?: string;
  AI_OUTPUT_COST_PER_1K_TOKENS?: string;
};

type AppContext = Context<{ Bindings: Env }>;
type AccessJwtPayload = {
  aud?: string | string[];
  email?: string;
  exp?: number;
  iss?: string;
  nbf?: number;
};
type AccessJwk = JsonWebKey & {
  kid?: string;
};
type JwksResponse = {
  keys: AccessJwk[];
};

const app = new Hono<{ Bindings: Env }>();
const jwksCache = new Map<string, { expiresAt: number; keys: AccessJwk[] }>();
const SLACK_TIMEOUT_MS = 5000;

app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin, c) => resolveCorsOrigin(origin, c.env),
    allowMethods: ["GET", "POST", "PATCH", "OPTIONS"],
    allowHeaders: ["Content-Type", "CF-Access-Authenticated-User-Email"],
    credentials: true,
  }),
);

app.get("/api/health", (c) =>
  c.json({
    ok: true,
    service: "construction-dx-idea-api",
    time: new Date().toISOString(),
  }),
);

app.use("/api/*", async (c, next) => {
  await getUser(c.req.raw, c.env);
  await next();
});

app.get("/api/me", (c) => {
  return getUser(c.req.raw, c.env).then((user) =>
    c.json({ email: user, roles: inferRoles(user, c.env) }),
  );
});

app.get("/api/metrics", async (c) => {
  const db = getDb(c.env);
  const rows = await db`
    select
      count(*)::int as total_ideas,
      count(*) filter (where stage not in ('rejected', 'archived'))::int as active_ideas,
      count(*) filter (where stage = 'mvp')::int as mvp_ideas,
      coalesce(sum(jsonb_array_length(security_notes)), 0)::int as security_warnings
    from ideas
  `;
  const aiRows = await db`
    select count(*)::int as ai_calls_today
    from idea_ai_sessions
    where created_at >= date_trunc('day', now())
  `;
  const metrics: DashboardMetrics = {
    totalIdeas: rows[0]?.total_ideas ?? 0,
    activeIdeas: rows[0]?.active_ideas ?? 0,
    mvpIdeas: rows[0]?.mvp_ideas ?? 0,
    securityWarnings: rows[0]?.security_warnings ?? 0,
    aiCallsToday: aiRows[0]?.ai_calls_today ?? 0,
  };
  return c.json(metrics);
});

app.get("/api/ideas", async (c) => {
  const db = getDb(c.env);
  const rows = await db`
    select *
    from ideas
    order by updated_at desc
    limit 100
  `;
  return c.json(rows.map(mapIdeaRow));
});

app.post(
  "/api/privacy/inspect",
  zValidator("json", issueInputSchema),
  async (c) => c.json(inspectIssueInput(c.req.valid("json"))),
);

app.post(
  "/api/ai/questions",
  zValidator("json", z.object({ input: issueInputSchema })),
  async (c) => {
    const user = await getUser(c.req.raw, c.env);
    const { input } = c.req.valid("json");
    const reservation = await reserveAiUsage(c.env, user, input);
    try {
      const questions = await generateQuestions(c.env, input);
      const cost = await auditAi(c.env, user, "questions", input, questions);
      await finalizeAiUsage(c.env, reservation, cost);
      return c.json(questions);
    } catch (error) {
      await auditAiFailure(c.env, user, "questions", input, error);
      throw error;
    }
  },
);

app.post(
  "/api/ai/structure",
  zValidator("json", z.object({ input: issueInputSchema, answers: z.record(z.string(), z.string()) })),
  async (c) => {
    const user = await getUser(c.req.raw, c.env);
    const { input, answers } = c.req.valid("json");
    const reservation = await reserveAiUsage(c.env, user, input);
    try {
      const structured = await structureIdea(c.env, input, answers);
      const findings = inspectStructuredIdea(structured);
      if (findings.length > 0) {
        await audit(c.env, user, "ai.quality.blocked", "ai_session", "structure", {
          findingTypes: [...new Set(findings.map((finding) => finding.type))],
          findingCount: findings.length,
          outcome: "blocked",
          model: c.env.AI_MODEL,
          checkedAt: new Date().toISOString(),
        });
        throw new ApiError("AI_PRIVACY_FINDING", "AI応答に機密情報候補が含まれています。", 422);
      }
      const cost = await auditAi(c.env, user, "structure", input, structured);
      await finalizeAiUsage(c.env, reservation, cost);
      return c.json(structured);
    } catch (error) {
      await auditAiFailure(c.env, user, "structure", input, error);
      throw error;
    }
  },
);

app.post(
  "/api/ideas/drafts",
  zValidator("json", z.object({ structured: structuredIdeaSchema })),
  async (c) => {
    const idea = await insertIdea(c, c.req.valid("json").structured, "draft");
    return c.json(idea);
  },
);

app.post(
  "/api/ideas",
  zValidator("json", z.object({ structured: structuredIdeaSchema })),
  async (c) => {
    const idea = await insertIdea(c, c.req.valid("json").structured, "submitted");
    const notificationStatus = await notifySlack(c.env, idea);
    if (notificationStatus === "failed") {
      await audit(c.env, idea.createdBy, "slack.notify.failed", "idea", idea.id, {
        notificationStatus,
      }).catch((error: unknown) => console.error("Slack failure audit failed", sanitizeLog(error)));
    }
    return c.json({ ...idea, notificationStatus }, 201);
  },
);

app.post(
  "/api/ideas/:id/stage",
  zValidator("json", z.object({ stage: z.enum(ideaStages) })),
  async (c) => {
    const user = await getUser(c.req.raw, c.env);
    requireAdmin(user, c.env);
    const db = getDb(c.env);
    const id = c.req.param("id");
    const { stage } = c.req.valid("json");
    const rows = await db`
      with locked as (
        select id, stage as from_stage
        from ideas
        where id = ${id}
        for update
      ),
      updated as (
        update ideas
        set stage = ${stage}
        from locked
        where ideas.id = locked.id
        returning ideas.*, locked.from_stage
      ),
      history as (
        insert into idea_stage_histories (idea_id, from_stage, to_stage, changed_by)
        select id, from_stage, stage, ${user}
        from updated
      )
      select *
      from updated
    `;
    if (!rows[0]) throw new ApiError("NOT_FOUND", "Idea not found.", 404);
    await audit(c.env, user, "stage.update", "idea", id, { stage });
    return c.json(mapIdeaRow(rows[0]));
  },
);

app.get("/api/admin/ai-settings", async (c) => {
  const user = await getUser(c.req.raw, c.env);
  requireSystemAdmin(user, c.env);
  return c.json(await getAiSettings(c.env));
});

app.patch(
  "/api/admin/ai-settings",
  zValidator(
    "json",
    z.object({
      model: z.string().min(1).max(120),
      enabled: z.boolean(),
      dailyLimit: z.number().int().min(0).max(10000),
      monthlyBudget: z.number().min(0).max(100000000),
    }),
  ),
  async (c) => {
    const user = await getUser(c.req.raw, c.env);
    requireSystemAdmin(user, c.env);
    const patch = c.req.valid("json");
    const db = getDb(c.env);
    const connection = patch.enabled ? await testClaudeConnection(c.env, undefined, patch.model) : undefined;
    const status = !patch.enabled
      ? "disabled"
      : !c.env.ANTHROPIC_API_KEY
        ? "not_configured"
        : connection?.ok
          ? "connected"
          : "error";
    const keyLast4 = c.env.ANTHROPIC_API_KEY ? c.env.ANTHROPIC_API_KEY.slice(-4) : undefined;
    const rows = await db`
      insert into ai_settings (
        provider, model, secret_name, key_last4, status, enabled,
        daily_limit, monthly_budget, updated_by
      )
      values (
        ${c.env.AI_PROVIDER}, ${patch.model}, 'ANTHROPIC_API_KEY', ${keyLast4 ?? null},
        ${status}, ${patch.enabled}, ${patch.dailyLimit}, ${patch.monthlyBudget}, ${user}
      )
      returning *
    `;
    await audit(c.env, user, "ai_settings.update", "ai_settings", String(rows[0].id), {
      model: patch.model,
      enabled: patch.enabled,
      dailyLimit: patch.dailyLimit,
      monthlyBudget: patch.monthlyBudget,
      keyLast4,
    });
    return c.json(mapAiSettingsRow(rows[0], c.env));
  },
);

app.post(
  "/api/admin/ai-settings/test",
  zValidator("json", z.object({ apiKey: z.string().optional(), model: z.string().optional() })),
  async (c) => {
    const user = await getUser(c.req.raw, c.env);
    requireSystemAdmin(user, c.env);
    const { apiKey, model } = c.req.valid("json");
    const result = await testClaudeConnection(c.env, apiKey, model);
    await audit(c.env, user, "ai_settings.test", "ai_settings", "connection", {
      ok: result.ok,
      status: result.status,
      keyLast4: result.keyLast4,
      model: model ?? c.env.AI_MODEL,
    });
    return c.json(result);
  },
);

app.onError((error, c) => {
  const requestId = c.req.header("CF-Ray") ?? crypto.randomUUID();
  c.header("X-Request-Id", requestId);
  if (error instanceof ApiError) {
    return c.json({ ok: false, code: error.code, message: error.message, request_id: requestId }, error.status);
  }
  console.error("Unhandled error", sanitizeLog(error));
  return c.json(
    { ok: false, code: "INTERNAL_ERROR", message: "システムエラーが発生しました。", request_id: requestId },
    500,
  );
});

async function insertIdea(
  c: AppContext,
  structured: StructuredIdea,
  stage: IdeaStage,
): Promise<Idea> {
  const user = await getUser(c.req.raw, c.env);
  const db = getDb(c.env);
  assertStructuredIdeaSafe(structured);
  const rows = await db`
    insert into ideas (
      title, current_issue, target_business, target_users, current_workflow,
      improvement_idea, expected_effects, required_data, related_systems,
      implementation_options, security_notes, open_questions, mvp_candidate,
      mvp_done_definition, stage, created_by
    )
    values (
      ${structured.title}, ${structured.currentIssue}, ${structured.targetBusiness},
      ${structured.targetUsers}, ${structured.currentWorkflow}, ${structured.improvementIdea},
      ${structured.expectedEffects}, ${JSON.stringify(structured.requiredData)}::jsonb,
      ${JSON.stringify(structured.relatedSystems)}::jsonb,
      ${JSON.stringify(structured.implementationOptions)}::jsonb,
      ${JSON.stringify(structured.securityNotes)}::jsonb,
      ${JSON.stringify(structured.openQuestions)}::jsonb,
      ${structured.mvpCandidate}, ${structured.mvpDoneDefinition}, ${stage}, ${user}
    )
    returning *
  `;
  const idea = mapIdeaRow(rows[0]);
  await audit(c.env, user, stage === "draft" ? "idea.draft" : "idea.submit", "idea", idea.id, {
    stage,
  });
  return idea;
}

function getDb(env: Env) {
  if (!env.DATABASE_URL) {
    throw new ApiError("DATABASE_NOT_CONFIGURED", "DATABASE_URL is not configured.", 503);
  }
  return neon(env.DATABASE_URL);
}

function resolveCorsOrigin(origin: string, env: Env): string | undefined {
  if (!origin) return undefined;
  const allowed = new Set([
    ...splitCsv(env.ALLOWED_ORIGINS),
    env.APP_BASE_URL,
  ]);
  if (env.ALLOW_LOCAL_AUTH_BYPASS === "true") {
    allowed.add("http://localhost:5173");
    allowed.add("http://127.0.0.1:5173");
  }
  return allowed.has(origin) ? origin : undefined;
}

async function getUser(request: Request, env: Env): Promise<string> {
  if (env.ALLOW_LOCAL_AUTH_BYPASS === "true") return "local.dev@example.com";
  const jwt = request.headers.get("CF-Access-Jwt-Assertion");
  if (!jwt) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT is required.", 401);
  }
  const payload = await verifyAccessJwt(jwt, env);
  const jwtEmail = payload.email?.toLowerCase();
  if (!jwtEmail) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT does not include email.", 401);
  }
  const accessEmail = request.headers.get("CF-Access-Authenticated-User-Email")?.toLowerCase();
  if (accessEmail && accessEmail !== jwtEmail) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access identity headers do not match.", 401);
  }
  return jwtEmail;
}

async function verifyAccessJwt(jwt: string, env: Env): Promise<AccessJwtPayload> {
  if (!env.CF_ACCESS_CERTS_URL || !env.CF_ACCESS_AUD || !env.CF_ACCESS_ISSUER) {
    throw new ApiError("ACCESS_CONFIG_MISSING", "Cloudflare Access JWT settings are not configured.", 503);
  }
  const [encodedHeader, encodedPayload, encodedSignature] = jwt.split(".");
  if (!encodedHeader || !encodedPayload || !encodedSignature) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT is malformed.", 401);
  }
  let header: { alg?: string; kid?: string };
  let payload: AccessJwtPayload;
  try {
    header = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedHeader))) as {
      alg?: string;
      kid?: string;
    };
    payload = JSON.parse(new TextDecoder().decode(base64UrlDecode(encodedPayload))) as AccessJwtPayload;
  } catch {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT is malformed.", 401);
  }
  if (header.alg !== "RS256" || !header.kid) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT header is invalid.", 401);
  }
  const keys = await getAccessKeys(env.CF_ACCESS_CERTS_URL);
  const key = keys.find((candidate) => candidate.kid === header.kid);
  if (!key) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT key is unknown.", 401);
  }
  const cryptoKey = await crypto.subtle.importKey(
    "jwk",
    key,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const verified = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    base64UrlDecode(encodedSignature),
    new TextEncoder().encode(`${encodedHeader}.${encodedPayload}`),
  );
  if (!verified) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT signature is invalid.", 401);
  }
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isSafeInteger(payload.exp) || Number(payload.exp) <= now) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT is expired.", 401);
  }
  if (payload.nbf !== undefined && (!Number.isSafeInteger(payload.nbf) || payload.nbf > now)) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT is not active yet.", 401);
  }
  if (payload.iss !== env.CF_ACCESS_ISSUER) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT issuer is invalid.", 401);
  }
  const audiences = Array.isArray(payload.aud) ? payload.aud : [payload.aud].filter(Boolean);
  if (!audiences.includes(env.CF_ACCESS_AUD)) {
    throw new ApiError("UNAUTHENTICATED", "Cloudflare Access JWT audience is invalid.", 401);
  }
  return payload;
}

async function getAccessKeys(certsUrl: string): Promise<AccessJwk[]> {
  const cached = jwksCache.get(certsUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.keys;
  const response = await fetch(certsUrl);
  if (!response.ok) {
    throw new ApiError("ACCESS_CONFIG_MISSING", "Cloudflare Access certs could not be loaded.", 503);
  }
  const body = (await response.json()) as JwksResponse;
  jwksCache.set(certsUrl, { keys: body.keys, expiresAt: Date.now() + 10 * 60 * 1000 });
  return body.keys;
}

function base64UrlDecode(value: string): ArrayBuffer {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), "=");
  const bytes = Uint8Array.from(atob(padded), (character) => character.charCodeAt(0));
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function assertStructuredIdeaSafe(structured: StructuredIdea) {
  const findings = inspectStructuredIdea(structured);
  if (findings.length > 0) {
    throw new ApiError("PRIVACY_BLOCKED", "機密情報候補があるため保存を停止しました。", 422);
  }
}

function inferRoles(user: string, env: Env): string[] {
  const roles = ["user"];
  const normalized = user.toLowerCase();
  if (splitCsv(env.ADMIN_EMAILS).includes(normalized)) roles.push("admin");
  if (splitCsv(env.SYSTEM_ADMIN_EMAILS).includes(normalized)) roles.push("admin", "system_admin");
  if (env.ALLOW_LOCAL_AUTH_BYPASS === "true" && normalized === "local.dev@example.com") {
    roles.push("admin", "system_admin");
  }
  return roles;
}

function requireAdmin(user: string, env: Env) {
  if (!inferRoles(user, env).includes("admin")) {
    throw new ApiError("FORBIDDEN", "管理者権限が必要です。", 403);
  }
}

function requireSystemAdmin(user: string, env: Env) {
  if (!inferRoles(user, env).includes("system_admin")) {
    throw new ApiError("FORBIDDEN", "システム管理者権限が必要です。", 403);
  }
}

function splitCsv(value?: string): string[] {
  return (value ?? "")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);
}

type UsageLimit = {
  subjectType: "user" | "global";
  subjectId: string;
  dailyLimit: number;
  monthlyBudget: number;
};

type AiReservation = {
  dailyReservations: Array<{ subjectType: "user" | "global"; subjectId: string }>;
  monthlyReservations: Array<{
    subjectType: "user" | "global";
    subjectId: string;
    estimatedCost: number;
  }>;
};

async function reserveAiUsage(env: Env, user: string, input: IssueInput): Promise<AiReservation> {
  const aiSettings = await getAiSettings(env);
  if (env.AI_ENABLED !== "true" || !aiSettings.enabled) {
    throw new ApiError("AI_DISABLED", "AI機能は無効です。", 503);
  }
  if (!env.ANTHROPIC_API_KEY) {
    throw new ApiError("AI_NOT_CONFIGURED", "ANTHROPIC_API_KEY is not configured.", 503);
  }
  const text = JSON.stringify(input);
  if (text.length > Number(env.MAX_INPUT_CHARS || 2000)) {
    throw new ApiError("AI_INPUT_TOO_LARGE", "入力文字数が上限を超えています。", 413);
  }
  const blockers = inspectIssueInput(input).filter((finding) => finding.severity === "blocker");
  if (blockers.length > 0) {
    throw new ApiError("PRIVACY_BLOCKED", "機密情報候補があるためAI送信を停止しました。", 422);
  }

  const db = getDb(env);
  const limits = await getEffectiveUsageLimits(env, user, aiSettings.dailyLimit, aiSettings.monthlyBudget);
  const estimatedCost = estimateAiCost(env, text.length, 6400);
  const dailyReservations: AiReservation["dailyReservations"] = [];
  const monthlyReservations: AiReservation["monthlyReservations"] = [];
  try {
    for (const limit of limits) {
      if (limit.dailyLimit <= 0) {
        throw new ApiError("AI_BUDGET_EXCEEDED", "日次AI利用上限に達しました。", 429);
      }
      const rows = await db`
        insert into ai_usage_counters (subject_type, subject_id, usage_date, used_count, limit_count)
        values (${limit.subjectType}, ${limit.subjectId}, current_date, 1, ${limit.dailyLimit})
        on conflict (subject_type, subject_id, usage_date)
        do update
          set used_count = ai_usage_counters.used_count + 1,
              limit_count = ${limit.dailyLimit},
              updated_at = now()
          where ai_usage_counters.used_count < ${limit.dailyLimit}
        returning used_count
      `;
      if (!rows[0]) {
        throw new ApiError("AI_BUDGET_EXCEEDED", "日次AI利用上限に達しました。", 429);
      }
      dailyReservations.push({ subjectType: limit.subjectType, subjectId: limit.subjectId });
      if (limit.monthlyBudget > 0 && estimatedCost > 0) {
        const monthlyRows = await db`
          insert into ai_monthly_usage_counters (
            subject_type, subject_id, usage_month, used_cost_estimate, budget
          )
          values (
            ${limit.subjectType}, ${limit.subjectId}, date_trunc('month', current_date)::date,
            ${estimatedCost}, ${limit.monthlyBudget}
          )
          on conflict (subject_type, subject_id, usage_month)
          do update
            set used_cost_estimate = ai_monthly_usage_counters.used_cost_estimate + ${estimatedCost},
                budget = ${limit.monthlyBudget},
                updated_at = now()
            where ai_monthly_usage_counters.used_cost_estimate + ${estimatedCost} <= ${limit.monthlyBudget}
          returning used_cost_estimate
        `;
        if (!monthlyRows[0]) {
          throw new ApiError("AI_BUDGET_EXCEEDED", "月次AI利用予算に達しました。", 429);
        }
        monthlyReservations.push({
          subjectType: limit.subjectType,
          subjectId: limit.subjectId,
          estimatedCost,
        });
      }
    }
  } catch (error) {
    await releaseAiUsage(env, { dailyReservations, monthlyReservations });
    throw error;
  }
  return { dailyReservations, monthlyReservations };
}

async function releaseAiUsage(env: Env, reservation: AiReservation) {
  if (reservation.dailyReservations.length === 0 && reservation.monthlyReservations.length === 0) return;
  const db = getDb(env);
  for (const item of reservation.dailyReservations) {
    await db`
      update ai_usage_counters
      set used_count = greatest(used_count - 1, 0),
          updated_at = now()
      where subject_type = ${item.subjectType}
        and subject_id = ${item.subjectId}
        and usage_date = current_date
    `;
  }
  for (const item of reservation.monthlyReservations) {
    await db`
      update ai_monthly_usage_counters
      set used_cost_estimate = greatest(used_cost_estimate - ${item.estimatedCost}, 0),
          updated_at = now()
      where subject_type = ${item.subjectType}
        and subject_id = ${item.subjectId}
        and usage_month = date_trunc('month', current_date)::date
    `;
  }
}

async function finalizeAiUsage(env: Env, reservation: AiReservation, actualCost: number) {
  if (reservation.monthlyReservations.length === 0) return;
  const db = getDb(env);
  for (const item of reservation.monthlyReservations) {
    const adjustment = actualCost - item.estimatedCost;
    if (Math.abs(adjustment) < 0.000001) continue;
    await db`
      update ai_monthly_usage_counters
      set used_cost_estimate = greatest(used_cost_estimate + ${adjustment}, 0),
          updated_at = now()
      where subject_type = ${item.subjectType}
        and subject_id = ${item.subjectId}
        and usage_month = date_trunc('month', current_date)::date
    `;
  }
}

async function getEffectiveUsageLimits(
  env: Env,
  user: string,
  fallbackDailyLimit: number,
  fallbackMonthlyBudget: number,
): Promise<UsageLimit[]> {
  const db = getDb(env);
  const rows = await db`
    select subject_type, subject_id, daily_ai_limit, monthly_budget
    from usage_limits
    where enabled = true
      and (
        (subject_type = 'user' and subject_id = ${user})
        or (subject_type = 'global' and subject_id = '*')
      )
  `;
  const globalLimit = rows.find((row) => row.subject_type === "global");
  const userLimit = rows.find((row) => row.subject_type === "user");
  return [
    ...(globalLimit
      ? [
          {
            subjectType: "global" as const,
            subjectId: "*",
            dailyLimit: Number(globalLimit.daily_ai_limit),
            monthlyBudget: Number(globalLimit.monthly_budget ?? 0),
          },
        ]
      : fallbackMonthlyBudget > 0
        ? [
            {
              subjectType: "global" as const,
              subjectId: "*",
              dailyLimit: Number(fallbackDailyLimit),
              monthlyBudget: Number(fallbackMonthlyBudget),
            },
          ]
        : []),
    {
      subjectType: "user" as const,
      subjectId: user,
      dailyLimit: Number(userLimit?.daily_ai_limit ?? fallbackDailyLimit),
      monthlyBudget: Number(userLimit?.monthly_budget ?? 0),
    },
  ];
}

async function generateQuestions(env: Env, input: IssueInput): Promise<AiQuestion[]> {
  const aiSettings = await getAiSettings(env);
  const prompt = [
    "土木建設DXアイデア管理システムの質問生成を行う。",
    "個人情報、案件名、契約金額、認証情報は求めない。",
    "不足情報を最大3問、JSON配列で返す。",
    JSON.stringify(maskIssue(input)),
  ].join("\n");
  const result = await callClaude(env, prompt, aiSettings.model);
  const parsed = parseJson<unknown>(result);
  const questionsSchema = z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      purpose: z.string(),
      answerType: z.enum(["text", "number", "choice"]),
    }),
  );
  const questions = questionsSchema.safeParse(parsed);
  if (!questions.success) {
    throw new ApiError("AI_RESPONSE_INVALID", "AI応答の形式が不正です。", 502);
  }
  return questions.data;
}

async function structureIdea(
  env: Env,
  input: IssueInput,
  answers: Record<string, string>,
): Promise<StructuredIdea> {
  const aiSettings = await getAiSettings(env);
  const prompt = [
    "土木建設DXアイデア管理システムの構造化を行う。",
    "採用、却下、セキュリティ最終判定はしない。",
    "StructuredIdeaのcamelCase JSONだけを返す。",
    JSON.stringify({ input: maskIssue(input), answers: maskSensitiveText(JSON.stringify(answers)) }),
  ].join("\n");
  const result = await callClaude(env, prompt, aiSettings.model);
  const structured = structuredIdeaSchema.safeParse(parseJson<unknown>(result));
  if (!structured.success) {
    throw new ApiError("AI_RESPONSE_INVALID", "AI応答の形式が不正です。", 502);
  }
  return structured.data;
}

async function callClaude(env: Env, prompt: string, model: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model,
      max_tokens: 1600,
      messages: [{ role: "user", content: prompt }],
    }),
  });

  if (!response.ok) {
    throw new ApiError("AI_PROVIDER_ERROR", "Claude API接続に失敗しました。", 502);
  }

  const data = (await response.json()) as { content?: Array<{ text?: string }> };
  return data.content?.[0]?.text ?? "";
}

async function testClaudeConnection(
  env: Env,
  apiKey?: string,
  model?: string,
): Promise<AiConnectionTestResult> {
  const key = apiKey || env.ANTHROPIC_API_KEY;
  const checkedAt = new Date().toISOString();
  if (!key) {
    return {
      ok: false,
      status: "not_configured",
      message: "APIキーが設定されていません。",
      checkedAt,
    };
  }
  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: model || env.AI_MODEL,
        max_tokens: 8,
        messages: [{ role: "user", content: "Return OK." }],
      }),
    });
    return {
      ok: response.ok,
      status: response.ok ? "connected" : "error",
      message: response.ok ? "Claude API接続に成功しました。" : "Claude API接続に失敗しました。",
      keyLast4: key.slice(-4),
      checkedAt,
    };
  } catch {
    return {
      ok: false,
      status: "error",
      message: "Claude APIへ接続できませんでした。",
      keyLast4: key.slice(-4),
      checkedAt,
    };
  }
}

async function getAiSettings(env: Env): Promise<AiSettings> {
  const fallback: AiSettings = {
    provider: env.AI_PROVIDER,
    model: env.AI_MODEL,
    enabled: env.AI_ENABLED === "true",
    status: env.AI_ENABLED === "true" && env.ANTHROPIC_API_KEY ? "connected" : "disabled",
    keyLast4: env.ANTHROPIC_API_KEY ? env.ANTHROPIC_API_KEY.slice(-4) : undefined,
    dailyLimit: Number(env.DAILY_AI_LIMIT || 10),
    monthlyBudget: 0,
    updatedBy: "cloudflare-secret",
  };
  if (!env.DATABASE_URL) return fallback;
  const db = getDb(env);
  const rows = await db`
    select *
    from ai_settings
    order by updated_at desc
    limit 1
  `;
  if (!rows[0]) return fallback;
  return mapAiSettingsRow(rows[0], env);
}

function parseJson<T>(text: string): T {
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    throw new ApiError("AI_RESPONSE_INVALID", "AI応答をJSONとして解釈できませんでした。", 502);
  }
}

function maskIssue(input: IssueInput): IssueInput {
  return {
    ...input,
    workType: maskSensitiveText(input.workType),
    affectedRole: maskSensitiveText(input.affectedRole),
    currentWorkflow: maskSensitiveText(input.currentWorkflow),
    desiredState: maskSensitiveText(input.desiredState),
    usedData: maskSensitiveText(input.usedData),
    relatedSystems: maskSensitiveText(input.relatedSystems),
  };
}

async function auditAi(env: Env, user: string, processType: string, input: unknown, output: unknown) {
  const inputText = JSON.stringify(maskSensitiveText(JSON.stringify(input)));
  const outputText = JSON.stringify(maskSensitiveText(JSON.stringify(output)));
  const usageCostEstimate = estimateAiCost(env, inputText.length, outputText.length);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputText));
  const inputHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getDb(env);
  await db`
    insert into idea_ai_sessions (
      executed_by, process_type, model, input_chars, output_chars,
      result, usage_cost_estimate, prompt_version, input_hash
    )
    values (
      ${user}, ${processType}, ${env.AI_MODEL}, ${inputText.length},
      ${outputText.length}, 'success', ${usageCostEstimate}, ${`${processType}_v1`}, ${inputHash}
    )
  `;
  return usageCostEstimate;
}

async function auditAiFailure(
  env: Env,
  user: string,
  processType: string,
  input: unknown,
  error: unknown,
) {
  try {
    const inputText = JSON.stringify(maskSensitiveText(JSON.stringify(input)));
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputText));
    const inputHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
    const db = getDb(env);
    await db`
      insert into idea_ai_sessions (
        executed_by, process_type, model, input_chars, output_chars,
        result, usage_cost_estimate, prompt_version, input_hash
      )
      values (
        ${user}, ${processType}, ${env.AI_MODEL}, ${inputText.length},
        0, ${error instanceof ApiError ? error.code : "failure"}, 0, ${`${processType}_v1`}, ${inputHash}
      )
    `;
  } catch (auditError) {
    console.error("AI failure audit failed", sanitizeLog(auditError));
  }
}

function estimateAiCost(env: Env, inputChars: number, outputChars: number): number {
  const inputTokens = Math.ceil(inputChars / 4);
  const outputTokens = Math.ceil(outputChars / 4);
  const inputRate = Number(env.AI_INPUT_COST_PER_1K_TOKENS || 0.003);
  const outputRate = Number(env.AI_OUTPUT_COST_PER_1K_TOKENS || 0.015);
  const cost = (inputTokens / 1000) * inputRate + (outputTokens / 1000) * outputRate;
  return Number(cost.toFixed(6));
}

async function audit(
  env: Env,
  actor: string,
  action: string,
  resourceType: string,
  resourceId: string,
  metadata: Record<string, unknown>,
) {
  const db = getDb(env);
  await db`
    insert into audit_logs (actor, action, resource_type, resource_id, result, metadata)
    values (${actor}, ${action}, ${resourceType}, ${resourceId}, 'success', ${JSON.stringify(metadata)}::jsonb)
  `;
}

type NotificationStatus = "sent" | "skipped" | "failed";

async function notifySlack(env: Env, idea: Idea): Promise<NotificationStatus> {
  const text = [
    `新規DXアイデアが登録されました: ${idea.title}`,
    `対象業務: ${idea.targetBusiness}`,
    `ステージ: ${idea.stage}`,
    `${env.APP_BASE_URL}/ideas/${idea.id}`,
  ].join("\n");
  const maskedText = maskSensitiveText(text);
  const outboxId = await createNotificationOutbox(env, {
    eventType: "idea.submitted",
    resourceType: "idea",
    resourceId: idea.id,
    idempotencyKey: `idea.submitted:idea:${idea.id}:1`,
    payload: { text: maskedText },
  });

  if (!env.SLACK_WEBHOOK_URL) {
    await updateNotificationOutbox(env, outboxId, "skipped");
    return "skipped";
  }

  if (outboxId === "already-sent") return "sent";
  if (outboxId === "not-claimed" || !outboxId) {
    return "skipped";
  }

  try {
    const response = await postSlackWebhook(env.SLACK_WEBHOOK_URL, maskedText);
    const status = response.ok ? "sent" : "failed";
    await updateNotificationOutbox(env, outboxId, status, response.ok ? undefined : `Slack HTTP ${response.status}`);
    return status;
  } catch (error) {
    console.error("Slack notification failed", sanitizeLog(error));
    await updateNotificationOutbox(env, outboxId, "failed", String(sanitizeLog(error)));
    return "failed";
  }
}

async function retrySlackNotifications(env: Env) {
  if (!env.SLACK_WEBHOOK_URL) return;
  try {
    const db = getDb(env);
    const rows = await db`
      with claimed as (
        update notification_outbox
        set status = 'processing',
            updated_at = now()
        where id in (
          select id
          from notification_outbox
          where status = 'failed'
            and (next_attempt_at is null or next_attempt_at <= now())
          order by updated_at asc
          limit 10
          for update skip locked
        )
        returning id, payload
      )
      select *
      from claimed
    `;
    for (const row of rows) {
      const payload = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
      const text = maskSensitiveText(String((payload as { text?: unknown }).text ?? ""));
      if (!text) continue;
      try {
        const response = await postSlackWebhook(env.SLACK_WEBHOOK_URL, text);
        await updateNotificationOutbox(
          env,
          String(row.id),
          response.ok ? "sent" : "failed",
          response.ok ? undefined : `Slack HTTP ${response.status}`,
        );
      } catch (error) {
        await updateNotificationOutbox(env, String(row.id), "failed", String(sanitizeLog(error)));
      }
    }
  } catch (error) {
    console.error("Slack retry failed", sanitizeLog(error));
  }
}

async function postSlackWebhook(url: string, text: string): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SLACK_TIMEOUT_MS);
  try {
    return await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: maskSensitiveText(text) }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function createNotificationOutbox(
  env: Env,
  event: {
    eventType: string;
    resourceType: string;
    resourceId: string;
    idempotencyKey: string;
    payload: Record<string, unknown>;
  },
): Promise<string | "already-sent" | "not-claimed" | undefined> {
  try {
    const db = getDb(env);
    const rows = await db`
      insert into notification_outbox (
        event_type, resource_type, resource_id, idempotency_key, payload, status
      )
      values (
        ${event.eventType}, ${event.resourceType}, ${event.resourceId},
        ${event.idempotencyKey}, ${JSON.stringify(event.payload)}::jsonb, 'processing'
      )
      on conflict (idempotency_key) do update
      set status = 'processing',
          payload = excluded.payload,
          updated_at = now()
      where notification_outbox.status in ('pending', 'failed')
        and (notification_outbox.next_attempt_at is null or notification_outbox.next_attempt_at <= now())
      returning id, status
    `;
    if (!rows[0]) {
      const existing = await db`
        select status
        from notification_outbox
        where idempotency_key = ${event.idempotencyKey}
        limit 1
      `;
      return existing[0]?.status === "sent" ? "already-sent" : "not-claimed";
    }
    return String(rows[0]?.id);
  } catch (error) {
    console.error("Slack outbox write failed", sanitizeLog(error));
    return undefined;
  }
}

async function updateNotificationOutbox(
  env: Env,
  id: string | "already-sent" | "not-claimed" | undefined,
  status: "sent" | "failed" | "skipped",
  lastError?: string,
) {
  if (!id || id === "already-sent" || id === "not-claimed") return;
  try {
    const db = getDb(env);
    await db`
      update notification_outbox
      set status = ${status},
          attempts = attempts + case when ${status} = 'skipped' then 0 else 1 end,
          last_error = ${lastError ?? null},
          next_attempt_at = case when ${status} = 'failed' then now() + interval '10 minutes' else null end,
          updated_at = now()
      where id = ${id}
    `;
  } catch (error) {
    console.error("Slack outbox update failed", sanitizeLog(error));
  }
}

function mapIdeaRow(row: Record<string, unknown>): Idea {
  return {
    id: String(row.id),
    title: String(row.title),
    currentIssue: String(row.current_issue),
    targetBusiness: String(row.target_business),
    targetUsers: String(row.target_users),
    currentWorkflow: String(row.current_workflow),
    improvementIdea: String(row.improvement_idea),
    expectedEffects: String(row.expected_effects),
    requiredData: arrayFromJson(row.required_data),
    relatedSystems: arrayFromJson(row.related_systems),
    implementationOptions: arrayFromJson(row.implementation_options),
    securityNotes: arrayFromJson(row.security_notes),
    openQuestions: arrayFromJson(row.open_questions),
    mvpCandidate: String(row.mvp_candidate),
    mvpDoneDefinition: String(row.mvp_done_definition),
    stage: String(row.stage) as IdeaStage,
    createdBy: String(row.created_by),
    ownerId: row.owner_id ? String(row.owner_id) : undefined,
    createdAt: toIsoString(row.created_at),
    updatedAt: toIsoString(row.updated_at),
    aiUsageCount: Number(row.ai_usage_count ?? 0),
  };
}

function toIsoString(value: unknown): string {
  const date = new Date(String(value ?? ""));
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

function mapAiSettingsRow(row: Record<string, unknown>, env: Env): AiSettings {
  const enabled = Boolean(row.enabled) && env.AI_ENABLED === "true";
  return {
    provider: String(row.provider ?? env.AI_PROVIDER),
    model: String(row.model ?? env.AI_MODEL),
    enabled,
    status: enabled && row.status === "connected" ? "connected" : enabled ? "error" : "disabled",
    keyLast4: row.key_last4 ? String(row.key_last4) : undefined,
    dailyLimit: Number(row.daily_limit ?? env.DAILY_AI_LIMIT ?? 10),
    monthlyBudget: Number(row.monthly_budget ?? 0),
    lastCheckedAt: row.last_checked_at ? new Date(String(row.last_checked_at)).toISOString() : undefined,
    updatedBy: row.updated_by ? String(row.updated_by) : undefined,
  };
}

function arrayFromJson(value: unknown): string[] {
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value) as unknown;
      return Array.isArray(parsed) ? parsed.map(String) : [];
    } catch {
      return [];
    }
  }
  return [];
}

function sanitizeLog(error: unknown) {
  return String(error)
    .replace(/sk-ant-[A-Za-z0-9_-]+/g, "[ANTHROPIC_API_KEY]")
    .replace(/xox[baprs]-[A-Za-z0-9-]+/g, "[SLACK_TOKEN]")
    .replace(/https:\/\/hooks\.slack\.com\/services\/[A-Za-z0-9/_-]+/g, "[SLACK_WEBHOOK_URL]")
    .replace(/\bpostgres(?:ql)?:\/\/[^\s"'<>]+/gi, "[DATABASE_URL]")
    .replace(/\bBearer\s+[A-Za-z0-9._~+/-]+=*/gi, "Bearer [TOKEN]")
    .replace(
      /\b(api[-_ ]?key|token|secret|password|passwd|pwd)[=:]\s*[^\s"',;]+/gi,
      "$1=[SECRET]",
    );
}

class ApiError extends Error {
  constructor(
    public code: string,
    message: string,
    public status: 400 | 401 | 403 | 404 | 413 | 422 | 429 | 500 | 502 | 503,
  ) {
    super(message);
  }
}

export const workerSecurityTestHooks = {
  estimateAiCost,
  inferRoles,
  resolveCorsOrigin,
  sanitizeLog,
};

type MinimalExecutionContext = {
  passThroughOnException(): void;
  props: unknown;
  waitUntil(promise: Promise<unknown>): void;
};

export default {
  fetch: (request: Request, env: Env, ctx: MinimalExecutionContext) => app.fetch(request, env, ctx),
  scheduled: (_controller: unknown, env: Env, ctx: MinimalExecutionContext) => {
    ctx.waitUntil(retrySlackNotifications(env));
  },
};
