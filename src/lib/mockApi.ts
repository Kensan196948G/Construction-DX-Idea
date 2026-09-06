import { inspectIssueInput } from "./privacy";
import type { AiEvalSummary } from "./aiEval";
import type {
  AiDepartmentUsageRow,
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
  Gate3Brief,
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
  IdeaGitHubEvidence,
  IdeaGitHubOverviewResult,
  IdeaHistory,
  IdeaKpi,
  IdeaRepoLink,
  IdeaRepoListResult,
  IdeaStage,
  IdeaValuePhaseEntry,
  InformationClassification,
  IssueInput,
  KnowledgeCandidate,
  KpiOutcome,
  PocPlan,
  PocPlanInput,
  PortfolioSummary,
  PortfolioSummaryRow,
  PrivacyFinding,
  RagSearchHit,
  RagSearchResult,
  SaveIdeaResult,
  StructuredIdea,
  UatChecklistInput,
  UatFeedbackEntry,
  UatFeedbackInput,
  UatFeedbackResult,
  UatFeedbackSummary,
  UsageLimitItem,
  UsageLimitPatch,
  UserProfile,
} from "./shared";
import {
  buildGate3Brief,
  buildStructuredQueryText,
  classifyKnowledgeSource,
  computeKnowledgeQualityScore,
  computeStructureConfidence,
  defaultGateApprovalRows,
  defaultPhaseForStage,
  gateNumbers,
  gateAuthorityPolicy,
  ideaValuePhaseLabel,
  ideaValuePhases,
  ragMinSimilarity,
  ragOverallVerdict,
  ragSimilarityLevel,
  summarizeGateApprovals,
  summarizeUatFeedback,
} from "./shared";
import { buildDemoQuestions, buildDemoStructure } from "./demoAi";
import { runAiEval } from "./aiEval";

const gateApprovals = new Map<string, IdeaGateApproval[]>();
const repoLinks = new Map<string, IdeaRepoLink[]>();
const githubEvidence = new Map<string, IdeaGitHubEvidence[]>();
const knowledgeItems: KnowledgeCandidate[] = [];
const usageLimitItems: UsageLimitItem[] = [
  {
    subjectType: "global",
    subjectId: "*",
    dailyLimit: 10,
    monthlyBudget: 30000,
    enabled: false,
    updatedBy: "system",
    updatedAt: new Date().toISOString(),
  },
];
const phaseHistory = new Map<
  string,
  Array<{ id: string; toPhase: number; reason?: string; changedBy?: string; createdAt: string }>
>();
const kpiRecords = new Map<string, IdeaKpi[]>();
const pocPlans = new Map<string, PocPlan>();
const uatFeedbackByIdea = new Map<string, UatFeedbackEntry[]>();

function defaultMockPocPlan(ideaId: string): PocPlan {
  const nowIso = new Date().toISOString();
  return {
    ideaId,
    hypothesis: "",
    successCriteria: "",
    mvpScopeIn: [],
    mvpScopeOut: [],
    testUsers: "",
    testScenarios: [],
    uatChecklist: [],
    acceptanceResult: "pending",
    acceptanceNotes: "",
    updatedBy: "",
    createdAt: nowIso,
    updatedAt: nowIso,
  };
}

const now = () => new Date().toISOString();

const seedIdeas: Idea[] = [
  {
    id: "IDEA-001",
    title: "出来形写真整理の自動分類",
    currentIssue: "出来形写真を工種・測点・日付ごとに手作業で振り分けており、報告前に確認時間が集中している。",
    targetBusiness: "写真管理、出来形管理",
    targetUsers: "現場代理人、主任技術者、写真整理担当",
    currentWorkflow: "スマートフォンやデジカメで撮影後、共有フォルダへ保存し、Excel台帳へ転記している。",
    improvementIdea: "写真メタデータと入力タグを使って、工種別フォルダと台帳の下書きを自動生成する。",
    expectedEffects: "写真整理時間の削減、確認漏れの低減、報告資料作成の平準化。",
    requiredData: ["写真ファイル", "撮影日時", "工種タグ", "測点"],
    relatedSystems: ["共有フォルダ", "Excel台帳"],
    implementationOptions: ["写真アップロードUI", "メタデータ抽出", "台帳CSV出力"],
    securityNotes: ["工事名や発注者名はマスキング対象"],
    openQuestions: ["写真命名ルールの有無", "既存写真管理システムとの重複確認"],
    mvpCandidate: "1現場の出来形写真を対象に、分類候補と台帳CSVを出力する。",
    mvpDoneDefinition: "100枚程度の写真を対象に、担当者が手直し可能な分類結果を出せること。",
    stage: "mvp",
    approvalStatus: "none",
    createdBy: "demo.user@example.com",
    ownerId: "dx-team",
    department: "土木工事部",
    submitterName: "デモ太郎",
    submitterEmail: "demo.user@example.com",
    coordinationNeeded: "写真管理ルール調整が必要",
    createdAt: "2026-07-01T09:00:00.000Z",
    updatedAt: "2026-07-10T09:00:00.000Z",
    aiUsageCount: 3,
  },
  {
    id: "IDEA-002",
    title: "日報の二重入力削減",
    currentIssue: "現場日報を紙で記入後、事務所でExcelへ転記しており、残業時間の原因になっている。",
    targetBusiness: "日報、労務、安全記録",
    targetUsers: "現場管理者、協力会社職長、事務担当",
    currentWorkflow: "紙の日報を回収し、Excelへ転記してから共有している。",
    improvementIdea: "スマートフォン入力と承認フローで、日報データをそのまま集計へ利用する。",
    expectedEffects: "転記時間削減、記入漏れ抑制、翌朝確認の迅速化。",
    requiredData: ["作業内容", "人数", "機械", "安全指示"],
    relatedSystems: ["Excel", "社内ファイルサーバー"],
    implementationOptions: ["モバイル入力", "CSV出力", "承認履歴"],
    securityNotes: ["個人名ではなく役割・会社単位での入力を検討"],
    openQuestions: ["協力会社アカウントの扱い", "紙保管義務の確認"],
    mvpCandidate: "1工区・社内利用者限定で日報入力とCSV出力を試す。",
    mvpDoneDefinition: "1週間分の日報を紙転記なしで集計できること。",
    stage: "planning",
    approvalStatus: "none",
    createdBy: "demo.user@example.com",
    department: "土木工事部",
    submitterName: "デモ太郎",
    submitterEmail: "demo.user@example.com",
    coordinationNeeded: "",
    createdAt: "2026-07-05T09:00:00.000Z",
    updatedAt: "2026-07-09T09:00:00.000Z",
    aiUsageCount: 2,
  },
];

