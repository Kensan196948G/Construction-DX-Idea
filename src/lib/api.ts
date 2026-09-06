import { mockApi } from "./mockApi";
import type { AiEvalSummary } from "./aiEval";
import { normalizeApiBaseUrl } from "./shared";
import type {
  AppUser,
  AppUserInput,
  ApprovalDecision,
  ApprovalRequest,
  AuditChainVerifyResult,
  AiConnectionTestResult,
  AiQuestion,
  AiSettings,
  AiSettingsPatch,
  AiStructureResponse,
  AiUsageSummary,
  AuditLogEntry,
  Authority,
  DashboardMetrics,
  EvaluationItem,
  GateApprovalRequest,
  GateDecisionInput,
  GateListResult,
  GateNo,
  GateOverviewResult,
  GateReminderRunResult,
  GitHubSyncResult,
  Idea,
  IdeaComment,
  IdeaGateApproval,
  IdeaGitHubOverviewResult,
  IdeaHistory,
  IdeaListParams,
  IdeaRepoLink,
  IdeaRepoListResult,
  IdeaStage,
  IdeaValuePhaseEntry,
  InformationClassification,
  IssueInput,
  IdeaKpi,
  KnowledgeCandidate,
  KpiOutcome,
  PocPlan,
  PocPlanInput,
  PortfolioSummary,
  PortfolioSummaryRow,
  PrivacyFinding,
  RagSearchResult,
  SaveIdeaResult,
  StructuredIdea,
  UatChecklistInput,
  UatFeedbackEntry,
  UatFeedbackInput,
  UatFeedbackResult,
  UatFeedbackSummary,
  UserProfile,
} from "./shared";

const explicitMock = !import.meta.env.PROD && import.meta.env.VITE_USE_MOCK_API === "true";
const apiBaseUrl = normalizeApiBaseUrl(import.meta.env.VITE_API_BASE_URL || "");
const useMock =
  explicitMock ||
  (!import.meta.env.PROD && import.meta.env.VITE_USE_MOCK_API !== "false" && !apiBaseUrl);
const API_TIMEOUT_MS = 15_000;

export const isMockApi = useMock;

export class ApiClientError extends Error {
  constructor(
    message: string,
    public code?: string,
    public requestId?: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const callerSignal = init?.signal;
  const timeoutId = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  const abortFromCaller = () => controller.abort();

  if (callerSignal?.aborted) {
    controller.abort();
  } else {
    callerSignal?.addEventListener("abort", abortFromCaller, { once: true });
  }

  try {
    const { headers, ...requestInit } = init ?? {};
    const response = await fetch(`${apiBaseUrl}${path}`, {
      ...requestInit,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      signal: controller.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ message: response.statusText }));
      throw new ApiClientError(error.message ?? "API request failed", error.code, error.request_id);
    }

    return response.json() as Promise<T>;
  } catch (error) {
    if (controller.signal.aborted && !callerSignal?.aborted) {
      throw new Error("API request timed out");
    }
    throw error;
  } finally {
    clearTimeout(timeoutId);
    callerSignal?.removeEventListener("abort", abortFromCaller);
  }
}

