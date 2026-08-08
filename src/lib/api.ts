import { mockApi } from "./mockApi";
import { normalizeApiBaseUrl } from "./shared";
import type {
  AiConnectionTestResult,
  AiQuestion,
  AiSettings,
  AiSettingsPatch,
  DashboardMetrics,
  EvaluationItem,
  Idea,
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
      getEvaluationBoard: () => request<{ items: EvaluationItem[] }>("/api/ideas/evaluation"),
      exportIdeasCsv: () => fetch(`${apiBaseUrl}/api/ideas/export.csv`, { credentials: "include" }),
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
      saveIdea: (structured: StructuredIdea, stage: IdeaStage) =>
        request<SaveIdeaResult>(stage === "draft" ? "/api/ideas/drafts" : "/api/ideas", {
          method: "POST",
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
    };
