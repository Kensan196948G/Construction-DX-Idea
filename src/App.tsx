import { useEffect, useRef } from "react";
import { ApiClientError, api } from "./lib/api";
import { drainQueue, enqueueDraft, normalizeQueue } from "./lib/offlineDrafts";
import {
  buildManualStructuredIdea,
  emptyIntakeForm,
  formatQuestion,
  fromReviewDraft,
  mapAiSettingsToStandalone,
  mapApiIdeaToStandalone,
  toStandaloneStage,
  toAnswerRecord,
  toIssueInput,
  toReviewDraft,
  validateIssueInput,
} from "./lib/standaloneBridge";
import type { StandaloneState } from "./lib/standaloneBridge";
import type { AiEvalSummary } from "./lib/aiEval";
import type {
  AiDepartmentUsageRow,
  AuditLogEntry,
  Authority,
  Gate3Brief,
  GateNo,
  GateOverviewResult,
  GateReminderRunResult,
  Idea,
  IdeaKpi,
  IdeaStage,
  InformationClassification,
  IssueInput,
  KnowledgeCandidate,
  KpiOutcome,
  PocPlan,
  PocPlanInput,
  PortfolioSummary,
  PortfolioSummaryRow,
  StructuredIdea,
  UatChecklistInput,
  UatFeedbackEntry,
  UatFeedbackInput,
  UatFeedbackSummary,
  UsageLimitItem,
  UsageLimitPatch,
} from "./lib/shared";
import { authorities } from "./lib/shared";

const designPath = "/design/construction-dx-idea.html";
const workflowBindIntervalMs = 700;
// Initial-data retry: 5s, 10s, 20s, 40s, 80s, then stop — an unreachable API
// must not poll forever (#26 flooded the console at a fixed 5s interval).
const initialDataMaxRetries = 5;
const initialDataRetryBaseMs = 5000;

type StandaloneComponent = {
  state: StandaloneState;
  setState: (
    update:
      | Partial<StandaloneState>
      | ((state: StandaloneState) => Partial<StandaloneState>),
  ) => void;
  submitIntake?: () => void;
  submitAnswer?: () => void;
  registerIdea?: () => void;
  saveApiKey?: () => void;
  advanceStage?: (id: string | number) => void;
  goTo?: (view: string) => void;
  runConnectionTest?: () => void;
  resetApiKeyInput?: () => void;
  __aiEvalBridge?: (provider: "demo" | "current") => Promise<AiEvalSummary>;
  __saveClassificationBridge?: (
    id: string,
    value: InformationClassification,
    notes: string,
  ) => Promise<Idea>;
  __loadKpiBridge?: (id: string) => Promise<{
    kpiBaselineHours: number | null;
    kpiBaselineCost: number | null;
    records: IdeaKpi[];
  }>;
  __loadPortfolioBridge?: () => Promise<{
    summary: PortfolioSummary;
    items: PortfolioSummaryRow[];
  }>;
  __loadGateOverviewBridge?: () => Promise<GateOverviewResult>;
  __runGateRemindersBridge?: () => Promise<GateReminderRunResult>;
  __recordKpiBridge?: (
    id: string,
    input: {
      actualReductionPct: number;
      outcome: KpiOutcome;
      reviewNote: string;
      periodMonths: number;
    },
  ) => Promise<IdeaKpi>;
  __saveKpiBaselineBridge?: (
    id: string,
    baseline: { kpiBaselineHours?: number | null; kpiBaselineCost?: number | null; reason?: string },
  ) => Promise<Idea>;
  __loadPocBridge?: (id: string) => Promise<{ plan: PocPlan; feedbackSummary: UatFeedbackSummary }>;
  __savePocPlanBridge?: (id: string, input: PocPlanInput) => Promise<PocPlan>;
  __saveUatChecklistBridge?: (id: string, input: UatChecklistInput) => Promise<PocPlan>;
  __submitUatFeedbackBridge?: (id: string, input: UatFeedbackInput) => Promise<UatFeedbackEntry>;
  __getGate3BriefBridge?: (id: string) => Promise<Gate3Brief>;
  loadPocData?: () => Promise<void>;
  submitComment?: () => void;
  exportCsv?: () => void;
  exportExcel?: () => void;
  requestApproval?: () => void;
  decideApproval?: (decision: string) => () => void;
  loadGatesForSelected?: () => Promise<void>;
  initGates?: () => Promise<void>;
  requestGateApproval?: () => Promise<void>;
  decideGateApproval?: (decision: string) => () => Promise<void>;
  loadGateOverview?: () => Promise<void>;
  runGateReminders?: () => Promise<void>;
  loadReposForSelected?: () => Promise<void>;
  linkRepo?: () => Promise<void>;
  unlinkRepo?: (linkId: string) => Promise<void>;
  loadRepoOverview?: () => Promise<void>;
  syncRepoEvidence?: () => Promise<void>;
  loadKnowledge?: (statusFilter?: string) => Promise<void>;
  submitKnowledge?: () => Promise<void>;
  extractKnowledge?: () => Promise<void>;
  reviewKnowledge?: (id: string, action: "approve" | "reject") => Promise<void>;
  promoteKnowledge?: (id: string, url: string) => Promise<void>;
  __updateKnowledgeBridge?: (id: string, input: { owner?: string; expiresAt?: string | null }) => Promise<KnowledgeCandidate>;
  __supersedeKnowledgeBridge?: (id: string, supersededBy: string) => Promise<KnowledgeCandidate>;
  __archiveKnowledgeBridge?: (id: string) => Promise<KnowledgeCandidate>;
  __reuseKnowledgeBridge?: (id: string) => Promise<KnowledgeCandidate>;
  __loadUsageLimitsBridge?: () => Promise<{ items: UsageLimitItem[] }>;
  __saveUsageLimitBridge?: (patch: UsageLimitPatch) => Promise<UsageLimitItem>;
  __loadAiUsageByDepartmentBridge?: () => Promise<{ items: AiDepartmentUsageRow[] }>;
  loadIdeaPhase?: () => Promise<void>;
  advanceIdeaPhase?: () => Promise<void>;
  loadSimilarIdeas?: () => Promise<void>;
  saveUser?: () => void;
  deleteUser?: (id: string | number) => void;
  toggleUserStatus?: (id: string | number) => void;
  exportAuditCsv?: () => void;
  exportAuditXls?: () => void;
  exportAuditHtml?: () => void;
  pushAudit?: (action: string, detail: string) => void;
  __hostWorkflowBound?: boolean;
  __hostDataLoaded?: boolean;
  __bridgeIssueInput?: IssueInput;
  __bridgeQuestionIds?: string[];
  __bridgeStructuredDraft?: StructuredIdea;
  __bridgeRoles?: string[];
  __bridgeBusy?: Record<string, boolean>;
  __bridgeDailyLimit?: number;
  __bridgeRetryCount?: number;
  __bridgeSubmitKey?: string;
  __bridgeLastSearchIssue?: string;
  __bridgeLastSearchIdea?: string;
  __bridgeSearchTimer?: number;
  __bridgeOfflineSyncDone?: boolean;
  __bridgeUsersLoaded?: boolean;
};

export function App() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      bindStandaloneWorkflowBridge(frameRef.current);
      watchSearchQuery(frameRef.current);
    }, workflowBindIntervalMs);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main className="standaloneDesignShell" aria-label="Construction DX Idea">
      {import.meta.env.VITE_DEMO_BANNER === "true" && (
        <div className="demoEnvironmentBadge" role="status">
          MVPデモ環境（ダミーデータ）
        </div>
      )}
      <iframe
        ref={frameRef}
        className="standaloneDesignFrame"
        title="Construction DX Idea"
        src={designPath}
        onLoad={() => {
          window.setTimeout(() => {
            bindStandaloneWorkflowBridge(frameRef.current);
          }, 500);
        }}
      />
    </main>
  );
}

