import { neon } from "@neondatabase/serverless";
import { zValidator } from "@hono/zod-validator";
import type { Context } from "hono";
import { Hono } from "hono";
import { cors } from "hono/cors";
import { secureHeaders } from "hono/secure-headers";
import { z } from "zod";
import { inspectIssueInput, inspectStructuredIdea, maskSensitiveText } from "../src/lib/privacy";
import {
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
};

type AppContext = Context<{ Bindings: Env }>;

const app = new Hono<{ Bindings: Env }>();

app.use("*", secureHeaders());
app.use(
  "*",
  cors({
    origin: (origin) => origin,
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

app.get("/api/me", (c) => {
  const user = getUser(c.req.raw);
  return c.json({ email: user, roles: inferRoles(user) });
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
    const user = getUser(c.req.raw);
    const { input } = c.req.valid("json");
    await assertAiAllowed(c.env, user, input);
    const questions = await generateQuestions(c.env, input);
    await auditAi(c.env, user, "questions", input, questions);
    return c.json(questions);
  },
);

app.post(
  "/api/ai/structure",
  zValidator("json", z.object({ input: issueInputSchema, answers: z.record(z.string(), z.string()) })),
  async (c) => {
    const user = getUser(c.req.raw);
    const { input, answers } = c.req.valid("json");
    await assertAiAllowed(c.env, user, input);
    const structured = await structureIdea(c.env, input, answers);
    const findings = inspectStructuredIdea(structured);
    if (findings.some((finding) => finding.severity === "blocker")) {
      throw new ApiError("AI_PRIVACY_FINDING", "AI応答に機密情報候補が含まれています。", 422);
    }
    await auditAi(c.env, user, "structure", input, structured);
    return c.json(structured);
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
    await notifySlack(c.env, idea);
    return c.json(idea, 201);
  },
);

app.post(
  "/api/ideas/:id/stage",
  zValidator("json", z.object({ stage: z.enum(ideaStages) })),
  async (c) => {
    const user = getUser(c.req.raw);
    requireAdmin(user);
    const db = getDb(c.env);
    const id = c.req.param("id");
    const { stage } = c.req.valid("json");
    const rows = await db`
      update ideas
      set stage = ${stage}, updated_at = now()
      where id = ${id}
      returning *
    `;
    if (!rows[0]) {
      throw new ApiError("NOT_FOUND", "Idea not found.", 404);
    }
    await audit(c.env, user, "stage.update", "idea", id, { stage });
    return c.json(mapIdeaRow(rows[0]));
  },
);

app.get("/api/admin/ai-settings", async (c) => {
  const user = getUser(c.req.raw);
  requireSystemAdmin(user);
  const settings: AiSettings = {
    provider: c.env.AI_PROVIDER,
    model: c.env.AI_MODEL,
    enabled: c.env.AI_ENABLED === "true",
    status: c.env.AI_ENABLED === "true" && c.env.ANTHROPIC_API_KEY ? "connected" : "disabled",
    keyLast4: c.env.ANTHROPIC_API_KEY ? c.env.ANTHROPIC_API_KEY.slice(-4) : undefined,
    dailyLimit: Number(c.env.DAILY_AI_LIMIT || 10),
    monthlyBudget: 0,
    updatedBy: "cloudflare-secret",
  };
  return c.json(settings);
});

app.onError((error, c) => {
  if (error instanceof ApiError) {
    return c.json({ ok: false, code: error.code, message: error.message }, error.status);
  }
  console.error("Unhandled error", sanitizeLog(error));
  return c.json({ ok: false, code: "INTERNAL_ERROR", message: "システムエラーが発生しました。" }, 500);
});

async function insertIdea(
  c: AppContext,
  structured: StructuredIdea,
  stage: IdeaStage,
): Promise<Idea> {
  const user = getUser(c.req.raw);
  const db = getDb(c.env);
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

function getUser(request: Request): string {
  return request.headers.get("CF-Access-Authenticated-User-Email") ?? "local.dev@example.com";
}

function inferRoles(user: string): string[] {
  const roles = ["user"];
  if (user.includes("admin") || user.endsWith("@example.com")) roles.push("admin", "system_admin");
  return roles;
}

function requireAdmin(user: string) {
  if (!inferRoles(user).includes("admin")) {
    throw new ApiError("FORBIDDEN", "管理者権限が必要です。", 403);
  }
}

function requireSystemAdmin(user: string) {
  if (!inferRoles(user).includes("system_admin")) {
    throw new ApiError("FORBIDDEN", "システム管理者権限が必要です。", 403);
  }
}

async function assertAiAllowed(env: Env, user: string, input: IssueInput) {
  if (env.AI_ENABLED !== "true") {
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
  const rows = await db`
    select count(*)::int as count
    from idea_ai_sessions
    where executed_by = ${user}
      and created_at >= date_trunc('day', now())
  `;
  if ((rows[0]?.count ?? 0) >= Number(env.DAILY_AI_LIMIT || 10)) {
    throw new ApiError("AI_BUDGET_EXCEEDED", "日次AI利用上限に達しました。", 429);
  }
}

async function generateQuestions(env: Env, input: IssueInput): Promise<AiQuestion[]> {
  const prompt = [
    "土木建設DXアイデア管理システムの質問生成を行う。",
    "個人情報、案件名、契約金額、認証情報は求めない。",
    "不足情報を最大3問、JSON配列で返す。",
    JSON.stringify(maskIssue(input)),
  ].join("\n");
  const result = await callClaude(env, prompt);
  return parseJson<AiQuestion[]>(result, [
    {
      id: "q-frequency",
      question: "この作業は月に何回ありますか。",
      purpose: "効果見込みを確認するため",
      answerType: "number",
    },
    {
      id: "q-time",
      question: "1回あたり何分程度かかりますか。",
      purpose: "削減可能な時間を確認するため",
      answerType: "number",
    },
    {
      id: "q-share",
      question: "作業結果を誰と共有していますか。",
      purpose: "関係者と通知範囲を確認するため",
      answerType: "text",
    },
  ]);
}

async function structureIdea(
  env: Env,
  input: IssueInput,
  answers: Record<string, string>,
): Promise<StructuredIdea> {
  const prompt = [
    "土木建設DXアイデア管理システムの構造化を行う。",
    "採用、却下、セキュリティ最終判定はしない。",
    "StructuredIdeaのcamelCase JSONだけを返す。",
    JSON.stringify({ input: maskIssue(input), answers: maskSensitiveText(JSON.stringify(answers)) }),
  ].join("\n");
  const result = await callClaude(env, prompt);
  return structuredIdeaSchema.parse(parseJson<StructuredIdea>(result, fallbackStructured(input)));
}

async function callClaude(env: Env, prompt: string): Promise<string> {
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": env.ANTHROPIC_API_KEY ?? "",
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: env.AI_MODEL,
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

function parseJson<T>(text: string, fallback: T): T {
  try {
    const clean = text.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    return JSON.parse(clean) as T;
  } catch {
    return fallback;
  }
}

function fallbackStructured(input: IssueInput): StructuredIdea {
  return {
    title: `${input.workType.slice(0, 28)}の改善`,
    currentIssue: input.workType,
    targetBusiness: input.workType,
    targetUsers: input.affectedRole || "現場管理者",
    currentWorkflow: input.currentWorkflow,
    improvementIdea: input.desiredState,
    expectedEffects: "作業時間削減、確認漏れ低減、共有の迅速化。",
    requiredData: [input.usedData || "作業データ"],
    relatedSystems: [input.relatedSystems || "未確認"],
    implementationOptions: ["Web入力", "一覧管理", "Slack通知"],
    securityNotes: ["AI送信前の機密情報確認が必要"],
    openQuestions: ["対象範囲", "既存運用との整合"],
    mvpCandidate: "1現場または1部署で限定検証する。",
    mvpDoneDefinition: "利用者が登録から検討まで一連の操作を完了できること。",
  };
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
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(inputText));
  const inputHash = [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
  const db = getDb(env);
  await db`
    insert into idea_ai_sessions (
      executed_by, process_type, model, input_chars, output_chars,
      result, prompt_version, input_hash
    )
    values (
      ${user}, ${processType}, ${env.AI_MODEL}, ${inputText.length},
      ${outputText.length}, 'success', ${`${processType}_v1`}, ${inputHash}
    )
  `;
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

async function notifySlack(env: Env, idea: Idea) {
  if (!env.SLACK_WEBHOOK_URL) return;
  const text = [
    `新規DXアイデアが登録されました: ${idea.title}`,
    `対象業務: ${idea.targetBusiness}`,
    `ステージ: ${idea.stage}`,
    `${env.APP_BASE_URL}/ideas/${idea.id}`,
  ].join("\n");
  await fetch(env.SLACK_WEBHOOK_URL, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ text }),
  });
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
    createdAt: new Date(String(row.created_at)).toISOString(),
    updatedAt: new Date(String(row.updated_at)).toISOString(),
    aiUsageCount: Number(row.ai_usage_count ?? 0),
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
  return String(error).replace(/sk-ant-[A-Za-z0-9_-]+/g, "[ANTHROPIC_API_KEY]");
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

export default app;
