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

export const approvalStatuses = [
  "none",
  "requested",
  "approved",
  "rejected",
  "returned",
] as const;

export type ApprovalStatus = (typeof approvalStatuses)[number];

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

const structuredListItemSchema = z.string().min(1).max(500);
const structuredListSchema = z.array(structuredListItemSchema).max(50);

export const issueInputSchema = z.object({
  workType: z.string().min(1).max(2000),
  affectedRole: z.string().max(500).optional().default(""),
  currentWorkflow: z.string().min(1).max(2000),
  desiredState: z.string().min(1).max(2000),
  usedData: z.string().max(2000).optional().default(""),
  relatedSystems: z.string().max(1000).optional().default(""),
  confidentiality: z.enum(["none", "possible", "unknown"]),
}).strict();

export type IssueInput = z.infer<typeof issueInputSchema>;

export const structuredIdeaSchema = z.object({
  title: z.string().min(1).max(160),
  currentIssue: z.string().min(1).max(4000),
  targetBusiness: z.string().max(1000),
  targetUsers: z.string().max(1000),
  currentWorkflow: z.string().max(4000),
  improvementIdea: z.string().max(4000),
  expectedEffects: z.string().max(4000),
  requiredData: structuredListSchema.default([]),
  relatedSystems: structuredListSchema.default([]),
  implementationOptions: structuredListSchema.default([]),
  securityNotes: structuredListSchema.default([]),
  openQuestions: structuredListSchema.default([]),
  mvpCandidate: z.string().max(4000),
  mvpDoneDefinition: z.string().max(4000),
  // Submitter context collected on the intake form (Issue #14). Kept
  // optional so older clients and direct API callers remain compatible.
  department: z.string().max(200).optional().default(""),
  submitterName: z.string().max(200).optional().default(""),
  submitterEmail: z.string().max(320).optional().default(""),
  coordinationNeeded: z.string().max(1000).optional().default(""),
}).strict();

export type StructuredIdea = z.infer<typeof structuredIdeaSchema>;

export const ideaSchema = structuredIdeaSchema.extend({
  id: z.string(),
  stage: z.enum(ideaStages),
  approvalStatus: z.enum(approvalStatuses).optional(),
  approverEmail: z.string().max(320).optional(),
  approvalRequestedAt: z.string().optional(),
  approvalActedAt: z.string().optional(),
  approvalReason: z.string().max(500).optional(),
  createdBy: z.string(),
  ownerId: z.string().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
  aiUsageCount: z.number().int().nonnegative().default(0),
  priorityScore: z.number().optional(),
  reasons: z.array(z.string()).optional(),
});

export type Idea = z.infer<typeof ideaSchema>;

export type NotificationStatus = "sent" | "skipped" | "failed";

export type SaveIdeaResult = Idea & {
  notificationStatus?: NotificationStatus;
};

export type IdeaComment = {
  id: string;
  ideaId: string;
  author: string;
  body: string;
  createdAt: string;
};

export type ApprovalRequest = {
  approverEmail: string;
  reason?: string;
};

export type ApprovalDecision = {
  decision: "approve" | "reject" | "return";
  reason: string;
};

export type AuditChainVerifyResult = {
  valid: boolean;
  checked: number;
  legacyRows: number;
  firstBrokenId?: string;
};

export type PrivacyFinding = {
  type:
    | "email"
    | "employee_id"
    | "ip_address"
    | "project_number"
    | "money"
    | "person_name"
    | "customer_name"
    | "construction_name"
    | "credential"
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

export type UserProfile = {
  email: string;
  roles: string[];
};

export type AiSettingsPatch = {
  model: string;
  enabled: boolean;
  dailyLimit: number;
  monthlyBudget: number;
};

export type AiConnectionTestResult = {
  ok: boolean;
  status: "connected" | "error" | "not_configured";
  message: string;
  keyLast4?: string;
  checkedAt: string;
};

export type DashboardMetrics = {
  totalIdeas: number;
  activeIdeas: number;
  mvpIdeas: number;
  securityWarnings: number;
  aiCallsToday: number;
  stageCounts: Record<string, number>;
  submittedLast7Days: number;
  rejectedCount: number;
  avgPriorityScore: number;
};

export type AuditLogEntry = {
  id: string;
  actor: string;
  action: string;
  resourceType: string;
  resourceId?: string;
  result: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type AiUsageSummary = {
  summary: {
    totalCalls: number;
    successCalls: number;
    failedCalls: number;
    totalCostEstimate: number;
  };
  recent: Array<{
    executedBy: string;
    processType: string;
    model: string;
    inputChars: number;
    outputChars: number;
    result: string;
    usageCostEstimate: number;
    promptVersion: string;
    createdAt: string;
  }>;
};

export type EvaluationItem = Idea & {
  priorityScore: number;
  reasons: string[];
};

export type StageHistoryEntry = {
  fromStage?: string;
  toStage: string;
  changedBy: string;
  reason: string;
  changedAt: string;
};

export type IdeaDecisionEntry = {
  decision: string;
  reason: string;
  decidedBy: string;
  decidedAt: string;
};

export type IdeaHistory = {
  history: StageHistoryEntry[];
  decisions: IdeaDecisionEntry[];
};

export type IdeaListParams = {
  q?: string;
  stage?: IdeaStage;
  limit?: number;
};

// Request paths in the API client already carry the /api prefix, so the
// configured base must be an origin without a trailing /api segment.
// Accepts values like "https://host", "https://host/", "https://host/api",
// "https://host/api/" and returns the origin form; empty input stays empty
// (same-origin relative requests).
export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/api$/i, "");
}