function bindStandaloneWorkflowBridge(frame: HTMLIFrameElement | null) {
  const component = getStandaloneComponent(frame);
  if (!component || component.__hostWorkflowBound) return;

  component.__hostWorkflowBound = true;
  const originalSubmitIntake = component.submitIntake?.bind(component);
  const originalSubmitAnswer = component.submitAnswer?.bind(component);
  const originalRegisterIdea = component.registerIdea?.bind(component);
  const originalAdvanceStage = component.advanceStage?.bind(component);

  component.submitIntake = () => {
    if (component.state.intakeForm.type === "idea") {
      originalSubmitIntake?.();
      return;
    }
    void submitIntakeThroughApi(component);
  };
  component.submitAnswer = () => {
    if (component.state.wizard.sourceIntake?.type === "idea") {
      originalSubmitAnswer?.();
      return;
    }
    void submitAnswerThroughApi(component);
  };
  component.registerIdea = () => {
    if (component.state.reviewDraft?.type === "idea") {
      originalRegisterIdea?.();
      return;
    }
    void saveReviewDraftThroughApi(component, "submitted");
  };
  component.advanceStage = (id: string | number) => {
    const idea = component.state.ideas.find((candidate) => candidate.id === id);
    if (!idea?.apiStage) {
      originalAdvanceStage?.(id);
      return;
    }
    void advanceStageThroughApi(component, id);
  };
  component.saveApiKey = () => {
    void saveApiKeyThroughApi(component);
  };
  component.runConnectionTest = () => {
    void testSavedAiConnectionThroughApi(component);
  };
  component.resetApiKeyInput = () => {
    void resetApiKeyInputThroughApi(component);
  };
  // AI品質Eval（Issue #13）: システム管理者がAI設定画面から実行。
  component.__aiEvalBridge = (provider) => api.runAiEval(provider);
  // 情報区分・公開制御（migration 012）: 詳細画面からの区分更新。
  component.__saveClassificationBridge = (id, value, notes) =>
    api.updateClassification(id, value, notes, "WebUIから変更");
  // KPI・ROI（migration 013）: 詳細画面の効果測定。
  component.__loadKpiBridge = (id) => api.getIdeaKpis(id);
  component.__recordKpiBridge = (id, input) => api.recordKpi(id, input);
  component.__saveKpiBaselineBridge = (id, baseline) => api.updateKpiBaseline(id, baseline);
  // PoC・MVP・UAT管理（docs/29 §2.19・migration 017）: 詳細画面のPoC計画・UAT。
  component.__loadPocBridge = (id) => api.getPocPlan(id);
  component.__savePocPlanBridge = (id, input) => api.updatePocPlan(id, input);
  component.__saveUatChecklistBridge = (id, input) => api.updateUatChecklist(id, input);
  component.__submitUatFeedbackBridge = (id, input) => api.submitUatFeedback(id, input);
  component.__getGate3BriefBridge = (id) => api.getGate3Brief(id);
  // ポートフォリオ（docs/29 §2.5）: 専用画面の集計データ（管理者限定API）。
  component.__loadPortfolioBridge = () => api.getPortfolio();
  // Gate滞留分析・リマインダー（docs/29 §2.7・migration 014・システム管理者限定API）。
  component.__loadGateOverviewBridge = () => api.getGateOverview();
  component.__runGateRemindersBridge = () => api.runGateReminders();
  component.submitComment = () => {
    void submitCommentThroughApi(component);
  };
  component.exportCsv = () => {
    void exportCsvThroughApi(component);
  };
  component.exportExcel = () => {
    void exportExcelThroughApi(component);
  };
  component.requestApproval = () => {
    void requestApprovalThroughApi(component);
  };
  component.decideApproval = (decision: string) => () => {
    void decideApprovalThroughApi(component, decision);
  };
  component.loadGatesForSelected = () => loadGatesForSelected(component);
  component.initGates = () => initGatesThroughApi(component);
  component.requestGateApproval = () => requestGateApprovalThroughApi(component);
  component.decideGateApproval = (decision: string) => () =>
    decideGateApprovalThroughApi(component, decision);
  component.loadGateOverview = () => loadGateOverviewThroughBridge(component);
  component.runGateReminders = () => runGateRemindersThroughBridge(component);
  // GitHub Engineering 連携（migration 015）とKnowledge Management（migration 016）。
  component.loadReposForSelected = () => loadReposThroughApi(component);
  component.linkRepo = () => linkRepoThroughApi(component);
  component.unlinkRepo = (linkId) => unlinkRepoThroughApi(component, linkId);
  component.loadRepoOverview = () => loadRepoOverviewThroughApi(component);
  component.syncRepoEvidence = () => syncRepoEvidenceThroughApi(component);
  component.loadKnowledge = (statusFilter) => loadKnowledgeThroughApi(component, statusFilter);
  component.submitKnowledge = () => submitKnowledgeThroughApi(component);
  component.extractKnowledge = () => extractKnowledgeThroughApi(component);
  component.reviewKnowledge = (id, action) => reviewKnowledgeThroughApi(component, id, action);
  // url省略時は昇格先URLをプロンプトで受け取る（モックと同じUX）。
  component.promoteKnowledge = (id, url) =>
    promoteKnowledgeThroughApi(
      component,
      id,
      url ?? window.prompt("昇格先（Notion等）のURLを入力してください。") ?? "",
    );
  component.__updateKnowledgeBridge = (id, input) => api.updateKnowledge(id, input);
  component.__supersedeKnowledgeBridge = (id, supersededBy) => api.supersedeKnowledge(id, supersededBy);
  component.__archiveKnowledgeBridge = (id) => api.archiveKnowledge(id);
  component.__reuseKnowledgeBridge = (id) => api.reuseKnowledge(id);
  component.__loadUsageLimitsBridge = () => api.getUsageLimits();
  component.__saveUsageLimitBridge = (patch) => api.updateUsageLimit(patch);
  component.__loadAiUsageByDepartmentBridge = () => api.getAiUsageByDepartment();
  component.loadIdeaPhase = () => loadIdeaPhase(component);
  component.advanceIdeaPhase = () => advanceIdeaPhase(component);
  component.loadSimilarIdeas = () => loadSimilarIdeas(component);
  component.saveUser = () => {
    void saveUserThroughApi(component);
  };
  component.deleteUser = (id: string | number) => {
    void deleteUserThroughApi(component, id);
  };
  component.toggleUserStatus = (id: string | number) => {
    void toggleUserStatusThroughApi(component, id);
  };
  component.exportAuditCsv = () => {
    void exportAuditThroughApi(component, "csv");
  };
  component.exportAuditXls = () => {
    void exportAuditThroughApi(component, "xls");
  };
  component.exportAuditHtml = () => {
    void exportAuditThroughApi(component, "html");
  };
  component.goTo = (view: string) => {
    if (
      ["adminSettings", "auditLog", "userManagement", "integrations"].includes(view) &&
      !hasRole(component, "system_admin")
    ) {
      showToast(component, "システム管理者権限が必要です。");
      return;
    }
    if (view === "evaluation" && !hasRole(component, "admin")) {
      showToast(component, "評価ボードには管理者権限が必要です。");
      return;
    }
    if (view === "portfolio" && !hasRole(component, "admin")) {
      showToast(component, "ポートフォリオには管理者権限が必要です。");
      return;
    }
    if (view === "gateDashboard" && !hasRole(component, "system_admin")) {
      showToast(component, "Gate滞留分析にはシステム管理者権限が必要です。");
      return;
    }
    if (view === "knowledge" && !hasRole(component, "system_admin")) {
      showToast(component, "知識管理にはシステム管理者権限が必要です。");
      return;
    }
    component.setState({ view });
    if (view === "detail") {
      void loadCommentsForSelected(component);
      void loadGatesForSelected(component);
      void loadIdeaPhase(component);
      void loadSimilarIdeas(component);
      void loadReposThroughApi(component);
    }
    if (view === "portfolio") {
      void loadPortfolioThroughBridge(component);
    }
    if (view === "gateDashboard") {
      void loadGateOverviewThroughBridge(component);
    }
    if (view === "knowledge") {
      void loadKnowledgeThroughApi(component);
    }
    if (view === "userManagement" && hasRole(component, "system_admin")) {
      void loadUsers(component);
    }
  };

  component.setState((state) => ({ ...state }));
  void loadInitialData(component);
}

