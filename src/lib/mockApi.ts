import { inspectIssueInput } from "./privacy";
import type {
  AiConnectionTestResult,
  AiQuestion,
  AiSettings,
  AiSettingsPatch,
  DashboardMetrics,
  Idea,
  IdeaHistory,
  IdeaStage,
  IssueInput,
  PrivacyFinding,
  SaveIdeaResult,
  StructuredIdea,
  UserProfile,
} from "./shared";

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

  async getIdeaHistory(id: string): Promise<IdeaHistory> {
    const idea = ideas.find((candidate) => candidate.id === id);
    if (!idea) throw new Error("Idea not found");
    return {
      history: [{ fromStage: undefined, toStage: idea.stage, changedBy: idea.createdBy, reason: "", changedAt: idea.updatedAt }],
      decisions: [],
    };
  },

  async inspectInput(input: IssueInput): Promise<PrivacyFinding[]> {
    return inspectIssueInput(input);
  },

  async generateQuestions(input: IssueInput): Promise<AiQuestion[]> {
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

  async structureIdea(input: IssueInput, answers: Record<string, string>): Promise<StructuredIdea> {
    const frequency = answers["q-frequency"] ? `月${answers["q-frequency"]}回程度` : "頻度未確認";
    const time = answers["q-time"] ? `1回${answers["q-time"]}分程度` : "所要時間未確認";

    return {
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
  },

  async saveIdea(structured: StructuredIdea, stage: IdeaStage): Promise<SaveIdeaResult> {
    const idea: Idea = {
      ...structured,
      id: `IDEA-${String(ideas.length + 1).padStart(3, "0")}`,
      stage,
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

  async getAiSettings(): Promise<AiSettings> {
    return mockSettings;
  },

  async updateAiSettings(settings: AiSettingsPatch): Promise<AiSettings> {
    mockSettings = {
      provider: "claude",
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

  async testAiSettings(): Promise<AiConnectionTestResult> {
    return {
      ok: true,
      status: "connected",
      message: "モック接続テストに成功しました。",
      keyLast4: "mock",
      checkedAt: now(),
    };
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