export const api = useMock
  ? mockApi
  : {
      getMe: () => request<UserProfile>("/api/me"),
      getMetrics: () => request<DashboardMetrics>("/api/metrics"),
      listIdeas: (params: IdeaListParams = {}) => {
        const query = new URLSearchParams();
        if (params.q) query.set("q", params.q);
        if (params.stage) query.set("stage", params.stage);
        if (params.limit) query.set("limit", String(params.limit));
        const suffix = query.toString() ? `?${query.toString()}` : "";
        return request<Idea[]>(`/api/ideas${suffix}`);
      },
      getIdea: (id: string) => request<Idea>(`/api/ideas/${id}`),
      updateIdea: (id: string, patch: Partial<StructuredIdea>) =>
        request<Idea>(`/api/ideas/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ patch }),
        }),
      getComments: (id: string) =>
        request<{ items: IdeaComment[] }>(`/api/ideas/${id}/comments`),
      addComment: (id: string, body: string) =>
        request<IdeaComment>(`/api/ideas/${id}/comments`, {
          method: "POST",
          body: JSON.stringify({ body }),
        }),
      requestApproval: (id: string, payload: ApprovalRequest) =>
        request<Idea>(`/api/ideas/${id}/request-approval`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      decideApproval: (id: string, payload: ApprovalDecision) =>
        request<Idea>(`/api/ideas/${id}/approval`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      initGates: (id: string) =>
        request<GateListResult>(`/api/ideas/${id}/gates/init`, { method: "POST" }),
      getGates: (id: string) => request<GateListResult>(`/api/ideas/${id}/gates`),
      requestGateApproval: (id: string, gateNo: GateNo, payload: GateApprovalRequest) =>
        request<IdeaGateApproval>(`/api/ideas/${id}/gates/${gateNo}/request-approval`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      decideGateApproval: (id: string, gateNo: GateNo, payload: GateDecisionInput & { authority?: Authority }) =>
        request<IdeaGateApproval>(`/api/ideas/${id}/gates/${gateNo}/approval`, {
          method: "POST",
          body: JSON.stringify(payload),
        }),
      // Gate滞留分析（docs/29 §2.7・migration 014・管理者限定）。
      getGateOverview: () => request<GateOverviewResult>("/api/admin/gates/overview"),
      // Gateリマインダー/エスカレーション実行（管理者限定・日次cronと同一処理）。
      runGateReminders: () =>
        request<GateReminderRunResult>("/api/admin/gates/reminders/run", { method: "POST" }),
      // GitHub Engineering 連携（docs/29 §2.12・migration 015）。
      listIdeaRepos: (id: string) => request<IdeaRepoListResult>(`/api/ideas/${id}/repos`),
      linkIdeaRepo: (id: string, repoFullName: string) =>
        request<IdeaRepoLink>(`/api/ideas/${id}/repos`, {
          method: "POST",
          body: JSON.stringify({ repoFullName }),
        }),
      unlinkIdeaRepo: (id: string, linkId: string) =>
        request<{ ok: boolean }>(`/api/ideas/${id}/repos/${linkId}`, { method: "DELETE" }),
      getIdeaGitHubOverview: (id: string) =>
        request<IdeaGitHubOverviewResult>(`/api/ideas/${id}/github/overview`),
      syncIdeaGitHub: (id: string) =>
        request<GitHubSyncResult>(`/api/ideas/${id}/github/sync`, { method: "POST" }),
      // Knowledge Management（docs/29 §2.16・migration 016）。
      listKnowledge: (params: { status?: string; category?: string } = {}) => {
        const query = new URLSearchParams();
        if (params.status) query.set("status", params.status);
        if (params.category) query.set("category", params.category);
        const suffix = query.toString() ? `?${query.toString()}` : "";
        return request<{ items: KnowledgeCandidate[] }>(`/api/knowledge${suffix}`);
      },
      submitKnowledge: (input: {
        title: string;
        category: KnowledgeCandidate["category"];
        body?: string;
        sourceIdeaId?: string;
      }) =>
        request<KnowledgeCandidate>("/api/knowledge", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      extractKnowledge: () =>
        request<{ created: number; scanned: Record<string, number> }>(
          "/api/knowledge/extract",
          { method: "POST" },
        ),
      reviewKnowledge: (
        id: string,
        input: { action: "approve" | "reject"; qualityScore?: number; note?: string },
      ) =>
        request<KnowledgeCandidate>(`/api/knowledge/${id}/review`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      promoteKnowledge: (id: string, url: string) =>
        request<KnowledgeCandidate>(`/api/knowledge/${id}/promote`, {
          method: "POST",
          body: JSON.stringify({ url }),
        }),
      getEvaluationBoard: () => request<{ items: EvaluationItem[] }>("/api/ideas/evaluation"),
      getPortfolio: () => request<{ summary: PortfolioSummary; items: PortfolioSummaryRow[] }>("/api/portfolio"),
      recordKpi: (
        id: string,
        input: {
          targetReductionPct?: number;
          actualReductionPct?: number;
          measuredAt?: string;
          periodMonths?: number;
          outcome?: KpiOutcome;
          reviewNote?: string;
        },
      ) =>
        request<IdeaKpi>(`/api/ideas/${id}/kpi`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      getIdeaKpis: (id: string) =>
        request<{
          kpiBaselineHours: number | null;
          kpiBaselineCost: number | null;
          records: IdeaKpi[];
        }>(`/api/ideas/${id}/kpi`),
      updateKpiBaseline: (
        id: string,
        baseline: { kpiBaselineHours?: number | null; kpiBaselineCost?: number | null; reason?: string },
      ) =>
        request<Idea>(`/api/ideas/${id}/kpi/baseline`, {
          method: "PATCH",
          body: JSON.stringify(baseline),
        }),
      getPocPlan: (id: string) =>
        request<{ plan: PocPlan; feedbackSummary: UatFeedbackSummary }>(`/api/ideas/${id}/poc`),
      updatePocPlan: (id: string, input: PocPlanInput) =>
        request<PocPlan>(`/api/ideas/${id}/poc`, { method: "PUT", body: JSON.stringify(input) }),
      updateUatChecklist: (id: string, input: UatChecklistInput) =>
        request<PocPlan>(`/api/ideas/${id}/poc/checklist`, { method: "PUT", body: JSON.stringify(input) }),
      getUatFeedback: (id: string) => request<UatFeedbackResult>(`/api/ideas/${id}/uat-feedback`),
      submitUatFeedback: (id: string, input: UatFeedbackInput) =>
        request<UatFeedbackEntry>(`/api/ideas/${id}/uat-feedback`, {
          method: "POST",
          body: JSON.stringify(input),
        }),
      exportIdeasCsv: () => fetch(`${apiBaseUrl}/api/ideas/export.csv`, { credentials: "include" }),
      exportIdeasXls: () => fetch(`${apiBaseUrl}/api/ideas/export.xls`, { credentials: "include" }),
      getIdeaHistory: (id: string) => request<IdeaHistory>(`/api/ideas/${id}/history`),
      getSimilarIdeas: (id: string, limit = 5) =>
        request<RagSearchResult>(`/api/ideas/${id}/similar?limit=${limit}`),
      searchRag: (q: string, limit = 5) => {
        const query = new URLSearchParams();
        query.set("q", q);
        query.set("limit", String(limit));
        return request<RagSearchResult>(`/api/rag/search?${query.toString()}`);
      },
      getIdeaPhase: (id: string) => request<IdeaValuePhaseEntry>(`/api/ideas/${id}/phase`),
      updateIdeaPhase: (
        id: string,
        payload: { phaseNo: number; reason?: string; note?: string },
      ) =>
        request<{ ideaId: string; phaseNo: number; phaseLabel: string; fromPhase: number; reason: string }>(
          `/api/ideas/${id}/phase`,
          { method: "POST", body: JSON.stringify(payload) },
        ),
      inspectInput: (input: IssueInput) =>
        request<PrivacyFinding[]>("/api/privacy/inspect", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      generateQuestions: (input: IssueInput) =>
        request<AiQuestion[]>("/api/ai/questions", {
          method: "POST",
          body: JSON.stringify({ input }),
        }),
      structureIdea: (input: IssueInput, answers: Record<string, string>) =>
        request<AiStructureResponse>("/api/ai/structure", {
          method: "POST",
          body: JSON.stringify({ input, answers }),
        }),
      saveIdea: (structured: StructuredIdea, stage: IdeaStage, idempotencyKey?: string) =>
        request<SaveIdeaResult>(stage === "draft" ? "/api/ideas/drafts" : "/api/ideas", {
          method: "POST",
          headers: idempotencyKey ? { "Idempotency-Key": idempotencyKey } : undefined,
          body: JSON.stringify({ structured }),
        }),
      updateStage: (id: string, stage: IdeaStage, reason?: string) =>
        request<Idea>(`/api/ideas/${id}/stage`, {
          method: "POST",
          body: JSON.stringify(reason ? { stage, reason } : { stage }),
        }),
      updateClassification: (
        id: string,
        informationClassification: InformationClassification,
        classificationNotes?: string,
        reason?: string,
      ) =>
        request<Idea>(`/api/ideas/${id}/classification`, {
          method: "PATCH",
          body: JSON.stringify({ informationClassification, classificationNotes, reason }),
        }),
      getAiSettings: () => request<AiSettings>("/api/admin/ai-settings"),
      updateAiSettings: (settings: AiSettingsPatch) =>
        request<AiSettings>("/api/admin/ai-settings", {
          method: "PATCH",
          body: JSON.stringify(settings),
        }),
      testAiSettings: (apiKey?: string, model?: string, provider?: string) =>
        request<AiConnectionTestResult>("/api/admin/ai-settings/test", {
          method: "POST",
          body: JSON.stringify({ apiKey, model, provider }),
        }),
      runAiEval: (provider: "demo" | "current" = "demo") =>
        request<AiEvalSummary>("/api/admin/ai-eval", {
          method: "POST",
          body: JSON.stringify({ provider }),
        }),
      getAuditLogs: (limit = 100) =>
        request<{ items: AuditLogEntry[] }>(`/api/admin/audit-logs?limit=${limit}`),
      getAiUsage: () => request<AiUsageSummary>("/api/admin/ai-usage"),
      verifyAuditLogs: () => request<AuditChainVerifyResult>("/api/admin/audit-logs/verify"),
      exportAuditLogsCsv: () =>
        fetch(`${apiBaseUrl}/api/admin/audit-logs/export.csv`, { credentials: "include" }),
      exportAuditLogsXls: () =>
        fetch(`${apiBaseUrl}/api/admin/audit-logs/export.xls`, { credentials: "include" }),
      exportAuditLogsHtml: () =>
        fetch(`${apiBaseUrl}/api/admin/audit-logs/export.html`, { credentials: "include" }),
      getUsers: () => request<{ items: AppUser[] }>("/api/admin/users"),
      createUser: (input: AppUserInput) =>
        request<AppUser>("/api/admin/users", {
          method: "POST",
          body: JSON.stringify(input),
        }),
      updateUser: (
        id: string,
        // authorityはnullで「未設定に戻す」を明示できる（サーバー側は
        // フィールド有無で判定するため、undefinedとnullを区別する）。
        patch: Partial<Omit<AppUserInput, "authority">> & { authority?: AppUserInput["authority"] | null },
      ) =>
        request<AppUser>(`/api/admin/users/${id}`, {
          method: "PATCH",
          body: JSON.stringify(patch),
        }),
      deleteUser: (id: string) =>
        request<{ ok: boolean }>(`/api/admin/users/${id}`, {
          method: "DELETE",
        }),
    };