function getStandaloneComponent(frame: HTMLIFrameElement | null): StandaloneComponent | null {
  const win = frame?.contentWindow as (Window & { __constructionDxComponent?: StandaloneComponent }) | null;
  return win?.__constructionDxComponent ?? null;
}

async function loadInitialData(component: StandaloneComponent) {
  if (component.__hostDataLoaded) return;
  component.__hostDataLoaded = true;
  let shouldRetry = false;

  try {
    const profile = await api.getMe();
    component.__bridgeRoles = profile.roles;
  } catch (error) {
    component.__bridgeRoles = ["user"];
    shouldRetry = true;
    showToast(component, `利用者情報を取得できませんでした: ${toErrorMessage(error)}`);
  }

  const [ideasResult, settingsResult] = await Promise.allSettled([
    api.listIdeas(),
    hasRole(component, "system_admin") ? api.getAiSettings() : Promise.resolve(null),
  ]);

  if (ideasResult.status === "fulfilled") {
    const ideas = ideasResult.value.map(mapApiIdeaToStandalone);
    component.setState((state) => ({
      ideas,
      selectedIdeaId: ideas.some((idea) => idea.id === state.selectedIdeaId)
        ? state.selectedIdeaId
        : null,
    }));
  } else {
    shouldRetry = true;
    showToast(component, `実データを取得できませんでした: ${toErrorMessage(ideasResult.reason)}`);
  }

  if (settingsResult.status === "fulfilled" && settingsResult.value !== null) {
    const settings = settingsResult.value;
    component.__bridgeDailyLimit = settings.dailyLimit;
    component.setState((state) => ({
      adminSettings: mapAiSettingsToStandalone(settings, state.adminSettings),
    }));
  } else if (settingsResult.status === "rejected" && hasRole(component, "system_admin")) {
    shouldRetry = true;
    showToast(component, `AI利用設定を取得できませんでした: ${toErrorMessage(settingsResult.reason)}`);
  }

  if (hasRole(component, "system_admin")) {
    // Sequential (not Promise.allSettled): each read appends to the hash
    // chain, and parallel appends raced on the previous hash.
    try {
      const auditResult = await api.getAuditLogs(200);
      component.setState({ auditLog: auditResult.items.map(mapAuditEntryToStandalone) });
    } catch (error) {
      shouldRetry = true;
      showToast(component, `監査ログを取得できませんでした: ${toErrorMessage(error)}`);
    }
    try {
      const usageResult = await api.getAiUsage();
      component.setState((state) => ({
        adminSettings: { ...state.adminSettings, used: usageResult.summary.totalCalls },
      }));
    } catch (error) {
      shouldRetry = true;
      showToast(component, `AI利用量を取得できませんでした: ${toErrorMessage(error)}`);
    }
  }

  if (hasRole(component, "admin")) {
    try {
      const evaluationResult = await api.getEvaluationBoard();
      component.setState({
        evaluationItems: evaluationResult.items.map((item) => ({
          id: item.id,
          title: item.title,
          stage: toStandaloneStage(item.stage),
          score: item.priorityScore,
          reasons: item.reasons.join("、"),
        })),
      });
    } catch (error) {
      showToast(component, `評価ボードを取得できませんでした: ${toErrorMessage(error)}`);
    }
  }

  if (!component.__bridgeOfflineSyncDone) {
    component.__bridgeOfflineSyncDone = true;
    void syncOfflineDrafts(component);
  }

  if (shouldRetry) {
    const attempt = (component.__bridgeRetryCount ?? 0) + 1;
    component.__bridgeRetryCount = attempt;
    if (attempt > initialDataMaxRetries) {
      showToast(
        component,
        "サーバーへの接続に繰り返し失敗したため、自動再試行を停止しました。ページを再読み込みしてください。",
      );
      return;
    }
    const delayMs = initialDataRetryBaseMs * 2 ** (attempt - 1);
    window.setTimeout(() => {
      component.__hostDataLoaded = false;
      void loadInitialData(component);
    }, delayMs);
  } else {
    component.__bridgeRetryCount = 0;
  }
}

async function submitIntakeThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "submitIntake")) return;
  const input = toIssueInput(component.state.intakeForm);
  const validationError = validateIssueInput(input);
  if (validationError) {
    showToast(component, validationError);
    finishBridgeAction(component, "submitIntake");
    return;
  }

  component.__bridgeIssueInput = input;
  component.__bridgeQuestionIds = [];
  component.setState((state) => ({
    view: "wizard",
    wizard: {
      ...state.wizard,
      questions: ["入力内容を検査し、AIに送る前の安全確認をしています。"],
      answers: [],
      draftAnswer: "",
      thinking: true,
      sourceIntake: state.intakeForm,
    },
  }));

  try {
    const findings = await api.inspectInput(input);
    const blockers = findings.filter((finding) => finding.severity === "blocker");
    if (blockers.length > 0) {
      component.setState((state) => ({
        view: "intake",
        wizard: { ...state.wizard, thinking: false },
      }));
      showToast(component, `機密情報候補があるためAI送信を停止しました: ${blockers[0].label}`);
      finishBridgeAction(component, "submitIntake");
      return;
    }

    const questions = await api.generateQuestions(input, component.state.intakeForm.department);
    component.__bridgeQuestionIds = questions.map((question) => question.id);
    component.setState((state) => ({
      view: "wizard",
      wizard: {
        ...state.wizard,
        questions: questions.map(formatQuestion),
        answers: [],
        draftAnswer: "",
        thinking: false,
        sourceIntake: state.intakeForm,
      },
      toast:
        findings.length > 0
          ? { message: `機密情報候補を確認しました: ${findings.map((finding) => finding.label).join("、")}` }
          : null,
    }));
  } catch (error) {
    const fallback = buildManualStructuredIdea(input, {});
    component.__bridgeStructuredDraft = fallback;
    component.setState((state) => ({
      view: "review",
      wizard: { ...state.wizard, thinking: false },
      reviewDraft: toReviewDraft(fallback, state.intakeForm),
      toast: {
        message: `${toErrorMessage(error)} 手動確認用の下書きを作成しました。`,
      },
    }));
  } finally {
    finishBridgeAction(component, "submitIntake");
  }
}

async function submitAnswerThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "submitAnswer")) return;
  const wizard = component.state.wizard;
  const draftAnswer = wizard.draftAnswer.trim();
  if (!draftAnswer && wizard.answers.length < wizard.questions.length) {
    showToast(component, "回答を入力してください。");
    finishBridgeAction(component, "submitAnswer");
    return;
  }

  const answers = [...wizard.answers, draftAnswer];
  if (answers.length < wizard.questions.length) {
    component.setState((state) => ({
      wizard: { ...state.wizard, answers, draftAnswer: "" },
    }));
    finishBridgeAction(component, "submitAnswer");
    return;
  }

  const input = component.__bridgeIssueInput ?? toIssueInput(wizard.sourceIntake ?? component.state.intakeForm);
  const answerRecord = toAnswerRecord(component.__bridgeQuestionIds ?? [], wizard.questions, answers);
  component.setState((state) => ({
    wizard: { ...state.wizard, answers, draftAnswer: "", thinking: true },
  }));

  try {
    const response = await api.structureIdea(
      input,
      answerRecord,
      (wizard.sourceIntake ?? component.state.intakeForm).department,
    );
    const structured = response.structured;
    component.__bridgeStructuredDraft = structured;
    component.setState((state) => ({
      view: "review",
      wizard: { ...state.wizard, thinking: false },
      reviewDraft: toReviewDraft(structured, wizard.sourceIntake ?? state.intakeForm, {
        confidence: response.confidence,
        confidenceLevel: response.confidenceLevel,
        citations: response.citations,
        duplicateVerdict: response.duplicateVerdict,
      }),
    }));
    component.pushAudit?.("AI利用", `${input.affectedRole || "利用者"}が「${structured.title}」についてAI壁打ちを実施`);
  } catch (error) {
    const fallback = buildManualStructuredIdea(input, answerRecord);
    component.__bridgeStructuredDraft = fallback;
    component.setState((state) => ({
      view: "review",
      wizard: { ...state.wizard, thinking: false },
      reviewDraft: toReviewDraft(fallback, wizard.sourceIntake ?? state.intakeForm),
      toast: {
        message: `${toErrorMessage(error)} 手動確認用の下書きを作成しました。`,
      },
    }));
  } finally {
    finishBridgeAction(component, "submitAnswer");
  }
}

