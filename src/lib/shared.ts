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

/**
 * "demo" is a deterministic, cost-free provider for the MVP/Prototype
 * environment only. It never calls an external AI API and is rejected by the
 * Worker unless ALLOW_LOCAL_AUTH_BYPASS is enabled.
 */
export const aiProviders = ["claude", "deepseek", "demo"] as const;
export type AiProvider = (typeof aiProviders)[number];

export const aiProviderModels: Record<AiProvider, readonly string[]> = {
  claude: ["claude-sonnet-5", "claude-opus-5"],
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  demo: ["demo-local"],
};

export const aiModels = [
  "claude-sonnet-5",
  "claude-opus-5",
  "deepseek-chat",
  "deepseek-reasoner",
  "demo-local",
] as const;

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

// ---- 20フェーズ Idea-to-Value 進捗管理（docs/New/ai-dx-dev-process.md #04）----
// 各案件の進捗を20フェーズで正式管理する（migration 010 / Issue #58相当）。
// stage（運用上の区分）と phase（Idea-to-Value の詳細フェーズ）は別軸で、
// 後方互換のため stage から phase への初期マッピングを持つ。

export const ideaToValuePhaseCount = 20;

export type IdeaValuePhaseMeta = {
  no: number;
  label: string;
  stage: string; // Idea / Planning / Definition / MVP / Staging / Production / Operation / Knowledge
};

export const ideaValuePhases: readonly IdeaValuePhaseMeta[] = [
  { no: 1, label: "アイデア受付", stage: "Idea" },
  { no: 2, label: "課題明確化", stage: "Idea" },
  { no: 3, label: "アイデア構造化", stage: "Idea" },
  { no: 4, label: "企画候補登録", stage: "Planning" },
  { no: 5, label: "案件ID発番", stage: "Planning" },
  { no: 6, label: "企画検討", stage: "Planning" },
  { no: 7, label: "企画審査（Gate1）", stage: "Gate1" },
  { no: 8, label: "要件定義", stage: "Definition" },
  { no: 9, label: "要件承認（Gate2）", stage: "Gate2" },
  { no: 10, label: "開発案件化", stage: "MVP" },
  { no: 11, label: "MVP開発", stage: "MVP" },
  { no: 12, label: "テスト", stage: "MVP" },
  { no: 13, label: "MVP評価（Gate3）", stage: "Gate3" },
  { no: 14, label: "Staging", stage: "Staging" },
  { no: 15, label: "業務受入試験（Gate4）", stage: "Gate4" },
  { no: 16, label: "本番承認（Gate5）", stage: "Gate5" },
  { no: 17, label: "Production Deploy", stage: "Production" },
  { no: 18, label: "DevSecOps", stage: "Operation" },
  { no: 19, label: "効果測定", stage: "Operation" },
  { no: 20, label: "ナレッジ化・継続判断", stage: "Knowledge" },
];

export const ideaValuePhaseLabels: Record<number, string> = Object.fromEntries(
  ideaValuePhases.map((p) => [p.no, p.label]),
);

export type IdeaValuePhaseState = "done" | "current" | "todo";

export type IdeaValuePhaseEntry = {
  ideaId: string;
  // サーバーは stage からフォールバックして常に 1-20 を返す。
  phaseNo: number;
  phaseLabel: string;
  phaseNote?: string;
  history: Array<{
    id: string;
    fromPhase?: number;
    toPhase: number;
    reason?: string;
    changedBy?: string;
    createdAt: string;
  }>;
  phases: Array<{
    no: number;
    label: string;
    stage: string;
    state: IdeaValuePhaseState;
  }>;
};

// stage（既存の運用区分）から20フェーズの初期値への後方互換マッピング。
export function defaultPhaseForStage(stage: IdeaStage): number | null {
  const map: Partial<Record<IdeaStage, number>> = {
    draft: 1,
    submitted: 4,
    planning: 6,
    mvp: 11,
    verification: 13,
    production_candidate: 15,
    production: 17,
  };
  return map[stage] ?? null;
}

