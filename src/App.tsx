import { useEffect, useRef } from "react";
import { ApiClientError, api } from "./lib/api";
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
import type { AuditLogEntry, IdeaStage, IssueInput, StructuredIdea } from "./lib/shared";

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
  submitComment?: () => void;
  exportCsv?: () => void;
  exportExcel?: () => void;
  requestApproval?: () => void;
  decideApproval?: (decision: string) => () => void;
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
    component.setState({ view });
    if (view === "detail") {
      void loadCommentsForSelected(component);
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
    const [auditResult, usageResult] = await Promise.allSettled([api.getAuditLogs(200), api.getAiUsage()]);
    if (auditResult.status === "fulfilled") {
      component.setState({ auditLog: auditResult.value.items.map(mapAuditEntryToStandalone) });
    } else {
      shouldRetry = true;
      showToast(component, `監査ログを取得できませんでした: ${toErrorMessage(auditResult.reason)}`);
    }
    if (usageResult.status === "fulfilled") {
      component.setState((state) => ({
        adminSettings: { ...state.adminSettings, used: usageResult.value.summary.totalCalls },
      }));
    } else {
      shouldRetry = true;
      showToast(component, `AI利用量を取得できませんでした: ${toErrorMessage(usageResult.reason)}`);
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

    const questions = await api.generateQuestions(input);
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
    const structured = await api.structureIdea(input, answerRecord);
    component.__bridgeStructuredDraft = structured;
    component.setState((state) => ({
      view: "review",
      wizard: { ...state.wizard, thinking: false },
      reviewDraft: toReviewDraft(structured, wizard.sourceIntake ?? state.intakeForm),
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
  const typedKey = component.state.adminSettings.apiKey?.trim() || undefined;
  const keySourceLabel = typedKey ? "入力中のキー" : "サーバー登録キー";
  component.setState((state) => ({
    adminSettings: { ...state.adminSettings, testing: true, testResult: null },
  }));

  try {
    const result = await api.testAiSettings(typedKey, model);
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
        ? `Claude API接続テスト成功（${keySourceLabel}）`
        : `Claude API接続テスト失敗（${keySourceLabel}）`,
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

  try {
    if (apiKey) {
      const result = await api.testAiSettings(apiKey, model);
      if (!result.ok) {
        showToast(component, `接続確認に失敗しました: ${result.message}`);
        return;
      }
    }

    const settings = await api.updateAiSettings({
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
    component.pushAudit?.("設定変更", "Claude APIキーを更新");
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
    const queue = raw
      ? (
          JSON.parse(raw) as Array<{
            structured: StructuredIdea;
            stage: IdeaStage;
            queuedAt: string;
          }>
        ).slice(0, 19)
      : [];
    queue.push({ structured, stage, queuedAt: new Date().toISOString() });
    window.localStorage.setItem(OFFLINE_DRAFTS_KEY, JSON.stringify(queue));
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
  let queue: Array<{ structured: StructuredIdea; stage: IdeaStage; queuedAt: string }> = [];
  try {
    queue = JSON.parse(raw);
  } catch {
    return;
  }
  if (!Array.isArray(queue) || queue.length === 0) return;
  const remaining: typeof queue = [];
  let synced = 0;
  for (const draft of queue) {
    try {
      await api.saveIdea(draft.structured, draft.stage);
      synced += 1;
    } catch {
      remaining.push(draft);
    }
  }
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