async function saveReviewDraftThroughApi(component: StandaloneComponent, stage: IdeaStage) {
  const actionKey = stage === "draft" ? "saveDraft" : "registerIdea";
  if (!startBridgeAction(component, actionKey)) return;
  if (!component.state.reviewDraft) {
    showToast(component, "保存する構造化結果がありません。");
    finishBridgeAction(component, actionKey);
    return;
  }

  const structured = fromReviewDraft(
    component.state.reviewDraft,
    component.__bridgeStructuredDraft,
  );
  component.__bridgeStructuredDraft = structured;
  const idempotencyKey = component.__bridgeSubmitKey ?? crypto.randomUUID();
  component.__bridgeSubmitKey = idempotencyKey;

  try {
    const result = await api.saveIdea(structured, stage, idempotencyKey);
    component.__bridgeSubmitKey = undefined;
    const savedIdea = mapApiIdeaToStandalone(result);
    component.setState((state) => ({
      ideas: [savedIdea, ...state.ideas.filter((idea) => idea.id !== savedIdea.id)],
      selectedIdeaId: savedIdea.id,
      view: stage === "draft" ? "list" : "detail",
      intakeForm: emptyIntakeForm(state.intakeForm),
      wizard: {
        questions: [],
        answers: [],
        draftAnswer: "",
        thinking: false,
        sourceIntake: null,
      },
      reviewDraft: null,
      toast: {
        message:
          stage === "draft"
            ? `下書き保存しました:「${savedIdea.title}」`
            : result.notificationStatus === "failed"
              ? `正式登録しました。Slack通知のみ失敗しました:「${savedIdea.title}」`
              : `正式登録し、Slackへ通知しました:「${savedIdea.title}」`,
      },
    }));
    component.pushAudit?.(stage === "draft" ? "下書き保存" : "新規登録", `「${savedIdea.title}」を保存`);
  } catch (error) {
    if (isNetworkLikeError(error)) {
      queueOfflineDraft(structured, stage);
      showToast(component, "サーバーに接続できないため、内容を端末のオフライン下書きへ保存しました。通信復旧後に自動同期します。");
      finishBridgeAction(component, actionKey);
      return;
    }
    showToast(component, toErrorMessage(error));
  } finally {
    finishBridgeAction(component, actionKey);
  }
}

async function advanceStageThroughApi(component: StandaloneComponent, id: string | number) {
  const actionKey = `advanceStage:${id}`;
  if (!startBridgeAction(component, actionKey)) return;
  if (!hasRole(component, "admin")) {
    showToast(component, "ステージ変更には管理者権限が必要です。");
    finishBridgeAction(component, actionKey);
    return;
  }

  const idea = component.state.ideas.find((candidate) => candidate.id === id);
  if (!idea) {
    finishBridgeAction(component, actionKey);
    return;
  }
  if (idea.apiStage && ["draft", "rejected", "archived"].includes(idea.apiStage)) {
    showToast(component, "下書き・却下・保管状態のアイデアはステージ変更できません。");
    finishBridgeAction(component, actionKey);
    return;
  }

  const nextByApiStage: Partial<Record<IdeaStage, IdeaStage>> = {
    submitted: "planning",
    planning: "mvp",
    mvp: "verification",
    verification: "production_candidate",
    production_candidate: "production",
  };
  const nextStage = idea.apiStage ? nextByApiStage[idea.apiStage] : undefined;
  if (!nextStage) {
    finishBridgeAction(component, actionKey);
    return;
  }

  try {
    const updated = await api.updateStage(String(id), nextStage);
    const updatedIdea = mapApiIdeaToStandalone(updated);
    component.setState((state) => ({
      ideas: state.ideas.map((candidate) => (candidate.id === id ? updatedIdea : candidate)),
      selectedIdeaId: updatedIdea.id,
      toast: { message: `ステージを${toStandaloneStage(nextStage)}へ変更しました:「${updatedIdea.title}」` },
    }));
    component.pushAudit?.("ステージ変更", `「${updatedIdea.title}」のステージを${toStandaloneStage(nextStage)}へ変更`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  } finally {
    finishBridgeAction(component, actionKey);
  }
}

async function testSavedAiConnectionThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "aiSettings")) return;
  if (!hasRole(component, "system_admin")) {
    showToast(component, "AI接続テストにはシステム管理者権限が必要です。");
    finishBridgeAction(component, "aiSettings");
    return;
  }

  const model = component.state.adminSettings.model;
  const provider = component.state.adminSettings.provider;
  const typedKey = component.state.adminSettings.apiKey?.trim() || undefined;
  const keySourceLabel = typedKey ? "入力中のキー" : "サーバー登録キー";
  component.setState((state) => ({
    adminSettings: { ...state.adminSettings, testing: true, testResult: null },
  }));

  try {
    const result = await api.testAiSettings(typedKey, model, provider);
    component.setState((state) => ({
      adminSettings: {
        ...state.adminSettings,
        testing: false,
        testResult: result.ok ? "success" : "error",
      },
      toast: {
        message: result.ok
          ? `接続成功（${keySourceLabel}）: ${result.message}`
          : `接続失敗（${keySourceLabel}）: ${result.message}`,
      },
    }));
    component.pushAudit?.(
      "AI接続テスト",
      result.ok
        ? `${provider === "deepseek" ? "DeepSeek" : "Claude"} API接続テスト成功（${keySourceLabel}）`
        : `${provider === "deepseek" ? "DeepSeek" : "Claude"} API接続テスト失敗（${keySourceLabel}）`,
    );
  } catch (error) {
    component.setState((state) => ({
      adminSettings: { ...state.adminSettings, testing: false, testResult: "error" },
      toast: { message: toErrorMessage(error) },
    }));
  } finally {
    finishBridgeAction(component, "aiSettings");
  }
}

async function saveApiKeyThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "aiSettings")) return;
  if (!hasRole(component, "system_admin")) {
    showToast(component, "AI設定の変更にはシステム管理者権限が必要です。");
    finishBridgeAction(component, "aiSettings");
    return;
  }

  const monthlyCapRaw = component.state.adminSettings.monthlyCap;
  const monthlyBudget = Number(monthlyCapRaw);
  if (monthlyCapRaw === "" || !Number.isFinite(monthlyBudget) || monthlyBudget < 0) {
    showToast(component, "月間利用上限には0以上の数値を入力してください。");
    finishBridgeAction(component, "aiSettings");
    return;
  }

  const apiKey = component.state.adminSettings.apiKey?.trim();
  const model = component.state.adminSettings.model;
  const provider = component.state.adminSettings.provider;

  try {
    if (apiKey) {
      const result = await api.testAiSettings(apiKey, model, provider);
      if (!result.ok) {
        showToast(component, `接続確認に失敗しました: ${result.message}`);
        return;
      }
    }

    const settings = await api.updateAiSettings({
      provider: provider as "claude" | "deepseek",
      model,
      enabled: component.state.adminSettings.enabled,
      dailyLimit: component.__bridgeDailyLimit ?? 10,
      monthlyBudget,
    });
    component.setState((state) => ({
      adminSettings: {
        ...mapAiSettingsToStandalone(settings, state.adminSettings),
        apiKey: "",
        apiKeySaved: true,
        apiKeySavedMsg: true,
      },
      toast: {
        message: apiKey
          ? `AI利用設定を保存しました: ${settings.model}（入力キーは接続確認のみに使用。実際の利用キーはCloudflare Secretで管理されます）`
          : `AI利用設定を保存しました: ${settings.model}`,
      },
    }));
    component.pushAudit?.("設定変更", `${provider === "deepseek" ? "DeepSeek" : "Claude"} API設定を更新`);
    window.setTimeout(() => {
      component.setState((state) => ({
        adminSettings: { ...state.adminSettings, apiKeySavedMsg: false },
      }));
    }, 3200);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  } finally {
    finishBridgeAction(component, "aiSettings");
  }
}