export function ideaValuePhaseLabel(phaseNo: number | null | undefined): string {
  if (phaseNo == null) return "未設定";
  return ideaValuePhaseLabels[phaseNo] ?? `フェーズ${phaseNo}`;
}

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
  // DX-YYYY-NNNN形式の全社案件ID。下書き（stage=draft）の間は未採番（#48）。
  caseId: z.string().optional(),
  stage: z.enum(ideaStages),
  approvalStatus: z.enum(approvalStatuses).optional(),
  approverEmail: z.string().max(320).optional(),
  approvalRequestedAt: z.string().optional(),
  approvalActedAt: z.string().optional(),
  approvalReason: z.string().max(500).optional(),
  // 20フェーズ Idea-to-Value 進捗（migration 010）。null=未設定。
  phaseNo: z.number().int().min(1).max(20).nullable().optional(),
  phaseNote: z.string().max(1000).optional(),
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

// Gate拡張・Authority制 多段階承認フロー（#50）。
// 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md #05）のGate1〜5に対応。
export const gateNumbers = [1, 2, 3, 4, 5] as const;
export type GateNo = (typeof gateNumbers)[number];

export const gateApprovalStatuses = ["pending", "requested", "approved", "rejected", "returned"] as const;
export type GateApprovalStatus = (typeof gateApprovalStatuses)[number];

export const gateLabels: Record<GateNo, string> = {
  1: "Gate1 企画承認",
  2: "Gate2 開発承認",
  3: "Gate3 MVP承認",
  4: "Gate4 本番移行承認",
  5: "Gate5 Release承認",
};

// 各ゲートの主承認Authority（docs/New/ai-dx-dev-process.md #05の主担当を単純化）。
export const gateRequiredAuthority: Record<GateNo, Authority> = {
  1: "business",
  2: "domain",
  3: "domain",
  4: "business",
  5: "engineering",
};

// 複数Authority共同承認ポリシー（migration 009 / Issue #57）。
// docs/New/ai-dx-dev-process.md #05「承認の主な関与者」表（Gate1〜5の行）に基づき、
// 各Gateを通過するために承認が必要なAuthorityの組合せを定義する。
// 先頭が主承認Authority（gateRequiredAuthority と一致）で、残りが共同承認者。
//   Gate1 企画承認     -> business(経営企画・主) + domain(建設土木技術) + engineering(IT/DX)
//   Gate2 開発承認     -> domain(技術仕様の主) + engineering
//   Gate3 MVP承認      -> domain(技術受入の主) + engineering + business(最終確認)
//   Gate4 本番移行承認 -> business(経営企画・移行判定の最終) + domain(UAT受入)
//   Gate5 Release承認  -> engineering(IT/DX実行判定)
//                         （上位Gate Owner（DX統括）は system_admin/admin ロールの
//                           承認権限オーバーライドとして判定ロジック側で担保）
// Gate1〜5のうち該当するAuthorityが全て approved になった時点で当該Gateが
// approved（通過）となる。個別Authorityの判定は独立して記録される。
export const gateAuthorityPolicy: Record<GateNo, readonly Authority[]> = {
  1: ["business", "domain", "engineering"],
  2: ["domain", "engineering"],
  3: ["domain", "engineering", "business"],
  4: ["business", "domain"],
  5: ["engineering"],
};

// 全Gate×全必要Authorityの承認行（初期化 seed）を生成する純関数。
// worker の /gates/init と mock の initGates で共通利用し、テストでも検証する。
export function defaultGateApprovalRows(ideaId: string): Array<Omit<IdeaGateApproval, "id">> {
  return gateNumbers.flatMap((gateNo) =>
    gateAuthorityPolicy[gateNo].map((authority, index) => ({
      ideaId,
      gateNo,
      requiredAuthority: authority,
      status: "pending" as const,
      createdAt: "",
      updatedAt: "",
      approvalSeq: index + 1,
    })),
  );
}