let ideas = [...seedIdeas];
let mockSettings: AiSettings = {
  provider: "claude",
  model: "claude-sonnet-5",
  enabled: false,
  status: "disabled",
  dailyLimit: 10,
  monthlyBudget: 30000,
  keyLast4: undefined,
  lastCheckedAt: undefined,
  updatedBy: "system",
};

export const mockApi = {
  async getMe(): Promise<UserProfile> {
    return {
      email: "local.dev@example.com",
      roles: ["user", "admin", "system_admin"],
    };
  },

  async getMetrics(): Promise<DashboardMetrics> {
    const stageCounts: Record<string, number> = {};
    for (const idea of ideas) {
      stageCounts[idea.stage] = (stageCounts[idea.stage] ?? 0) + 1;
    }
    const activeIdeas = ideas.filter((idea) => !["rejected", "archived"].includes(idea.stage));
    const sevenDaysAgo = Date.now() - 7 * 864e5;
    return {
      totalIdeas: ideas.length,
      activeIdeas: activeIdeas.length,
      mvpIdeas: ideas.filter((idea) => idea.stage === "mvp").length,
      securityWarnings: ideas.reduce((count, idea) => count + idea.securityNotes.length, 0),
      aiCallsToday: 7,
      stageCounts,
      submittedLast7Days: ideas.filter((idea) => Date.parse(idea.createdAt) >= sevenDaysAgo).length,
      rejectedCount: ideas.filter((idea) => idea.stage === "rejected").length,
      avgPriorityScore: 0,
    };
  },

  async listIdeas(params: {
    q?: string;
    stage?: string;
    limit?: number;
  } = {}): Promise<Idea[]> {
    let filtered = [...ideas].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const q = (params.q ?? "").trim().toLowerCase();
    if (q) {
      filtered = filtered.filter(
        (idea) =>
          idea.title.toLowerCase().includes(q) ||
          idea.targetBusiness.toLowerCase().includes(q) ||
          idea.improvementIdea.toLowerCase().includes(q),
      );
    }
    if (params.stage) {
      filtered = filtered.filter((idea) => idea.stage === params.stage);
    }
    const limit = params.limit ? Math.min(Math.max(1, Math.trunc(params.limit)), 200) : 100;
    return filtered.slice(0, limit);
  },

  async getEvaluationBoard(): Promise<{ items: Array<Idea & { priorityScore: number; reasons: string[] }> }> {
    const items = ideas
      .filter((idea) => !["rejected", "archived"].includes(idea.stage))
      .map((idea) => ({
        ...idea,
        priorityScore: Math.min(10, idea.securityNotes.length * 2 + (idea.mvpCandidate ? 2 : 0) + (idea.openQuestions.length === 0 ? 1 : 0)),
        reasons: ["モック評価"],
      }))
      .sort((a, b) => b.priorityScore - a.priorityScore);
    return { items };
  },

  async exportIdeasCsv(): Promise<Response> {
    const rows = ideas
      .slice()
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map(
        (idea) =>
          [idea.id, idea.title, idea.stage, idea.targetBusiness, idea.targetUsers, idea.mvpCandidate, String(idea.securityNotes.length), idea.createdBy, idea.createdAt, idea.updatedAt]
            .map((cell) => csvCell(cell))
            .join(","),
      );
    const body = "\uFEFF" + ["id,title,stage,target_business,target_users,mvp_candidate,security_notes_count,created_by,created_at,updated_at", ...rows].join("\r\n") + "\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="dx-ideas-${now().slice(0, 10)}.csv"`,
      },
    });
  },

  async exportIdeasXls(): Promise<Response> {
    const body =
      '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="DX Ideas"><Table><Row><Cell><Data ss:Type="String">id</Data></Cell>' +
      "<Cell><Data ss:Type=\"String\">title</Data></Cell></Row></Table></Worksheet></Workbook>";
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="dx-ideas-${now().slice(0, 10)}.xls"`,
      },
    });
  },

  async getIdeaHistory(id: string): Promise<IdeaHistory> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    return {
      history: [{ fromStage: undefined, toStage: idea.stage, changedBy: idea.createdBy, reason: "", changedAt: idea.updatedAt }],
      decisions: [],
    };
  },

  async getPortfolio(): Promise<{ summary: PortfolioSummary; items: PortfolioSummaryRow[] }> {
    const active = ideas.filter((i) => !["rejected", "archived"].includes(i.stage));
    const stageCounts: Record<string, number> = {};
    for (const idea of ideas) {
      stageCounts[idea.stage] = (stageCounts[idea.stage] ?? 0) + 1;
    }
    const classificationCounts: Record<string, number> = {
      public: 0, internal: 0, confidential: 0, restricted: 0,
    };
    for (const idea of ideas) {
      const cls = idea.informationClassification ?? "internal";
      classificationCounts[cls] = (classificationCounts[cls] ?? 0) + 1;
    }
    const productionIdeas = stageCounts["production"] ?? 0;
    const decidedTotal =
      (stageCounts["submitted"] ?? 0) + (stageCounts["planning"] ?? 0) +
      (stageCounts["mvp"] ?? 0) + (stageCounts["verification"] ?? 0) +
      (stageCounts["production_candidate"] ?? 0) + productionIdeas;
    const kpiMeasuredCount = [...kpiRecords.values()].filter(
      (records) => records.length > 0,
    ).length;
    const summary: PortfolioSummary = {
      totalIdeas: ideas.length,
      activeIdeas: active.length,
      productionIdeas,
      rejectedIdeas: stageCounts["rejected"] ?? 0,
      productionRate: decidedTotal ? productionIdeas / decidedTotal : 0,
      kpiMeasuredCount,
      totalBaselineHoursPerMonth: ideas.reduce((s, i) => s + (i.kpiBaselineHours ?? 0), 0),
      totalBaselineCostPerMonth: ideas.reduce((s, i) => s + (i.kpiBaselineCost ?? 0), 0),
      classificationCounts,
      stageCounts,
    };
    const items: PortfolioSummaryRow[] = active
      .map((idea) => {
        const records = kpiRecords.get(idea.id) ?? [];
        const latest = records[0];
        const score = idea.securityNotes.length * 2 + (idea.mvpCandidate ? 2 : 0) +
          (idea.openQuestions.length === 0 ? 1 : 0);
        return {
          ideaId: idea.id,
          caseId: idea.caseId,
          title: idea.title,
          stage: idea.stage,
          informationClassification: idea.informationClassification ?? "internal",
          kpiBaselineHours: idea.kpiBaselineHours,
          kpiBaselineCost: idea.kpiBaselineCost,
          latestKpiOutcome: latest?.outcome,
          latestActualReductionPct: latest?.actualReductionPct,
          priorityScore: Math.min(10, score),
        };
      })
      .sort((a, b) => b.priorityScore - a.priorityScore);
    return { summary, items };
  },

  async recordKpi(
    id: string,
    input: {
      targetReductionPct?: number;
      actualReductionPct?: number;
      measuredAt?: string;
      periodMonths?: number;
      outcome?: KpiOutcome;
      reviewNote?: string;
    },
  ): Promise<IdeaKpi> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const record: IdeaKpi = {
      id: `kpi-${Date.now()}`,
      ideaId: id,
      targetReductionPct: input.targetReductionPct,
      actualReductionPct: input.actualReductionPct,
      measuredAt: input.measuredAt ?? now(),
      periodMonths: input.periodMonths ?? 3,
      outcome: input.outcome ?? "pending",
      reviewNote: input.reviewNote ?? "",
      recordedBy: "demo.user@example.com",
    };
    kpiRecords.set(id, [record, ...(kpiRecords.get(id) ?? [])]);
    return record;
  },

  async getIdeaKpis(id: string): Promise<{ kpiBaselineHours: number | null; kpiBaselineCost: number | null; records: IdeaKpi[] }> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    return {
      kpiBaselineHours: idea.kpiBaselineHours ?? null,
      kpiBaselineCost: idea.kpiBaselineCost ?? null,
      records: kpiRecords.get(id) ?? [],
    };
  },

  async updateKpiBaseline(
    id: string,
    baseline: { kpiBaselineHours?: number | null; kpiBaselineCost?: number | null; reason?: string },
  ): Promise<Idea> {
    const found = ideas.find((candidate) => candidate.id === id);
    if (!found) throw new Error("Idea not found");
    if (baseline.kpiBaselineHours !== undefined) {
      found.kpiBaselineHours = baseline.kpiBaselineHours ?? undefined;
    }
    if (baseline.kpiBaselineCost !== undefined) {
      found.kpiBaselineCost = baseline.kpiBaselineCost ?? undefined;
    }
    found.updatedAt = now();
    return found;
  },

  async getPocPlan(id: string): Promise<{ plan: PocPlan; feedbackSummary: UatFeedbackSummary }> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const plan = pocPlans.get(id) ?? defaultMockPocPlan(id);
    const feedbackSummary = summarizeUatFeedback(uatFeedbackByIdea.get(id) ?? []);
    return { plan, feedbackSummary };
  },

  async updatePocPlan(id: string, input: PocPlanInput): Promise<PocPlan> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const existing = pocPlans.get(id) ?? defaultMockPocPlan(id);
    const next: PocPlan = {
      ...existing,
      hypothesis: input.hypothesis ?? existing.hypothesis,
      successCriteria: input.successCriteria ?? existing.successCriteria,
      mvpScopeIn: input.mvpScopeIn ?? existing.mvpScopeIn,
      mvpScopeOut: input.mvpScopeOut ?? existing.mvpScopeOut,
      testUsers: input.testUsers ?? existing.testUsers,
      testScenarios: input.testScenarios ?? existing.testScenarios,
      updatedBy: "demo.user@example.com",
      updatedAt: now(),
    };
    pocPlans.set(id, next);
    return next;
  },

  async updateUatChecklist(id: string, input: UatChecklistInput): Promise<PocPlan> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const existing = pocPlans.get(id) ?? defaultMockPocPlan(id);
    const next: PocPlan = {
      ...existing,
      uatChecklist: input.uatChecklist,
      acceptanceResult: input.acceptanceResult ?? existing.acceptanceResult,
      acceptanceNotes: input.acceptanceNotes ?? existing.acceptanceNotes,
      updatedBy: "demo.user@example.com",
      updatedAt: now(),
    };
    pocPlans.set(id, next);
    return next;
  },

  async getUatFeedback(id: string): Promise<UatFeedbackResult> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const items = uatFeedbackByIdea.get(id) ?? [];
    return { items, summary: summarizeUatFeedback(items) };
  },

  async submitUatFeedback(id: string, input: UatFeedbackInput): Promise<UatFeedbackEntry> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const entry: UatFeedbackEntry = {
      id: `uat-${Date.now()}-${Math.round(Math.random() * 1000)}`,
      ideaId: id,
      rating: input.rating,
      comment: input.comment ?? "",
      feedbackType: input.feedbackType ?? "general",
      submittedBy: "demo.user@example.com",
      submittedAt: now(),
    };
    uatFeedbackByIdea.set(id, [entry, ...(uatFeedbackByIdea.get(id) ?? [])]);
    return entry;
  },

  async getGate3Brief(id: string): Promise<Gate3Brief> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const pocPlan = pocPlans.get(id) ?? defaultMockPocPlan(id);
    const feedbackSummary = summarizeUatFeedback(uatFeedbackByIdea.get(id) ?? []);
    const gates = gateApprovals.get(id) ?? [];
    const gate3 = summarizeGateApprovals(gates).find((g) => g.gateNo === 3) ?? null;
    return buildGate3Brief({ idea, pocPlan, feedbackSummary, gate3 });
  },

  async getSimilarIdeas(id: string, limit = 5): Promise<RagSearchResult> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const query = mockIdeaSearchText(idea);
    const items = mockRagSearch(query, { excludeIdeaId: id, limit });
    return { query: query.slice(0, 200), items, duplicateVerdict: ragOverallVerdict(items) };
  },

  async searchRag(q: string, limit = 5): Promise<RagSearchResult> {
    const query = q.trim();
    if (query.length < 4) throw new Error("検索クエリは4文字以上で指定してください。");
    const items = mockRagSearch(query, { excludeIdeaId: undefined, limit });
    return { query, items, duplicateVerdict: ragOverallVerdict(items) };
  },

  async getIdeaPhase(id: string): Promise<IdeaValuePhaseEntry> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const current = idea.phaseNo ?? defaultPhaseForStage(idea.stage) ?? 1;
    const history = phaseHistory.get(id) ?? [
      { id: `ph-${id}-0`, toPhase: current, reason: "初期化", changedBy: idea.createdBy, createdAt: idea.updatedAt },
    ];
    return {
      ideaId: id,
      phaseNo: current,
      phaseLabel: ideaValuePhaseLabel(current),
      phaseNote: idea.phaseNote,
      history,
      phases: ideaValuePhases.map((p) => ({
        no: p.no,
        label: p.label,
        stage: p.stage,
        state: p.no < current ? "done" : p.no === current ? "current" : "todo",
      })),
    };
  },

  async updateIdeaPhase(id: string, payload: { phaseNo: number; reason?: string; note?: string }): Promise<{
    ideaId: string;
    phaseNo: number;
    phaseLabel: string;
    fromPhase: number;
    reason: string;
  }> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    const fromPhase = idea.phaseNo ?? defaultPhaseForStage(idea.stage) ?? 1;
    const target = payload.phaseNo;
    const entry = {
      id: `ph-${id}-${Date.now()}`,
      toPhase: target,
      reason: payload.reason?.trim() || (target > fromPhase ? "フェーズ前進" : "フェーズ後戻し"),
      changedBy: "demo.user@example.com",
      createdAt: now(),
    };
    idea.phaseNo = target;
    if (payload.note?.trim()) idea.phaseNote = payload.note.trim();
    phaseHistory.set(id, [...(phaseHistory.get(id) ?? []), entry]);
    return {
      ideaId: id,
      phaseNo: target,
      phaseLabel: ideaValuePhaseLabel(target),
      fromPhase,
      reason: entry.reason,
    };
  },

  async getIdea(id: string): Promise<Idea> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    return idea;
  },

  async updateIdea(id: string, patch: Partial<StructuredIdea>): Promise<Idea> {
    const found = ideas.find((idea) => idea.id === id);
    if (!found) throw new Error("Idea not found");
    Object.assign(found, patch);
    found.updatedAt = now();
    return found;
  },

  async getComments(id: string): Promise<{ items: IdeaComment[] }> {
    if (!ideas.some((idea) => idea.id === id)) throw new Error("Idea not found");
    return { items: [] };
  },

  async addComment(id: string, body: string): Promise<IdeaComment> {
    if (!ideas.some((idea) => idea.id === id)) throw new Error("Idea not found");
    return {
      id: `comment-${Date.now()}`,
      ideaId: id,
      author: "demo.user@example.com",
      body,
      createdAt: now(),
    };
  },

  async requestApproval(id: string, payload: ApprovalRequest): Promise<Idea> {
    const found = ideas.find((idea) => idea.id === id);
    if (!found) throw new Error("Idea not found");
    return {
      ...found,
      approvalStatus: "requested",
      approverEmail: payload.approverEmail,
      approvalRequestedAt: now(),
      approvalReason: payload.reason ?? "",
    };
  },

  async decideApproval(id: string, payload: ApprovalDecision): Promise<Idea> {
    const found = ideas.find((idea) => idea.id === id);
    if (!found) throw new Error("Idea not found");
    return {
      ...found,
      approvalStatus:
        payload.decision === "approve"
          ? "approved"
          : payload.decision === "reject"
            ? "rejected"
            : "returned",
      approvalActedAt: now(),
      approvalReason: payload.reason,
    };
  },

  async initGates(id: string): Promise<GateListResult> {
    if (!gateApprovals.has(id) || gateApprovals.get(id)!.length === 0) {
      gateApprovals.set(id, [
        ...defaultGateApprovalRows(id).map((row, index) => ({
          ...row,
          id: `gate-${id}-${row.gateNo}-${row.requiredAuthority}-${index}`,
          createdAt: now(),
          updatedAt: now(),
        })),
      ]);
    } else {
      // 既存データへ不足Authority行を補完（worker の ensure 相当）。
      const rows = gateApprovals.get(id)!;
      const keys = new Set(rows.map((r) => `${r.gateNo}:${r.requiredAuthority}`));
      let index = 0;
      for (const gateNo of gateNumbers) {
        for (const authority of gateAuthorityPolicy[gateNo]) {
          if (!keys.has(`${gateNo}:${authority}`)) {
            rows.push({
              id: `gate-${id}-${gateNo}-${authority}-backfill-${index++}`,
              ideaId: id,
              gateNo,
              requiredAuthority: authority,
              status: "pending",
              createdAt: now(),
              updatedAt: now(),
            });
          }
        }
      }
    }
    const items = gateApprovals.get(id) ?? [];
    return { items, summary: summarizeGateApprovals(items) };
  },

  async getGates(id: string): Promise<GateListResult> {
    const items = gateApprovals.get(id) ?? [];
    return { items, summary: summarizeGateApprovals(items) };
  },

  async requestGateApproval(id: string, gateNo: GateNo, payload: GateApprovalRequest): Promise<IdeaGateApproval> {
    const gates = gateApprovals.get(id);
    const authority = payload.authority ?? gateAuthorityPolicy[gateNo][0];
    const gate = gates?.find((g) => g.gateNo === gateNo && g.requiredAuthority === authority);
    if (!gate) throw new Error("Gate not found");
    // 期限の既定はworker準拠（5日後）。過去日時は拒否。
    const dueAt = payload.dueAt ? new Date(payload.dueAt) : new Date(Date.now() + 5 * 864e5);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() <= Date.now()) {
      throw new Error("承認期限は未来の日時を指定してください。");
    }
    Object.assign(gate, {
      status: "requested",
      approverEmail: payload.approverEmail,
      requestedAt: now(),
      requestedBy: "demo.user@example.com",
      reason: payload.reason ?? "",
      requestedDueAt: dueAt.toISOString(),
      delegateTo: payload.delegateTo?.trim() || undefined,
      lastRemindedAt: undefined,
      reminderCount: 0,
      escalatedAt: undefined,
      updatedAt: now(),
    });
    return gate;
  },

  async decideGateApproval(id: string, gateNo: GateNo, payload: GateDecisionInput & { authority?: Authority }): Promise<IdeaGateApproval> {
    const gates = gateApprovals.get(id);
    // authority 未指定時は requested の行が1件のみならそれへフォールバック（worker準拠）。
    let authority = payload.authority;
    if (!authority) {
      const requested = gates?.filter((g) => g.gateNo === gateNo && g.status === "requested") ?? [];
      if (requested.length === 1) authority = requested[0].requiredAuthority;
      else throw new Error(requested.length === 0 ? "Gate not requested" : "Authority ambiguous");
    }
    const gate = gates?.find((g) => g.gateNo === gateNo && g.requiredAuthority === authority);
    if (!gate) throw new Error("Gate not found");
    // 条件付き承認（migration 014）: approve時に条件を記録する。
    const conditionNote = payload.decision === "approve" ? (payload.conditionNote ?? "").trim() : "";
    Object.assign(gate, {
      status: payload.decision === "approve" ? "approved" : payload.decision === "reject" ? "rejected" : "returned",
      actedAt: now(),
      actedBy: "demo.user@example.com",
      reason: payload.reason,
      conditionNote: conditionNote || undefined,
      conditionMet: conditionNote ? (payload.conditionMet ?? false) : null,
      updatedAt: now(),
    });
    return gate;
  },

  async getGateOverview(): Promise<GateOverviewResult> {
    const items: GateOverviewResult["items"] = [];
    for (const [ideaId, gates] of gateApprovals) {
      for (const gate of gates) {
        if (gate.status !== "requested") continue;
        const idea = ideas.find((i) => String(i.id) === ideaId);
        const requestedAt = gate.requestedAt ? new Date(gate.requestedAt) : null;
        const dueAt = gate.requestedDueAt ? new Date(gate.requestedDueAt) : null;
        const dwellDays = requestedAt
          ? Math.max(0, Math.floor((Date.now() - requestedAt.getTime()) / 864e5))
          : 0;
        const overdue = dueAt ? dueAt.getTime() < Date.now() : false;
        items.push({
          ideaId,
          ideaTitle: idea?.title ?? "",
          gateNo: gate.gateNo,
          requiredAuthority: gate.requiredAuthority,
          approverEmail: gate.approverEmail,
          delegateTo: gate.delegateTo,
          requestedBy: gate.requestedBy,
          requestedAt: gate.requestedAt,
          requestedDueAt: gate.requestedDueAt,
          lastRemindedAt: gate.lastRemindedAt,
          reminderCount: gate.reminderCount ?? 0,
          escalatedAt: gate.escalatedAt,
          conditionNote: gate.conditionNote,
          conditionMet: gate.conditionMet ?? null,
          dwellDays,
          overdue,
          dueSoon: !overdue && dueAt != null && dueAt.getTime() - Date.now() <= 2 * 864e5,
        });
      }
    }
    return {
      items,
      total: items.length,
      overdueCount: items.filter((item) => item.overdue).length,
      avgDwellDays: items.length
        ? Math.round((items.reduce((sum, item) => sum + item.dwellDays, 0) / items.length) * 10) / 10
        : 0,
    };
  },

  async runGateReminders(): Promise<GateReminderRunResult> {
    const overview = await mockApi.getGateOverview();
    let reminded = 0;
    let escalated = 0;
    for (const item of overview.items) {
      if (item.overdue || (!item.requestedDueAt && item.dwellDays >= 7)) escalated += 1;
      else if (item.dueSoon) reminded += 1;
    }
    return { reminded, escalated, skipped: 0 };
  },

  // ---- GitHub Engineering 連携（migration 015）モック ----
  async listIdeaRepos(id: string): Promise<IdeaRepoListResult> {
    return {
      items: (repoLinks.get(id) ?? []).map((link) => ({ ...link })),
      evidence: (githubEvidence.get(id) ?? []).map((e) => ({ ...e })),
    };
  },

  async linkIdeaRepo(id: string, repoFullName: string): Promise<IdeaRepoLink> {
    const normalized = repoFullName
      .trim()
      .replace(/^https?:\/\/github\.com\//i, "")
      .replace(/\.git$/i, "")
      .replace(/\/+$/, "");
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(normalized)) {
      throw new Error("repo は owner/repo 形式で指定してください。");
    }
    const links = repoLinks.get(id) ?? [];
    const existing = links.find((l) => l.repoFullName === normalized);
    if (existing) {
      existing.updatedAt = now();
      return existing;
    }
    const link: IdeaRepoLink = {
      id: `repo-${id}-${links.length + 1}`,
      ideaId: id,
      repoFullName: normalized,
      defaultBranch: "main",
      createdBy: "demo.user@example.com",
      createdAt: now(),
      updatedAt: now(),
    };
    repoLinks.set(id, [...links, link]);
    return link;
  },

  async unlinkIdeaRepo(id: string, linkId: string): Promise<{ ok: boolean }> {
    repoLinks.set(id, (repoLinks.get(id) ?? []).filter((l) => l.id !== linkId));
    return { ok: true };
  },

  async getIdeaGitHubOverview(id: string): Promise<IdeaGitHubOverviewResult> {
    const links = repoLinks.get(id) ?? [];
    return {
      repos: links.map((link) => ({
        repoFullName: link.repoFullName,
        defaultBranch: link.defaultBranch ?? "main",
        stars: 12,
        openIssuesCount: 3,
        pushedAt: now(),
        archived: false,
        ciStatus: "success",
        ciUrl: `https://github.com/${link.repoFullName}/actions`,
        latestRelease: {
          tagName: "v0.1.0",
          name: "MVP",
          publishedAt: now(),
          url: `https://github.com/${link.repoFullName}/releases/tag/v0.1.0`,
          prerelease: false,
        },
        openPullRequests: [
          {
            number: 1,
            title: "feat: MVP実装",
            state: "open",
            draft: false,
            url: `https://github.com/${link.repoFullName}/pull/1`,
            updatedAt: now(),
            caseIdMatched: false,
          },
        ],
        openIssues: [],
        fetchedAt: now(),
      })),
      evidence: (githubEvidence.get(id) ?? []).map((e) => ({ ...e })),
    };
  },

  async syncIdeaGitHub(id: string): Promise<GitHubSyncResult> {
    const overview = await mockApi.getIdeaGitHubOverview(id);
    const rows: IdeaGitHubEvidence[] = [];
    const byKind: Record<string, number> = {};
    for (const repo of overview.repos) {
      const candidates: Array<Pick<IdeaGitHubEvidence, "kind" | "externalId" | "title" | "url" | "status">> = [];
      if (repo.ciStatus && repo.ciStatus !== "none") {
        candidates.push({
          kind: "ci",
          externalId: `ci-${repo.repoFullName}-${repo.defaultBranch}`,
          title: `CI（${repo.repoFullName}@${repo.defaultBranch}）`,
          url: repo.ciUrl,
          status: repo.ciStatus,
        });
      }
      if (repo.latestRelease) {
        candidates.push({
          kind: "release",
          externalId: `rel-${repo.repoFullName}-${repo.latestRelease.tagName}`,
          title: repo.latestRelease.name || repo.latestRelease.tagName,
          url: repo.latestRelease.url ?? null,
          status: "published",
        });
      }
      for (const pr of repo.openPullRequests) {
        candidates.push({
          kind: "pr",
          externalId: `pr-${repo.repoFullName}-${pr.number}`,
          title: pr.title,
          url: pr.url ?? null,
          status: pr.state,
        });
      }
      for (const issue of repo.openIssues) {
        candidates.push({
          kind: "issue",
          externalId: `issue-${repo.repoFullName}-${issue.number}`,
          title: issue.title,
          url: issue.url ?? null,
          status: issue.state,
        });
      }
      for (const candidate of candidates) {
        rows.push({
          id: `ev-${candidate.externalId}`,
          ideaId: id,
          ...candidate,
          occurredAt: now(),
          createdAt: now(),
          updatedAt: now(),
        });
        byKind[candidate.kind] = (byKind[candidate.kind] ?? 0) + 1;
      }
    }
    githubEvidence.set(id, rows);
    return { upserted: rows.length, byKind };
  },

  // ---- Knowledge Management（migration 016）モック ----
  async listKnowledge(params: { status?: string; category?: string } = {}): Promise<{ items: KnowledgeCandidate[] }> {
    let items = [...knowledgeItems];
    if (params.status) items = items.filter((k) => k.status === params.status);
    if (params.category) items = items.filter((k) => k.category === params.category);
    return { items };
  },

  async submitKnowledge(input: {
    title: string;
    category: KnowledgeCandidate["category"];
    body?: string;
    sourceIdeaId?: string;
  }): Promise<KnowledgeCandidate> {
    const body = input.body ?? "";
    const row: KnowledgeCandidate = {
      id: `kn-${knowledgeItems.length + 1}`,
      sourceType: "manual",
      sourceIdeaId: input.sourceIdeaId ?? null,
      category: input.category,
      title: input.title,
      body,
      status: "candidate",
      qualityScore: computeKnowledgeQualityScore(body, input.category),
      submittedBy: "demo.user@example.com",
      reviewedBy: null,
      reviewedAt: null,
      promotionUrl: null,
      owner: null,
      expiresAt: null,
      supersededBy: null,
      reuseCount: 0,
      createdAt: now(),
      updatedAt: now(),
    };
    knowledgeItems.unshift(row);
    return row;
  },

  async extractKnowledge(): Promise<{ created: number; scanned: Record<string, number> }> {
    // モック: 「解決」「教訓」等を含むコメントを候補化（決定論的）。
    let created = 0;
    for (const idea of ideas) {
      const text = `${idea.currentIssue} ${idea.expectedEffects}`;
      const classified = classifyKnowledgeSource(text);
      if (!classified) continue;
      const title = `${idea.title} — モック抽出`;
      if (knowledgeItems.some((k) => k.title === title)) continue;
      knowledgeItems.unshift({
        id: `kn-${knowledgeItems.length + 1}`,
        sourceType: "idea_comment",
        sourceIdeaId: String(idea.id),
        category: classified.category,
        title,
        body: text,
        status: "candidate",
        qualityScore: computeKnowledgeQualityScore(text, classified.category),
        submittedBy: "system:extract",
        reviewedBy: null,
        reviewedAt: null,
        promotionUrl: null,
        owner: null,
        expiresAt: null,
        supersededBy: null,
        reuseCount: 0,
        createdAt: now(),
        updatedAt: now(),
      });
      created += 1;
    }
    return { created, scanned: { comments: ideas.length } };
  },

  async reviewKnowledge(
    id: string,
    input: { action: "approve" | "reject"; qualityScore?: number; note?: string },
  ): Promise<KnowledgeCandidate> {
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    row.status = input.action === "approve" ? "approved" : "rejected";
    row.qualityScore = input.qualityScore ?? row.qualityScore;
    row.reviewedBy = "demo.admin@example.com";
    row.reviewedAt = now();
    row.updatedAt = now();
    return row;
  },

  async promoteKnowledge(id: string, url: string): Promise<KnowledgeCandidate> {
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    row.status = "promoted";
    row.promotionUrl = url;
    row.updatedAt = now();
    return row;
  },

  async updateKnowledge(
    id: string,
    input: { owner?: string; expiresAt?: string | null },
  ): Promise<KnowledgeCandidate> {
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    if (input.owner !== undefined) row.owner = input.owner;
    if (input.expiresAt !== undefined) row.expiresAt = input.expiresAt;
    row.updatedAt = now();
    return row;
  },

  async supersedeKnowledge(id: string, supersededBy: string): Promise<KnowledgeCandidate> {
    if (id === supersededBy) throw new Error("統合先には自分自身以外のKnowledgeを指定してください。");
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    if (!knowledgeItems.some((k) => k.id === supersededBy)) throw new Error("Successor not found");
    row.status = "superseded";
    row.supersededBy = supersededBy;
    row.updatedAt = now();
    return row;
  },

  async archiveKnowledge(id: string): Promise<KnowledgeCandidate> {
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    row.status = "archived";
    row.updatedAt = now();
    return row;
  },

  async reuseKnowledge(id: string): Promise<KnowledgeCandidate> {
    const row = knowledgeItems.find((k) => k.id === id);
    if (!row) throw new Error("Knowledge not found");
    row.reuseCount += 1;
    row.updatedAt = now();
    return row;
  },

  async inspectInput(input: IssueInput): Promise<PrivacyFinding[]> {
    return inspectIssueInput(input);
  },

  async generateQuestions(input: IssueInput, _department?: string): Promise<AiQuestion[]> {
    const base = [
      {
        id: "q-frequency",
        question: "この作業は月に何回程度発生しますか。",
        purpose: "効果見込みを把握するため",
        answerType: "number" as const,
      },
      {
        id: "q-time",
        question: "1回あたり何分程度かかりますか。",
        purpose: "削減可能な時間を見積もるため",
        answerType: "number" as const,
      },
      {
        id: "q-share",
        question: "作業結果は誰と共有していますか。",
        purpose: "関係者と通知範囲を整理するため",
        answerType: "text" as const,
      },
    ];

    if (input.relatedSystems) {
      return base;
    }

    return [
      ...base.slice(0, 2),
      {
        id: "q-system",
        question: "現在は紙、Excel、既存システムのどれを主に使っていますか。",
        purpose: "実現方式と連携要否を整理するため",
        answerType: "choice" as const,
      },
    ];
  },

  async structureIdea(
    input: IssueInput,
    answers: Record<string, string>,
    _department?: string,
  ): Promise<AiStructureResponse> {
    const frequency = answers["q-frequency"] ? `月${answers["q-frequency"]}回程度` : "頻度未確認";
    const time = answers["q-time"] ? `1回${answers["q-time"]}分程度` : "所要時間未確認";

    const structured: StructuredIdea = {
      title: `${input.workType.slice(0, 28)}の改善`,
      currentIssue: `${input.workType}\n\n現状: ${input.currentWorkflow}`,
      targetBusiness: input.workType,
      targetUsers: input.affectedRole || "現場管理者、関係部門",
      currentWorkflow: input.currentWorkflow,
      improvementIdea: `${input.desiredState}\nAI整理メモ: ${frequency}、${time}の作業としてMVP効果を検証する。`,
      expectedEffects: "転記時間の削減、確認漏れの低減、進捗共有の迅速化、属人化の抑制。",
      requiredData: splitList(input.usedData || "作業記録, 進捗情報"),
      relatedSystems: splitList(input.relatedSystems || "Excel, 共有フォルダ"),
      implementationOptions: ["Web入力フォーム", "CSV出力", "承認・履歴管理", "Slack通知"],
      securityNotes:
        input.confidentiality === "none"
          ? ["AI送信前の機密情報検査を継続する"]
          : ["機密情報候補があるため、AI送信前にマスキングとIT部門確認が必要"],
      openQuestions: ["対象部署の範囲", "既存システムとの重複", "MVP検証期間"],
      mvpCandidate: "対象業務を1部署または1現場に限定し、入力・一覧・CSV出力・Slack通知までを検証する。",
      mvpDoneDefinition: "実利用者が1週間以上使い、手戻り削減または確認時間削減を確認できること。",
      department: "土木工事部",
      submitterName: "デモ太郎",
      submitterEmail: "demo.user@example.com",
      coordinationNeeded: "調整必要",
    };
    const queryText = buildStructuredQueryText(structured);
    const hits = queryText.length >= 4 ? mockRagSearch(queryText, { limit: 5 }) : [];
    const citations = hits.map((hit) => ({
      ideaId: hit.idea.id,
      caseId: hit.idea.caseId,
      title: hit.idea.title,
      similarity: hit.similarity,
      level: hit.level,
    }));
    const { confidence, confidenceLevel } = computeStructureConfidence(structured);
    return {
      structured,
      confidence,
      confidenceLevel,
      citations,
      duplicateVerdict: ragOverallVerdict(citations),
    };
  },

  async saveIdea(structured: StructuredIdea, stage: IdeaStage, _idempotencyKey?: string): Promise<SaveIdeaResult> {
    const idea: Idea = {
      ...structured,
      id: `IDEA-${String(ideas.length + 1).padStart(3, "0")}`,
      stage,
      approvalStatus: "none",
      createdBy: "demo.user@example.com",
      createdAt: now(),
      updatedAt: now(),
      aiUsageCount: 1,
    };
    ideas = [idea, ...ideas];
    return { ...idea, notificationStatus: stage === "submitted" ? "sent" : undefined };
  },

  async updateStage(id: string, stage: IdeaStage, _reason?: string): Promise<Idea> {
    const found = ideas.find((idea) => idea.id === id);
    if (!found) {
      throw new Error("Idea not found");
    }
    found.stage = stage;
    found.updatedAt = now();
    return found;
  },

  async updateClassification(
    id: string,
    informationClassification: InformationClassification,
    classificationNotes = "",
    _reason?: string,
  ): Promise<Idea> {
    const found = ideas.find((idea) => idea.id === id);
    if (!found) {
      throw new Error("Idea not found");
    }
    found.informationClassification = informationClassification;
    found.classificationNotes = classificationNotes;
    found.updatedAt = now();
    return found;
  },

  async getAiSettings(): Promise<AiSettings> {
    return mockSettings;
  },

  async updateAiSettings(settings: AiSettingsPatch): Promise<AiSettings> {
    mockSettings = {
      provider: settings.provider,
      model: settings.model,
      enabled: settings.enabled,
      status: settings.enabled ? "connected" : "disabled",
      dailyLimit: settings.dailyLimit,
      monthlyBudget: settings.monthlyBudget,
      keyLast4: "mock",
      lastCheckedAt: now(),
      updatedBy: "local.dev@example.com",
    };
    return mockSettings;
  },

  async testAiSettings(_apiKey?: string, _model?: string, provider = "claude"): Promise<AiConnectionTestResult> {
    return {
      ok: true,
      status: "connected",
      message:
        provider === "deepseek"
          ? "モックDeepSeek接続テストに成功しました。"
          : "モック接続テストに成功しました。",
      keyLast4: "mock",
      checkedAt: now(),
    };
  },

  async runAiEval(): Promise<AiEvalSummary> {
    // モックはデモAI（決定的）で実行し、実APIと同じサマリ構造を返す。
    return runAiEval({
      providerLabel: "demo",
      generateQuestions: (input) => Promise.resolve(buildDemoQuestions(input)),
      structureIdea: (input, answers) => Promise.resolve(buildDemoStructure(input, answers)),
    });
  },

  async getAuditLogs(limit = 100): Promise<{ items: AuditLogEntry[] }> {
    const seed: AuditLogEntry[] = [
      {
        id: "log-001",
        actor: "demo.user@example.com",
        action: "idea.submit",
        resourceType: "idea",
        resourceId: "IDEA-001",
        result: "success",
        metadata: { stage: "submitted", duplicated: false },
        createdAt: now(),
      },
      {
        id: "log-002",
        actor: "admin@example.com",
        action: "ai_settings.update",
        resourceType: "ai_settings",
        result: "success",
        metadata: { model: "claude-sonnet-5", enabled: true },
        createdAt: now(),
      },
    ];
    return { items: seed.slice(0, limit) };
  },

  async getAiUsage(): Promise<AiUsageSummary> {
    return {
      summary: {
        totalCalls: 7,
        successCalls: 7,
        failedCalls: 0,
        totalCostEstimate: 0.42,
      },
      recent: [
        {
          executedBy: "demo.user@example.com",
          processType: "questions",
          model: "claude-sonnet-5",
          inputChars: 480,
          outputChars: 220,
          result: "success",
          usageCostEstimate: 0.02,
          promptVersion: "questions_v2",
          createdAt: now(),
        },
      ],
    };
  },

  async getAiUsageByDepartment(): Promise<{ items: AiDepartmentUsageRow[] }> {
    return {
      items: [
        { department: "土木工事部", totalCalls: 5, totalCostEstimate: 0.31 },
        { department: "施工管理部", totalCalls: 2, totalCostEstimate: 0.11 },
      ],
    };
  },

  async getUsageLimits(): Promise<{ items: UsageLimitItem[] }> {
    return { items: [...usageLimitItems] };
  },

  async updateUsageLimit(patch: UsageLimitPatch): Promise<UsageLimitItem> {
    const subjectId = patch.subjectType === "global" ? "*" : patch.subjectId;
    const existingIdx = usageLimitItems.findIndex(
      (item) => item.subjectType === patch.subjectType && item.subjectId === subjectId,
    );
    const item: UsageLimitItem = {
      subjectType: patch.subjectType,
      subjectId,
      dailyLimit: patch.dailyLimit,
      monthlyBudget: patch.monthlyBudget,
      enabled: patch.enabled,
      updatedBy: "demo.admin@example.com",
      updatedAt: now(),
    };
    if (existingIdx >= 0) usageLimitItems[existingIdx] = item;
    else usageLimitItems.push(item);
    return item;
  },

  async verifyAuditLogs(): Promise<AuditChainVerifyResult> {
    return { valid: true, checked: 2, legacyRows: 0 };
  },

  async exportAuditLogsCsv(): Promise<Response> {
    const body = "\uFEFFid,actor,action,created_at\r\nlog-001,demo,idea.submit,2026-08-12\r\n";
    return new Response(body, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-logs-${now().slice(0, 10)}.csv"`,
      },
    });
  },

  async exportAuditLogsXls(): Promise<Response> {
    const body =
      '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet">' +
      '<Worksheet ss:Name="AuditLogs"><Table><Row><Cell><Data ss:Type="String">id</Data></Cell>' +
      "<Cell><Data ss:Type=\"String\">actor</Data></Cell></Row></Table></Worksheet></Workbook>";
    return new Response(body, {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-logs-${now().slice(0, 10)}.xls"`,
      },
    });
  },

  async exportAuditLogsHtml(): Promise<Response> {
    const body = "<!doctype html><html><body><h1>監査ログ</h1><table><tr><th>actor</th></tr><tr><td>demo</td></tr></table></body></html>";
    return new Response(body, {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="audit-logs-${now().slice(0, 10)}.html"`,
      },
    });
  },

  async getUsers(): Promise<{ items: AppUser[] }> {
    return {
      items: [
        {
          id: "user-1",
          email: "admin@example.jp",
          name: "情報システム太郎",
          department: "情報システム部",
          role: "system_admin",
          status: "active",
          createdAt: now(),
          updatedAt: now(),
        },
      ],
    };
  },

  async createUser(input: AppUserInput): Promise<AppUser> {
    return {
      id: `user-${Date.now()}`,
      email: input.email.toLowerCase(),
      name: input.name ?? "",
      department: input.department ?? "",
      role: input.role,
      status: input.status ?? "active",
      createdAt: now(),
      updatedAt: now(),
    };
  },

  async updateUser(
    id: string,
    patch: Partial<Omit<AppUserInput, "authority">> & { authority?: AppUserInput["authority"] | null },
  ): Promise<AppUser> {
    const users = await this.getUsers();
    const found = users.items.find((user) => user.id === id);
    if (!found) throw new Error("User not found");
    return {
      ...found,
      ...patch,
      authority: patch.authority === null ? undefined : (patch.authority ?? found.authority),
      email: (patch.email ?? found.email).toLowerCase(),
    };
  },

  async deleteUser(): Promise<{ ok: boolean }> {
    return { ok: true };
  },
};

function splitList(value: string): string[] {
  return value
    .split(/[,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function csvCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  if (/^\s*[=+\-@]/.test(text)) {
    return `"'${text.replaceAll('"', '""')}"`;
  }
  if (/[",\r\n]/.test(text)) {
    return `"${text.replaceAll('"', '""')}"`;
  }
  return text;
}

// ---- モック用 RAG 類似検索（pg_trgm の代替）----
// 実DBでは migration 011 の search_text + word_similarity を使うが、モックは
// ブラウザ内で完結させるため、bigram の Dice 係数で類似度 0..1 を近似する。

function mockIdeaSearchText(idea: Idea): string {
  return [
    idea.title,
    idea.currentIssue,
    idea.targetBusiness,
    idea.targetUsers,
    idea.currentWorkflow,
    idea.improvementIdea,
    idea.expectedEffects,
    idea.mvpCandidate,
  ]
    .filter((part) => part && part.trim())
    .join(" ");
}

function bigrams(text: string): Set<string> {
  const normalized = text.trim().toLowerCase().replace(/\s+/g, "");
  const grams = new Set<string>();
  for (let i = 0; i < normalized.length - 1; i++) {
    grams.add(normalized.slice(i, i + 2));
  }
  return grams;
}

// クエリのbigramが対象テキストのbigramにどの程度含まれるか(0..1)を返す。
function diceSimilarity(query: string, target: string): number {
  const a = bigrams(query);
  const b = bigrams(target);
  if (a.size === 0 || b.size === 0) return 0;
  let overlap = 0;
  for (const gram of a) {
    if (b.has(gram)) overlap += 1;
  }
  return (2 * overlap) / (a.size + b.size);
}

function mockRagSearch(
  query: string,
  options: { excludeIdeaId?: string; limit?: number },
): RagSearchHit[] {
  const limit = Math.min(Math.max(1, options.limit ?? 5), 20);
  const hits = ideas
    .filter((idea) => idea.id !== options.excludeIdeaId)
    .map((idea) => {
      const similarity = diceSimilarity(query, mockIdeaSearchText(idea));
      return { idea, similarity, level: ragSimilarityLevel(similarity) };
    })
    .filter((hit) => hit.similarity >= ragMinSimilarity)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
    .map((hit) => ({
      idea: hit.idea,
      similarity: Math.round(hit.similarity * 1000) / 1000,
      level: hit.level,
    }));
  return hits;
}
