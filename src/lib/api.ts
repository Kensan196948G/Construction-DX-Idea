import { mockApi } from "./mockApi";
import { normalizeApiBaseUrl } from "./shared";
import type {
  ApprovalDecision,
  ApprovalRequest,
  AuditChainVerifyResult,
  AiConnectionTestResult,
  AiQuestion,
  AiSettings,
  AiSettingsPatch,
  AiUsageSummary,
  AuditLogEntry,
  DashboardMetrics,
  EvaluationItem,
  Idea,
  IdeaComment,
  IdeaHistory,
  IdeaListParams,
  IdeaStage,
  IssueInput,
  PrivacyFinding,
  SaveIdeaResult,
  StructuredIdea,
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
      getEvaluationBoard: () => request<{ items: EvaluationItem[] }>("/api/ideas/evaluation"),
      exportIdeasCsv: () => fetch(`${apiBaseUrl}/api/ideas/export.csv`, { credentials: "include" }),
      exportIdeasXls: () => fetch(`${apiBaseUrl}/api/ideas/export.xls`, { credentials: "include" }),
      getIdeaHistory: (id: string) => request<IdeaHistory>(`/api/ideas/${id}/history`),
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
        request<StructuredIdea>("/api/ai/structure", {
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
      getAiSettings: () => request<AiSettings>("/api/admin/ai-settings"),
      updateAiSettings: (settings: AiSettingsPatch) =>
        request<AiSettings>("/api/admin/ai-settings", {
          method: "PATCH",
          body: JSON.stringify(settings),
        }),
      testAiSettings: (apiKey?: string, model?: string) =>
        request<AiConnectionTestResult>("/api/admin/ai-settings/test", {
          method: "POST",
          body: JSON.stringify({ apiKey, model }),
        }),
      getAuditLogs: (limit = 100) =>
        request<{ items: AuditLogEntry[] }>(`/api/admin/audit-logs?limit=${limit}`),
      getAiUsage: () => request<AiUsageSummary>("/api/admin/ai-usage"),
      verifyAuditLogs: () => request<AuditChainVerifyResult>("/api/admin/audit-logs/verify"),
    };