export type IdeaGateApproval = {
  id: string;
  ideaId: string;
  gateNo: GateNo;
  requiredAuthority: Authority;
  approverEmail?: string;
  status: GateApprovalStatus;
  reason?: string;
  requestedAt?: string;
  actedAt?: string;
  actedBy?: string;
  // Gate申請を発行したユーザー（SoD: 申請者≠承認者、自己承認防止の判定・監査に使用）。
  requestedBy?: string;
  // Gate内の承認順序（migration 009）。並列承認は同一値。
  approvalSeq?: number;
  createdAt: string;
  updatedAt: string;
};

// 1件のGate承認判定リクエスト。複数Authority共同承認のため対象Authorityを指定できる。
// authority 省略時はサーバー側が主承認Authority（gateAuthorityPolicy[gateNo][0]）へ
// フォールバックする（旧クライアント互換）。
export type GateApprovalRequest = {
  authority?: Authority;
  approverEmail: string;
  reason?: string;
};

// Gate一覧API（GET /gates, POST /gates/init）のレスポンス。
export type GateListResult = {
  items: IdeaGateApproval[];
  summary: GateSummary[];
};

// Gate1件分の集約ビュー（WebUI/ダッシュボード表示用）。
export type GateSummary = {
  gateNo: GateNo;
  label: string;
  requiredAuthorities: Authority[];
  // 全必須Authorityが approved のときだけ approved。それ以外は最も進行した状態。
  status: GateApprovalStatus;
  approvals: IdeaGateApproval[];
};

/**
 * 複数Authority共同承認の集約: Gateに属する承認行（IdeaGateApproval[]）から
 * Gate単位の状態を導出する。
 *  - 必須Authorityの全行が approved -> approved
 *  - いずれかが rejected / returned -> その状態（Gate通過不可）
 *  - いずれかが requested -> requested
 *  - それ以外（初期化のみで依頼なし）-> pending
 * 行が存在しない必須Authorityは「未依頼(pending)」として扱う。
 */
export function summarizeGateApprovals(approvals: IdeaGateApproval[]): GateSummary[] {
  return gateNumbers.map((gateNo) => {
    const requiredAuthorities = [...gateAuthorityPolicy[gateNo]];
    const gateApprovals = approvals.filter((a) => a.gateNo === gateNo);
    const byAuthority = new Map(gateApprovals.map((a) => [a.requiredAuthority, a]));
    // 行が無い必須Authorityは pending とみなす（旧データ/部分初期化の後方互換）。
    const effective: IdeaGateApproval[] = requiredAuthorities.map((authority) => {
      const existing = byAuthority.get(authority);
      if (existing) return existing;
      const ideaId = gateApprovals[0]?.ideaId ?? "";
      return {
        id: `missing-${gateNo}-${authority}`,
        ideaId,
        gateNo,
        requiredAuthority: authority,
        status: "pending",
        createdAt: "",
        updatedAt: "",
      };
    });
    let status: GateApprovalStatus = "pending";
    if (effective.every((a) => a.status === "approved")) status = "approved";
    else if (effective.some((a) => a.status === "rejected")) status = "rejected";
    else if (effective.some((a) => a.status === "returned")) status = "returned";
    else if (effective.some((a) => a.status === "requested")) status = "requested";
    return { gateNo, label: gateLabels[gateNo], requiredAuthorities, status, approvals: effective };
  });
}

/**
 * SoD（職務分掌・自己承認防止）チェック（docs/New/ai-dx-dev-process.md #06）。
 * 判定は純関数のためDB不要で単体テストできる。
 *
 * rules:
 *  - 申請者(requester) と承認者(approver) は同一人物不可
 *  - アイデア提案者(ideaCreator) は自分のアイデアの承認者・判定者になれない
 *  - 承認者は requiredAuthority を持つ active ユーザー本人のみ（adminは権限監査上
 *    最終承認として例外的に許可するが、自己承認は常に不可）
 *
 * returns: 違反理由の日本語メッセージ。問題なければ null。
 */
