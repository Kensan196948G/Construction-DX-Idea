import { mockApi } from "./mockApi";
import type {
  AiQuestion,
  AiSettings,
  DashboardMetrics,
  Idea,
  IdeaStage,
  IssueInput,
  PrivacyFinding,
  StructuredIdea,
} from "./shared";

const useMock = import.meta.env.VITE_USE_MOCK_API !== "false";
const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...init?.headers,
    },
    ...init,
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: response.statusText }));
    throw new Error(error.message ?? "API request failed");
  }

  return response.json() as Promise<T>;
}

export const api = useMock
  ? mockApi
  : {
      getMetrics: () => request<DashboardMetrics>("/api/metrics"),
      listIdeas: () => request<Idea[]>("/api/ideas"),
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
        request<Idea>(stage === "draft" ? "/api/ideas/drafts" : "/api/ideas", {
          method: "POST",
          body: JSON.stringify({ structured }),
        }),
      updateStage: (id: string, stage: IdeaStage) =>
        request<Idea>(`/api/ideas/${id}/stage`, {
          method: "POST",
          body: JSON.stringify({ stage }),
        }),
      getAiSettings: () => request<AiSettings>("/api/admin/ai-settings"),
    };