async function resetApiKeyInputThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "aiSettings")) return;

  component.setState((state) => ({
    adminSettings: {
      ...state.adminSettings,
      apiKey: "",
      testing: false,
      testResult: null,
      apiKeySaved: false,
      apiKeySavedMsg: false,
    },
  }));

  try {
    if (hasRole(component, "system_admin")) {
      const settings = await api.getAiSettings();
      component.__bridgeDailyLimit = settings.dailyLimit;
      component.setState((state) => ({
        adminSettings: {
          ...mapAiSettingsToStandalone(settings, state.adminSettings),
          apiKey: "",
          testResult: null,
        },
        toast: { message: "入力をリセットし、サーバーのAI利用設定を再取得しました。" },
      }));
    } else {
      showToast(component, "入力をリセットしました。");
    }
  } catch (error) {
    showToast(component, `入力はリセットしましたが、設定の再取得に失敗しました: ${toErrorMessage(error)}`);
  } finally {
    finishBridgeAction(component, "aiSettings");
  }
}

function showToast(component: StandaloneComponent, message: string) {
  component.setState({ toast: { message } });
}

function hasRole(component: StandaloneComponent, role: string) {
  return component.__bridgeRoles?.includes(role) ?? false;
}

function startBridgeAction(component: StandaloneComponent, key: string) {
  component.__bridgeBusy ??= {};
  if (component.__bridgeBusy[key]) {
    showToast(component, "処理中です。完了までお待ちください。");
    return false;
  }
  component.__bridgeBusy[key] = true;
  return true;
}

function finishBridgeAction(component: StandaloneComponent, key: string) {
  if (component.__bridgeBusy) {
    component.__bridgeBusy[key] = false;
  }
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "処理に失敗しました。";
}