export function evaluateGateSoD(input: {
  ideaCreator: string;
  requester: string;
  approverEmail?: string;
  actor?: string;
  actorAuthority?: Authority;
  requiredAuthority: Authority;
  isAdmin?: boolean;
}): string | null {
  const norm = (v?: string) => (v ?? "").trim().toLowerCase();
  const creator = norm(input.ideaCreator);
  const requester = norm(input.requester);
  const approver = norm(input.approverEmail);
  const actor = norm(input.actor);

  if (approver && requester && approver === requester) {
    return "申請者自身を承認者に指定することはできません（自己承認防止）。";
  }
  if (approver && creator && approver === creator) {
    return "アイデア提案者が自身のアイデアの承認者になることはできません（SoD）。";
  }
  if (actor && creator && actor === creator) {
    return "アイデア提案者が自身のアイデアを判定することはできません（SoD）。";
  }
  if (actor && actor !== creator && input.actorAuthority && input.actorAuthority !== input.requiredAuthority && !input.isAdmin) {
    return `このGateの承認には ${input.requiredAuthority} Authority が必要です（現在: ${input.actorAuthority}）。`;
  }
  return null;
}

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
  provider: AiProvider;
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
  provider: AiProvider;
  model: string;
  enabled: boolean;
  dailyLimit: number;
  monthlyBudget: number;
};

export const userRoles = ["user", "admin", "system_admin"] as const;
export type UserRole = (typeof userRoles)[number];

export const userStatuses = ["active", "suspended"] as const;
export type UserStatus = (typeof userStatuses)[number];

// 全社Idea-to-Valueプロセス（docs/New/ai-dx-dev-process.md）が定める3 Authority。
// Business=経営企画、Domain=建設土木技術、Engineering=IT・DX。role（user/admin/
// system_admin）による認可とは独立した追加属性で、Gate拡張承認フロー（#50）が
// ゲート別の承認者判定に利用する（#49）。
export const authorities = ["business", "domain", "engineering"] as const;
export type Authority = (typeof authorities)[number];
export const authorityLabels: Record<Authority, string> = {
  business: "Business（経営企画）",
  domain: "Domain（建設土木技術）",
  engineering: "Engineering（IT・DX）",
};

export type AppUser = {
  id: string;
  email: string;
  name: string;
  department: string;
  role: UserRole;
  authority?: Authority;
  status: UserStatus;
  createdAt: string;
  updatedAt: string;
};

export type AppUserInput = {
  email: string;
  name?: string;
  department?: string;
  role: UserRole;
  authority?: Authority;
  status?: UserStatus;
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

// ---- RAG / 類似アイデア検索（migration 011・Issue #13）----
// 類似度は pg_trgm の word_similarity（クエリ内の連続trigramが対象テキストの
// 部分列にどれだけ含まれるか、0..1）。日本語・長文では similarity より分離が
// 良いことを実測確認（測量クエリ: word_similarity 0.692 vs similarity 0.065）。
export const ragMinSimilarity = 0.15; // この値以上を「関連候補」として返す

export type RagSearchHit = {
  /** redact済みの類似案件（submitter_email等は権限に応じ除去済み） */
  idea: Idea;
  /** 0..1。高いほど類似 */
  similarity: number;
  /** 重複候補とみなす表示ラベル（閾値は worker 側で判定） */
  level: "high" | "medium" | "low";
};

export type RagSearchResult = {
  query: string;
  items: RagSearchHit[];
};

export function ragSimilarityLevel(similarity: number): RagSearchHit["level"] {
  if (similarity >= 0.5) return "high";
  if (similarity >= 0.25) return "medium";
  return "low";
}

// Request paths in the API client already carry the /api prefix, so the
// configured base must be an origin without a trailing /api segment.
// Accepts values like "https://host", "https://host/", "https://host/api",
// "https://host/api/" and returns the origin form; empty input stays empty
// (same-origin relative requests).
export function normalizeApiBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  return trimmed.replace(/\/api$/i, "");
}
