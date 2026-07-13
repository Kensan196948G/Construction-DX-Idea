import { z } from "zod";

export const ideaStages = [
  "draft",
  "submitted",
  "planning",
  "mvp",
  "verification",
  "production_candidate",
  "production",
  "rejected",
  "archived",
] as const;

export type IdeaStage = (typeof ideaStages)[number];

export const stageLabels: Record<IdeaStage, string> = {
  draft: "下書き",
  submitted: "正式登録",
  planning: "企画中",
  mvp: "MVP開発中",
  verification: "検証中",
  production_candidate: "本番化候補",
  production: "本番運用",
  rejected: "却下",
  archived: "保管",
};

export const issueInputSchema = z.object({
  workType: z.string().min(1).max(2000),
  affectedRole: z.string().max(500).optional().default(""),
  currentWorkflow: z.string().min(1).max(2000),
  desiredState: z.string().min(1).max(2000),
  usedData: z.string().max(2000).optional().default(""),
  relatedSystems: z.string().max(1000).optional().default(""),
  confidentiality: z.enum(["none", "possible", "unknown"]),
});

export type IssueInput = z.infer<typeof issueInputSchema>;

export const structuredIdeaSchema = z.object({
  title: z.string().min(1).max(160),
  currentIssue: z.string().min(1).max(4000),
  targetBusiness: z.string().max(1000),
  targetUsers: z.string().max(1000),
  currentWorkflow: z.string().max(4000),
  improvementIdea: z.string().max(4000),
  expectedEffects: z.string().max(4000),
  requiredData: z.array(z.string()).default([]),
  relatedSystems: z.array(z.string()).default([]),
  implementationOptions: z.array(z.string()).default([]),
  securityNotes: z.array(z.string()).default([]),
  openQuestions: z.array(z.string()).default([]),
  mvpCandidate: z.string().max(4000),
  mvpDoneDefinition: z.string().max(4000),
});

export type StructuredIdea = z.infer<typeof structuredIdeaSchema>;

export const ideaSchema = structuredIdeaSchema.extend({
  id: z.string(),
  stage: z.enum(ideaStages),
  createdBy: z.string(),
  ownerId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  aiUsageCount: z.number().int().nonnegative().default(0),
});

export type Idea = z.infer<typeof ideaSchema>;

export type PrivacyFinding = {
  type:
    | "email"
    | "employee_id"
    | "ip_address"
    | "project_number"
    | "money"
    | "confidentiality_flag";
  label: string;
  severity: "warning" | "blocker";
  excerpt: string;
};

export type AiQuestion = {
  id: string;
  question: string;
  purpose: string;
  answerType: "text" | "number" | "choice";
};

export type AiSettings = {
  provider: string;
  model: string;
  enabled: boolean;
  status: "not_configured" | "connected" | "error" | "disabled";
  keyLast4?: string;
  dailyLimit: number;
  monthlyBudget: number;
  lastCheckedAt?: string;
  updatedBy?: string;
};

export type DashboardMetrics = {
  totalIdeas: number;
  activeIdeas: number;
  mvpIdeas: number;
  securityWarnings: number;
  aiCallsToday: number;
};