async function submitCommentThroughApi(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  if (!idea?.apiStage) {
    component.submitComment?.();
    return;
  }
  const text = component.state.commentDraft.trim();
  if (!text) return;
  try {
    const created = await api.addComment(String(idea.id), text);
    component.setState((state) => {
      const target = state.ideas.find((candidate) => candidate.id === idea.id);
      if (!target) return {};
      const updated = {
        ...target,
        comments: [
          ...(target.comments ?? []),
          {
            author: created.author,
            time: created.createdAt.replace("T", " ").slice(0, 16),
            text: created.body,
          },
        ],
      };
      return {
        ideas: state.ideas.map((candidate) => (candidate.id === idea.id ? updated : candidate)),
        commentDraft: "",
        toast: { message: "コメントを追加しました。" },
      };
    });
    component.pushAudit?.("コメント", `「${idea.title}」にコメントを追加`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function loadCommentsForSelected(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  if (!idea?.apiStage) return;
  try {
    const { items } = await api.getComments(String(idea.id));
    component.setState((state) => ({
      ideas: state.ideas.map((candidate) =>
        candidate.id === idea.id
          ? {
              ...candidate,
              comments: items.map((comment) => ({
                author: comment.author,
                time: comment.createdAt.replace("T", " ").slice(0, 16),
                text: comment.body,
              })),
            }
          : candidate,
      ),
    }));
  } catch (error) {
    showToast(component, `コメントを取得できませんでした: ${toErrorMessage(error)}`);
  }
}

async function exportCsvThroughApi(component: StandaloneComponent) {
  if (!hasRole(component, "admin")) {
    showToast(component, "CSV出力には管理者権限が必要です。");
    return;
  }
  try {
    const response = await api.exportIdeasCsv();
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
      showToast(component, `CSV出力に失敗しました: ${errorBody?.message ?? response.status}`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dx-ideas-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    component.pushAudit?.("CSV出力", "DXアイデア一覧をCSV出力");
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function exportExcelThroughApi(component: StandaloneComponent) {
  if (!hasRole(component, "admin")) {
    showToast(component, "Excel出力には管理者権限が必要です。");
    return;
  }
  try {
    const response = await api.exportIdeasXls();
    if (!response.ok) {
      const errorBody = (await response.json().catch(() => null)) as { message?: string } | null;
      showToast(component, `Excel出力に失敗しました: ${errorBody?.message ?? response.status}`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `dx-ideas-${new Date().toISOString().slice(0, 10)}.xls`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    component.pushAudit?.("Excel出力", "DXアイデア一覧をExcel出力");
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function requestApprovalThroughApi(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  if (!idea?.apiStage) return;
  const { approverEmail, reason } = component.state.approvalDraft;
  if (!approverEmail.trim()) {
    showToast(component, "承認者メールを入力してください。");
    return;
  }
  try {
    const updated = await api.requestApproval(String(idea.id), {
      approverEmail: approverEmail.trim(),
      reason: reason.trim() || undefined,
    });
    const mapped = mapApiIdeaToStandalone(updated);
    component.setState((state) => ({
      ideas: state.ideas.map((candidate) => (candidate.id === idea.id ? mapped : candidate)),
      approvalDraft: { approverEmail: "", reason: "" },
      toast: { message: `承認依頼を送信しました: ${mapped.approverEmail}` },
    }));
    component.pushAudit?.("承認依頼", `「${mapped.title}」の承認依頼を送信`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function decideApprovalThroughApi(component: StandaloneComponent, decision: string) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  if (!idea?.apiStage) return;
  const reason = component.state.approvalDraft.reason.trim();
  if (!reason) {
    showToast(component, "判定理由を入力してください。");
    return;
  }
  if (!["approve", "reject", "return"].includes(decision)) return;
  try {
    const updated = await api.decideApproval(String(idea.id), {
      decision: decision as "approve" | "reject" | "return",
      reason,
    });
    const mapped = mapApiIdeaToStandalone(updated);
    component.setState((state) => ({
      ideas: state.ideas.map((candidate) => (candidate.id === idea.id ? mapped : candidate)),
      approvalDraft: { ...state.approvalDraft, reason: "" },
      toast: { message: `承認判定を記録しました: ${mapped.approvalStatus}` },
    }));
    component.pushAudit?.("承認判定", `「${mapped.title}」を${decision}`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

// ---- Gate1-5 承認フロー APIブリッジ（#50/#57）----
// standalone HTML はローカル状態遷移（モック）を持ち、実API接続時は
// このブリッジが component の gate メソッドを差し替えてAPIを呼ぶ。

function selectedIdeaForGate(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  return idea && idea.apiStage ? idea : null;
}

function setGateData(
  component: StandaloneComponent,
  data: { items: unknown[]; summary: unknown[] | null },
) {
  component.setState({ gateData: data, gateBusy: false });
}

function setGateBusy(component: StandaloneComponent, busy: boolean) {
  component.setState({ gateBusy: busy });
}

async function loadGatesForSelected(component: StandaloneComponent) {
  const idea = selectedIdeaForGate(component);
  if (!idea) return;
  try {
    const result = await api.getGates(String(idea.id));
    // itemsが空 = まだ /gates/init されていない。開始ボタンを表示するため null に戻す。
    const initialized = result.items.length > 0;
    setGateData(component, {
      items: initialized ? result.items : [],
      summary: initialized ? (result.summary ?? null) : null,
    });
    if (!initialized) {
      // gateData=null 相当にする（gateInitEnabled=true で開始ボタン表示）。
      component.setState({ gateData: null, gateBusy: false });
    }
  } catch (error) {
    showToast(component, `Gate状態を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

async function initGatesThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForGate(component);
  if (!idea) return;
  setGateBusy(component, true);
  try {
    const result = await api.initGates(String(idea.id));
    setGateData(component, { items: result.items, summary: result.summary ?? null });
    component.pushAudit?.("Gate初期化", `「${idea.title}」のGate1〜5承認を開始`);
  } catch (error) {
    setGateBusy(component, false);
    showToast(component, toErrorMessage(error));
  }
}

async function requestGateApprovalThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForGate(component);
  if (!idea) return;
  const { gateNo, authority, approverEmail, reason, dueDate, delegateTo } =
    component.state.gateDraft;
  const authorityValue = authority || "business";
  if (!approverEmail.trim()) {
    showToast(component, "承認者メールを入力してください。");
    return;
  }
  // 期限（date入力・任意）。date入力はローカル時刻の当日終業時刻として解釈する
  // （UTC深夜にしない。当日選択でも未来時刻になる）。未指定ならworker側の既定（5日後）。
  const dueAt = dueDate ? new Date(`${dueDate}T23:59:59`).toISOString() : undefined;
  const delegate = delegateTo.trim() || undefined;
  setGateBusy(component, true);
  try {
    await api.requestGateApproval(String(idea.id), Number(gateNo) as GateNo, {
      authority: authorityValue as Authority,
      approverEmail: approverEmail.trim(),
      reason: reason.trim() || undefined,
      dueAt,
      delegateTo: delegate,
    });
    await loadGatesForSelected(component);
    setGateBusy(component, false);
    component.setState((state) => ({
      gateDraft: { ...state.gateDraft, approverEmail: "", reason: "", dueDate: "", delegateTo: "" },
      toast: { message: `Gate${gateNo}（${authorityValue}）の承認依頼を送信しました。` },
    }));
    component.pushAudit?.("Gate承認依頼", `「${idea.title}」Gate${gateNo}/${authorityValue}`);
  } catch (error) {
    setGateBusy(component, false);
    showToast(component, toErrorMessage(error));
  }
}

async function decideGateApprovalThroughApi(component: StandaloneComponent, decision: string) {
  const idea = selectedIdeaForGate(component);
  if (!idea) return;
  const { gateNo, authority, reason, conditionNote } = component.state.gateDraft;
  const authorityValue = authority || "business";
  if (!reason.trim()) {
    showToast(component, "判定理由を入力してください。");
    return;
  }
  if (!["approve", "return", "reject"].includes(decision)) return;
  // 条件付き承認（migration 014）: approve時に入力された条件をAPIへ渡す。
  const condition = decision === "approve" ? conditionNote.trim() || undefined : undefined;
  setGateBusy(component, true);
  try {
    await api.decideGateApproval(String(idea.id), Number(gateNo) as GateNo, {
      authority: authorityValue as Authority,
      decision: decision as "approve" | "return" | "reject",
      reason: reason.trim(),
      conditionNote: condition,
    });
    await loadGatesForSelected(component);
    setGateBusy(component, false);
    component.setState((state) => ({
      gateDraft: { ...state.gateDraft, reason: "", conditionNote: "" },
      toast: {
        message: condition
          ? `Gate${gateNo}（${authorityValue}）の判定を記録しました: ${decision}（条件付き）`
          : `Gate${gateNo}（${authorityValue}）の判定を記録しました: ${decision}`,
      },
    }));
    component.pushAudit?.(
      "Gate判定",
      `「${idea.title}」Gate${gateNo}/${authorityValue}: ${decision}${condition ? "（条件付き）" : ""}`,
    );
  } catch (error) {
    setGateBusy(component, false);
    showToast(component, toErrorMessage(error));
  }
}

// ---- 20フェーズ Idea-to-Value ブリッジ（migration 010）----

function selectedIdeaForPhase(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  return idea && idea.apiStage ? idea : null;
}

async function loadIdeaPhase(component: StandaloneComponent) {
  const idea = selectedIdeaForPhase(component);
  if (!idea) return;
  try {
    const data = await api.getIdeaPhase(String(idea.id));
    component.setState({
      phaseData: {
        ideaId: data.ideaId,
        phaseNo: data.phaseNo,
        phaseLabel: data.phaseLabel,
        phaseNote: data.phaseNote,
        phases: data.phases,
      },
      phaseBusy: false,
    });
  } catch (error) {
    showToast(component, `フェーズ情報を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// ---- RAG 類似・重複候補（Issue #13・migration 011）----

function selectedIdeaForSimilar(component: StandaloneComponent) {
  const idea = component.state.ideas.find(
    (candidate) => candidate.id === component.state.selectedIdeaId,
  );
  return idea && idea.apiStage ? idea : null;
}

async function loadSimilarIdeas(component: StandaloneComponent) {
  const idea = selectedIdeaForSimilar(component);
  if (!idea) return;
  component.setState({ similarBusy: true });
  try {
    const data = await api.getSimilarIdeas(String(idea.id), 5);
    component.setState({
      similarData: {
        query: data.query,
        items: data.items.map((hit) => ({
          idea: hit.idea,
          title: hit.idea.title,
          stage: hit.idea.stage,
          caseId: hit.idea.caseId ?? "",
          similarity: hit.similarity,
          level: hit.level,
        })),
      },
      similarBusy: false,
    });
  } catch (error) {
    // 類似検索は補助機能のため、失敗しても詳細表示を妨げない。
    component.setState({ similarBusy: false });
    showToast(component, `類似案件を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

async function loadPortfolioThroughBridge(component: StandaloneComponent) {
  const bridge = component.__loadPortfolioBridge;
  if (!bridge) return;
  component.setState({ portfolioBusy: true });
  try {
    const data = await bridge();
    component.setState({ portfolioData: data, portfolioBusy: false });
  } catch (error) {
    component.setState({ portfolioBusy: false });
    showToast(component, `ポートフォリオを取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// Gate滞留分析（docs/29 §2.7・migration 014）: 専用画面のデータ取得（システム管理者）。
async function loadGateOverviewThroughBridge(component: StandaloneComponent) {
  const bridge = component.__loadGateOverviewBridge;
  if (!bridge) return;
  component.setState({ gateOverviewBusy: true });
  try {
    const data = await bridge();
    component.setState({ gateOverview: data, gateOverviewBusy: false });
  } catch (error) {
    component.setState({ gateOverviewBusy: false });
    showToast(component, `Gate滞留分析を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// Gateリマインダー/エスカレーション実行（migration 014・システム管理者）。
async function runGateRemindersThroughBridge(component: StandaloneComponent) {
  const bridge = component.__runGateRemindersBridge;
  if (!bridge) return;
  component.setState({ gateOverviewBusy: true });
  try {
    const result = await bridge();
    showToast(
      component,
      `リマインダー${result.reminded}件 / エスカレーション${result.escalated}件を送信しました（スキップ${result.skipped}件）。`,
    );
    await loadGateOverviewThroughBridge(component);
  } catch (error) {
    component.setState({ gateOverviewBusy: false });
    showToast(component, `リマインダーを実行できませんでした: ${toErrorMessage(error)}`);
  }
}

// ---- GitHub Engineering 連携ブリッジ（migration 015 / docs/29 §2.12）----

function selectedIdeaForRepos(component: StandaloneComponent) {
  return selectedIdeaForGate(component);
}

// 詳細表示時: Repo紐付けと収集済みEvidenceをロードする。
async function loadReposThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForRepos(component);
  if (!idea) return;
  component.setState({ repoBusy: true });
  try {
    const result = await api.listIdeaRepos(String(idea.id));
    component.setState({
      repoData: {
        links: result.items.map((link) => ({
          id: link.id,
          ideaId: link.ideaId,
          repoFullName: link.repoFullName,
          defaultBranch: link.defaultBranch,
        })),
        evidence: result.evidence.map((e) => ({
          kind: e.kind,
          externalId: e.externalId,
          title: e.title,
          status: e.status,
          url: e.url,
        })),
        overview: null,
      },
      repoBusy: false,
      repoInput: "",
    });
  } catch (error) {
    component.setState({ repoBusy: false });
    showToast(component, `Repo連携状態を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// Repo紐付け登録（owner/repo 形式。URL貼り付けはサーバー側で正規化される）。
async function linkRepoThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForRepos(component);
  if (!idea) return;
  const repoFullName = component.state.repoInput.trim();
  if (!repoFullName) {
    showToast(component, "owner/repo 形式でGitHubリポジトリを入力してください。");
    return;
  }
  component.setState({ repoBusy: true });
  try {
    await api.linkIdeaRepo(String(idea.id), repoFullName);
    showToast(component, `${repoFullName} を紐付けました。`);
    await loadReposThroughApi(component);
    component.pushAudit?.("GitHub連携", `「${idea.title}」に ${repoFullName} を紐付け`);
  } catch (error) {
    component.setState({ repoBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

async function unlinkRepoThroughApi(component: StandaloneComponent, linkId: string) {
  const idea = selectedIdeaForRepos(component);
  if (!idea) return;
  component.setState({ repoBusy: true });
  try {
    await api.unlinkIdeaRepo(String(idea.id), linkId);
    showToast(component, "Repo紐付けを解除しました。");
    await loadReposThroughApi(component);
  } catch (error) {
    component.setState({ repoBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

// GitHub状態取得（Repo/CI/Release/PR/Issue・案件ID一致表示込み）。
async function loadRepoOverviewThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForRepos(component);
  if (!idea) return;
  component.setState({ repoBusy: true });
  try {
    const result = await api.getIdeaGitHubOverview(String(idea.id));
    component.setState((state) => ({
      repoBusy: false,
      repoData: {
        ...state.repoData,
        links: result.repos.map((repo) => ({
          id: repo.repoFullName,
          ideaId: String(idea.id),
          repoFullName: repo.repoFullName,
          defaultBranch: repo.defaultBranch,
        })),
        overview: result.repos.map((repo) => ({
          repoFullName: repo.repoFullName,
          defaultBranch: repo.defaultBranch,
          stars: repo.stars,
          ciStatus: repo.ciStatus,
          ciUrl: repo.ciUrl,
          latestRelease: repo.latestRelease,
          openPullRequests: repo.openPullRequests.map((pr) => ({
            number: pr.number,
            title: pr.title,
            state: pr.state,
            draft: pr.draft,
            url: pr.url,
            caseIdMatched: pr.caseIdMatched,
          })),
          openIssues: repo.openIssues.map((issue) => ({
            number: issue.number,
            title: issue.title,
            state: issue.state,
            url: issue.url,
            caseIdMatched: issue.caseIdMatched,
          })),
        })),
      },
    }));
  } catch (error) {
    component.setState({ repoBusy: false });
    showToast(component, `GitHub状態を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// Evidence自動収集（PR/Issue/Release/CI → idea_github_evidence へupsert）。
async function syncRepoEvidenceThroughApi(component: StandaloneComponent) {
  const idea = selectedIdeaForRepos(component);
  if (!idea) return;
  component.setState({ repoBusy: true });
  try {
    const result = await api.syncIdeaGitHub(String(idea.id));
    showToast(component, `Evidenceを${result.upserted}件収集しました。`);
    await loadReposThroughApi(component);
    component.pushAudit?.("GitHub同期", `「${idea.title}」Evidence ${result.upserted}件`);
  } catch (error) {
    component.setState({ repoBusy: false });
    showToast(component, `Evidenceを収集できませんでした: ${toErrorMessage(error)}`);
  }
}

// ---- Knowledge Management ブリッジ（migration 016 / docs/29 §2.16）----

// Review Queue一覧ロード（statusFilter: candidate/approved/rejected/promoted/""）。
async function loadKnowledgeThroughApi(component: StandaloneComponent, statusFilter?: string) {
  const filter = statusFilter ?? component.state.knowledgeData?.statusFilter ?? "";
  component.setState({ knowledgeBusy: true });
  try {
    const result = await api.listKnowledge({ status: filter || undefined });
    component.setState({
      knowledgeBusy: false,
      knowledgeData: {
        items: result.items.map((k) => ({
          id: k.id,
          sourceType: k.sourceType,
          sourceIdeaId: k.sourceIdeaId,
          category: k.category,
          title: k.title,
          body: k.body,
          status: k.status,
          qualityScore: k.qualityScore,
          submittedBy: k.submittedBy,
          promotionUrl: k.promotionUrl,
          owner: k.owner,
          expiresAt: k.expiresAt,
          supersededBy: k.supersededBy,
          reuseCount: k.reuseCount,
        })),
        statusFilter: filter,
      },
    });
  } catch (error) {
    component.setState({ knowledgeBusy: false });
    showToast(component, `知識候補を取得できませんでした: ${toErrorMessage(error)}`);
  }
}

// 手動登録フォームの送信。
async function submitKnowledgeThroughApi(component: StandaloneComponent) {
  const form = component.state.knowledgeForm;
  if (!form.title.trim()) {
    showToast(component, "タイトルを入力してください。");
    return;
  }
  component.setState({ knowledgeBusy: true });
  try {
    await api.submitKnowledge({
      title: form.title.trim(),
      category: (form.category || "lessons") as Parameters<typeof api.submitKnowledge>[0]["category"],
      body: form.body.trim() || undefined,
    });
    component.setState({
      knowledgeBusy: false,
      knowledgeForm: { title: "", category: form.category, body: "" },
      toast: { message: "知識候補を登録しました（Review Queueで承認待ち）。" },
    });
    await loadKnowledgeThroughApi(component);
  } catch (error) {
    component.setState({ knowledgeBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

// 案件データからの自動抽出（Gate判定理由/コメント/効果測定レビュー）。
async function extractKnowledgeThroughApi(component: StandaloneComponent) {
  component.setState({ knowledgeBusy: true });
  try {
    const result = await api.extractKnowledge();
    showToast(component, `知識候補を${result.created}件抽出しました。`);
    await loadKnowledgeThroughApi(component);
  } catch (error) {
    component.setState({ knowledgeBusy: false });
    showToast(component, `抽出できませんでした: ${toErrorMessage(error)}`);
  }
}

async function reviewKnowledgeThroughApi(
  component: StandaloneComponent,
  id: string,
  action: "approve" | "reject",
) {
  component.setState({ knowledgeBusy: true });
  try {
    await api.reviewKnowledge(id, { action });
    showToast(component, action === "approve" ? "知識を承認しました。" : "知識を却下しました。");
    await loadKnowledgeThroughApi(component);
  } catch (error) {
    component.setState({ knowledgeBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

// 昇格（Notion等のURLを記録）。URLはプロンプトで入力する簡易実装。
async function promoteKnowledgeThroughApi(component: StandaloneComponent, id: string, url: string) {
  if (!url.trim()) return;
  component.setState({ knowledgeBusy: true });
  try {
    await api.promoteKnowledge(id, url.trim());
    showToast(component, "知識を昇格しました（URL記録済み）。");
    await loadKnowledgeThroughApi(component);
  } catch (error) {
    component.setState({ knowledgeBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

async function advanceIdeaPhase(component: StandaloneComponent) {
  const idea = selectedIdeaForPhase(component);
  const data = component.state.phaseData;
  if (!idea || !data) return;
  const next = data.phaseNo + 1;
  if (next > 20) {
    showToast(component, "最終フェーズ（20）まで完了しています。");
    return;
  }
  const note = component.state.phaseNoteDraft?.trim() || undefined;
  component.setState({ phaseBusy: true });
  try {
    await api.updateIdeaPhase(String(idea.id), { phaseNo: next, reason: "フェーズ前進", note });
    await loadIdeaPhase(component);
    component.setState({ phaseBusy: false, phaseNoteDraft: "" });
    component.pushAudit?.("フェーズ前進", `「${idea.title}」をフェーズ${next}へ`);
    showToast(component, `フェーズを前進しました: ${next}`);
  } catch (error) {
    component.setState({ phaseBusy: false });
    showToast(component, toErrorMessage(error));
  }
}

function watchSearchQuery(frame: HTMLIFrameElement | null) {
  const component = getStandaloneComponent(frame);
  if (!component || !component.__hostDataLoaded) return;
  const issueQuery = component.state.searchQueryIssue;
  const ideaQuery = component.state.searchQueryIdea;
  if (issueQuery !== (component.__bridgeLastSearchIssue ?? "")) {
    component.__bridgeLastSearchIssue = issueQuery;
    scheduleSearch(component, issueQuery);
  }
  if (ideaQuery !== (component.__bridgeLastSearchIdea ?? "")) {
    component.__bridgeLastSearchIdea = ideaQuery;
    scheduleSearch(component, ideaQuery);
  }
}

function scheduleSearch(component: StandaloneComponent, q: string) {
  if (component.__bridgeSearchTimer) {
    window.clearTimeout(component.__bridgeSearchTimer);
  }
  component.__bridgeSearchTimer = window.setTimeout(() => {
    component.__bridgeSearchTimer = undefined;
    void api
      .listIdeas({ q: q.trim() || undefined })
      .then((ideas) => {
        component.setState({ ideas: ideas.map(mapApiIdeaToStandalone) });
      })
      .catch((error) => {
        showToast(component, `検索に失敗しました: ${toErrorMessage(error)}`);
      });
  }, 600);
}

const OFFLINE_DRAFTS_KEY = "cdx-offline-drafts-v1";

function isNetworkLikeError(error: unknown): boolean {
  if (error instanceof ApiClientError) {
    return (
      error.code === undefined ||
      error.code === "INTERNAL_ERROR" ||
      error.code === "DATABASE_NOT_CONFIGURED" ||
      error.code === "DATABASE_MISCONFIGURED"
    );
  }
  return true;
}

function queueOfflineDraft(structured: StructuredIdea, stage: IdeaStage) {
  try {
    const raw = window.localStorage.getItem(OFFLINE_DRAFTS_KEY);
    const queue = raw ? normalizeQueue(JSON.parse(raw)) : [];
    const next = enqueueDraft(queue, structured, stage);
    window.localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(next));
  } catch {
    // Storage unavailable — fall back to the regular error toast.
  }
}

async function syncOfflineDrafts(component: StandaloneComponent) {
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(OFFLINE_DRAFTS_KEY);
  } catch {
    return;
  }
  if (!raw) return;
  let queue = [];
  try {
    queue = normalizeQueue(JSON.parse(raw));
  } catch {
    return;
  }
  if (queue.length === 0) return;
  const { remaining, synced } = await drainQueue(queue, async (draft) => {
    await api.saveIdea(draft.structured, draft.stage, draft.idempotencyKey);
  });
  try {
    window.localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(remaining));
  } catch {
    // Keep the queue in memory for this session only.
  }
  showToast(
    component,
    synced > 0
      ? `オフライン下書きを${synced}件同期しました。`
      : "オフライン下書きの同期に失敗しました。通信復旧後に再試行します。",
  );
}

async function loadUsers(component: StandaloneComponent) {
  try {
    const { items } = await api.getUsers();
    component.setState({
      users: items.map((user) => ({
        id: user.id,
        name: user.name || user.email,
        department: user.department,
        email: user.email,
        role: user.role,
        authority: user.authority ?? "",
        status: user.status,
      })),
    });
  } catch (error) {
    showToast(component, `ログインユーザーを取得できませんでした: ${toErrorMessage(error)}`);
  }
}

async function saveUserThroughApi(component: StandaloneComponent) {
  const form = component.state.userForm;
  const email = form.email.trim();
  if (!email) {
    showToast(component, "メールアドレスを入力してください。");
    return;
  }
  const authority = (authorities as readonly string[]).includes(form.authority)
    ? (form.authority as Authority)
    : undefined;
  try {
    if (form.editingId != null) {
      await api.updateUser(String(form.editingId), {
        email,
        name: form.name.trim(),
        department: form.department.trim(),
        role: form.role as "user" | "admin" | "system_admin",
        authority: authority ?? null,
      });
    } else {
      await api.createUser({
        email,
        name: form.name.trim(),
        department: form.department.trim(),
        role: form.role as "user" | "admin" | "system_admin",
        authority,
      });
    }
    component.setState({
      userForm: { email: "", name: "", department: "", role: "user", authority: "", editingId: null },
    });
    await loadUsers(component);
    component.pushAudit?.("ユーザー管理", form.editingId != null ? "ユーザーを更新" : "ユーザーを追加");
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function deleteUserThroughApi(component: StandaloneComponent, id: string | number) {
  const target = component.state.users.find((user) => user.id === id);
  if (!target) return;
  if (!window.confirm(`ユーザー「${target.name}」を削除しますか？`)) return;
  try {
    await api.deleteUser(String(id));
    await loadUsers(component);
    showToast(component, "ユーザーを削除しました。");
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function toggleUserStatusThroughApi(component: StandaloneComponent, id: string | number) {
  const target = component.state.users.find((user) => user.id === id);
  if (!target) return;
  try {
    await api.updateUser(String(id), {
      status: target.status === "active" ? "suspended" : "active",
    });
    await loadUsers(component);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

async function exportAuditThroughApi(component: StandaloneComponent, kind: "csv" | "xls" | "html") {
  if (!hasRole(component, "system_admin")) {
    showToast(component, "監査ログのエクスポートにはシステム管理者権限が必要です。");
    return;
  }
  try {
    const response =
      kind === "csv"
        ? await api.exportAuditLogsCsv()
        : kind === "xls"
          ? await api.exportAuditLogsXls()
          : await api.exportAuditLogsHtml();
    if (!response.ok) {
      showToast(component, `監査ログのエクスポートに失敗しました: ${response.status}`);
      return;
    }
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.${kind === "html" ? "html" : kind}`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    component.pushAudit?.("監査エクスポート", `監査ログを${kind.toUpperCase()}で出力`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  }
}

const auditActionLabels: Record<string, string> = {
  "ai_usage.read": "AI利用量閲覧",
  "ai.quality.blocked": "AI品質ブロック",
  "ai_settings.test": "AI接続テスト",
  "ai_settings.update": "設定変更",
  "audit_logs.read": "監査ログ閲覧",
  "idea.draft": "下書き保存",
  "idea.draft.duplicate": "重複下書き検知",
  "idea.export.csv": "CSVエクスポート",
  "idea.history.read": "履歴閲覧",
  "idea.submit": "新規登録",
  "idea.submit.duplicate": "重複登録検知",
  "slack.notify.failed": "Slack通知失敗",
  "stage.update": "ステージ変更",
  "usage_limits.read": "利用制限閲覧",
  "usage_limits.update": "利用制限更新",
};

function mapAuditEntryToStandalone(entry: AuditLogEntry) {
  const metadataText = JSON.stringify(entry.metadata ?? {});
  const detail = [entry.resourceType, entry.resourceId, metadataText]
    .filter(Boolean)
    .join(" / ")
    .slice(0, 160);
  return {
    time: entry.createdAt.replace("T", " ").slice(0, 16),
    actor: entry.actor,
    action: auditActionLabels[entry.action] ?? entry.action,
    detail,
  };
}
