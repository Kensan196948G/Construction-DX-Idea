import { useEffect, useRef } from "react";
import { ApiClientError, api } from "./lib/api";
import type {
  AiQuestion,
  AiSettings,
  Idea,
  IdeaStage,
  IssueInput,
  StructuredIdea,
} from "./lib/shared";

const designPath = "/design/construction-dx-idea.html";
const workflowBindIntervalMs = 700;

type StandaloneIdea = {
  id: string | number;
  title: string;
  category: string;
  who: string;
  currentProcess: string;
  problem: string;
  dataUsed: string;
  existingSystemRelation: string;
  expectedEffect: string;
  mvpProposal: string;
  securityNotes: string;
  stage: string;
  targetCount: number;
  createdAt: string;
  history: Array<{ date: string; stage: string; note: string }>;
  apiStage?: IdeaStage;
};

type StandaloneReviewDraft = {
  title: string;
  category: string;
  who: string;
  problem: string;
  currentProcess: string;
  dataUsed: string;
  existingSystemRelation: string;
  expectedEffect: string;
  mvpProposal: string;
  securityNotes: string;
};

type StandaloneState = {
  view: string;
  selectedIdeaId: string | number | null;
  ideas: StandaloneIdea[];
  auditLog: Array<{ time: string; actor: string; action: string; detail: string }>;
  toast: { message: string } | null;
  filterStage: string;
  searchQuery: string;
  intakeForm: {
    work: string;
    who: string;
    currentMethod: string;
    desiredState: string;
    usedData: string;
    relatedSystems: string;
    confidentiality: "none" | "possible" | "unknown";
    freeText: string;
  };
  wizard: {
    questions: string[];
    answers: string[];
    draftAnswer: string;
    thinking: boolean;
    sourceIntake: StandaloneState["intakeForm"] | null;
  };
  reviewDraft: StandaloneReviewDraft | null;
  adminSettings: {
    model: string;
    enabled: boolean;
    monthlyCap: number;
    used: number;
    testing: boolean;
    testResult: string | null;
  };
};

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
  saveDraft?: () => void;
  advanceStage?: (id: string | number) => void;
  goTo?: (view: string) => void;
  runConnectionTest?: () => void;
  pushAudit?: (action: string, detail: string) => void;
  __hostWorkflowBound?: boolean;
  __hostDataLoaded?: boolean;
  __bridgeIssueInput?: IssueInput;
  __bridgeQuestionIds?: string[];
  __bridgeStructuredDraft?: StructuredIdea;
  __bridgeRoles?: string[];
  __bridgeBusy?: Record<string, boolean>;
};

export function App() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      bindIntegratedAiKeyControls(frameRef.current);
      bindStandaloneWorkflowBridge(frameRef.current);
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
            bindIntegratedAiKeyControls(frameRef.current);
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
  component.submitIntake = () => {
    void submitIntakeThroughApi(component);
  };
  component.submitAnswer = () => {
    void submitAnswerThroughApi(component);
  };
  component.registerIdea = () => {
    void saveReviewDraftThroughApi(component, "submitted");
  };
  component.saveDraft = () => {
    void saveReviewDraftThroughApi(component, "draft");
  };
  component.advanceStage = (id: string | number) => {
    void advanceStageThroughApi(component, id);
  };
  component.runConnectionTest = () => {
    void testSavedAiConnectionThroughApi(component);
  };
  component.goTo = (view: string) => {
    if (["adminSettings", "auditLog"].includes(view) && !hasRole(component, "system_admin")) {
      showToast(component, "システム管理者権限が必要です。");
      return;
    }
    component.setState({ view });
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
    component.setState((state) => ({
      adminSettings: mapAiSettingsToStandalone(settings, state.adminSettings),
    }));
  } else if (settingsResult.status === "rejected" && hasRole(component, "system_admin")) {
    shouldRetry = true;
    showToast(component, `AI利用設定を取得できませんでした: ${toErrorMessage(settingsResult.reason)}`);
  }

  if (shouldRetry) {
    window.setTimeout(() => {
      component.__hostDataLoaded = false;
      void loadInitialData(component);
    }, 5000);
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
      reviewDraft: toReviewDraft(fallback),
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
      reviewDraft: toReviewDraft(structured),
    }));
    component.pushAudit?.("AI利用", `${input.affectedRole || "利用者"}が「${structured.title}」についてAI壁打ちを実施`);
  } catch (error) {
    const fallback = buildManualStructuredIdea(input, answerRecord);
    component.__bridgeStructuredDraft = fallback;
    component.setState((state) => ({
      view: "review",
      wizard: { ...state.wizard, thinking: false },
      reviewDraft: toReviewDraft(fallback),
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

  try {
    const result = await api.saveIdea(structured, stage);
    const savedIdea = mapApiIdeaToStandalone(result);
    component.setState((state) => ({
      ideas: [savedIdea, ...state.ideas.filter((idea) => idea.id !== savedIdea.id)],
      selectedIdeaId: savedIdea.id,
      view: stage === "draft" ? "list" : "detail",
      intakeForm: {
        work: "",
        who: "現場代理人",
        currentMethod: "",
        desiredState: "",
        usedData: "",
        relatedSystems: "",
        confidentiality: "unknown",
        freeText: "",
      },
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

  const order = ["企画", "MVP", "検証", "本番化"];
  const currentIndex = order.indexOf(idea.stage);
  if (currentIndex < 0 || currentIndex >= order.length - 1) {
    finishBridgeAction(component, actionKey);
    return;
  }

  const nextStageLabel = order[currentIndex + 1];
  const nextStage = toApiStage(nextStageLabel);
  try {
    const updated = await api.updateStage(String(id), nextStage);
    const updatedIdea = mapApiIdeaToStandalone(updated);
    component.setState((state) => ({
      ideas: state.ideas.map((candidate) => (candidate.id === id ? updatedIdea : candidate)),
      selectedIdeaId: updatedIdea.id,
      toast: { message: `ステージを${nextStageLabel}へ変更しました:「${updatedIdea.title}」` },
    }));
    component.pushAudit?.("ステージ変更", `「${updatedIdea.title}」のステージを${nextStageLabel}へ変更`);
  } catch (error) {
    showToast(component, toErrorMessage(error));
  } finally {
    finishBridgeAction(component, actionKey);
  }
}

async function testSavedAiConnectionThroughApi(component: StandaloneComponent) {
  if (!startBridgeAction(component, "runConnectionTest")) return;
  if (!hasRole(component, "system_admin")) {
    showToast(component, "AI接続テストにはシステム管理者権限が必要です。");
    finishBridgeAction(component, "runConnectionTest");
    return;
  }

  const model = component.state.adminSettings.model;
  component.setState((state) => ({
    adminSettings: { ...state.adminSettings, testing: true, testResult: null },
  }));

  try {
    const result = await api.testAiSettings(undefined, model);
    component.setState((state) => ({
      adminSettings: {
        ...state.adminSettings,
        testing: false,
        testResult: result.ok ? "success" : "error",
      },
      toast: { message: result.ok ? `接続成功: ${result.message}` : `接続失敗: ${result.message}` },
    }));
    component.pushAudit?.("AI接続テスト", result.ok ? "Claude API接続テスト成功" : "Claude API接続テスト失敗");
  } catch (error) {
    component.setState((state) => ({
      adminSettings: { ...state.adminSettings, testing: false, testResult: "error" },
      toast: { message: toErrorMessage(error) },
    }));
  } finally {
    finishBridgeAction(component, "runConnectionTest");
  }
}

function toIssueInput(intake: StandaloneState["intakeForm"]): IssueInput {
  const issueText = normalizeText(intake.freeText);
  const workText = normalizeText(
    [intake.work, issueText ? `困りごとの内容: ${issueText}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  );
  return {
    workType: workText,
    affectedRole: normalizeText(intake.who),
    currentWorkflow: normalizeText(
      [intake.currentMethod, issueText ? `補足: ${issueText}` : ""]
        .filter(Boolean)
        .join("\n\n"),
    ),
    desiredState: normalizeText(intake.desiredState),
    usedData: normalizeText(intake.usedData),
    relatedSystems: normalizeText(intake.relatedSystems),
    confidentiality: intake.confidentiality,
  };
}

function validateIssueInput(input: IssueInput): string | null {
  if (!input.workType || !input.currentWorkflow || !input.desiredState) {
    return "困っている仕事、今のやり方、改善したい状態を入力してください。";
  }

  const fields = [
    input.workType,
    input.affectedRole,
    input.currentWorkflow,
    input.desiredState,
    input.usedData,
    input.relatedSystems,
  ];
  if (fields.some((field) => field.length > 2000)) {
    return "入力は1項目2,000文字以内にしてください。";
  }

  return null;
}

function normalizeText(value: string) {
  return value.trim();
}

function formatQuestion(question: AiQuestion) {
  return `${question.question}\n目的: ${question.purpose}`;
}

function toAnswerRecord(questionIds: string[], questionTexts: string[], answers: string[]) {
  return answers.reduce<Record<string, string>>((record, answer, index) => {
    const id = questionIds[index] ?? `q-${index + 1}`;
    record[id] = answer || "未回答";
    if (!questionIds[index] && questionTexts[index]) {
      record[`question-${index + 1}`] = questionTexts[index];
    }
    return record;
  }, {});
}

function buildManualStructuredIdea(input: IssueInput, answers: Record<string, string>): StructuredIdea {
  const answerSummary = Object.values(answers).filter(Boolean).join("\n");
  return {
    title: `${input.workType.slice(0, 48)}の改善`,
    currentIssue: input.workType,
    targetBusiness: input.workType,
    targetUsers: input.affectedRole || "現場管理者、関係部門",
    currentWorkflow: input.currentWorkflow,
    improvementIdea: input.desiredState,
    expectedEffects: "転記時間の削減、確認漏れの低減、情報共有の迅速化。",
    requiredData: splitList(input.usedData || "現場記録, 作業データ"),
    relatedSystems: splitList(input.relatedSystems || "Excel, 共有フォルダ"),
    implementationOptions: ["Web入力", "一覧管理", "CSV出力", "Slack通知"],
    securityNotes: input.confidentiality === "none"
      ? ["AI送信前の入力検査を継続する"]
      : ["機密情報の有無をIT部門が確認する"],
    openQuestions: answerSummary ? [`利用者回答: ${answerSummary}`] : ["効果見込みと対象範囲の確認"],
    mvpCandidate: "対象を1現場または1部署に限定して、入力・一覧・通知までを検証する。",
    mvpDoneDefinition: "実利用者が試用し、削減時間または手戻り削減を確認できること。",
  };
}

function toReviewDraft(structured: StructuredIdea): StandaloneReviewDraft {
  return {
    title: structured.title,
    category: structured.targetBusiness,
    who: structured.targetUsers,
    problem: structured.currentIssue,
    currentProcess: structured.currentWorkflow,
    dataUsed: structured.requiredData.join("、"),
    existingSystemRelation: structured.relatedSystems.join("、"),
    expectedEffect: structured.expectedEffects,
    mvpProposal: structured.mvpCandidate,
    securityNotes: structured.securityNotes.join("、"),
  };
}

function fromReviewDraft(
  reviewDraft: StandaloneReviewDraft,
  base?: StructuredIdea,
): StructuredIdea {
  return {
    title: reviewDraft.title,
    currentIssue: reviewDraft.problem,
    targetBusiness: reviewDraft.category,
    targetUsers: reviewDraft.who,
    currentWorkflow: reviewDraft.currentProcess,
    improvementIdea: base?.improvementIdea ?? reviewDraft.expectedEffect,
    expectedEffects: reviewDraft.expectedEffect,
    requiredData: splitList(reviewDraft.dataUsed),
    relatedSystems: splitList(reviewDraft.existingSystemRelation),
    implementationOptions: base?.implementationOptions ?? ["Web入力", "一覧管理", "Slack通知"],
    securityNotes: splitList(reviewDraft.securityNotes),
    openQuestions: base?.openQuestions ?? [],
    mvpCandidate: reviewDraft.mvpProposal,
    mvpDoneDefinition: base?.mvpDoneDefinition ?? "MVPの完了条件を企画段階で確定する。",
  };
}

function splitList(value: string) {
  return value
    .split(/[,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function mapApiIdeaToStandalone(idea: Idea): StandaloneIdea {
  const stageLabel = toStandaloneStage(idea.stage);
  return {
    id: idea.id,
    title: idea.title,
    category: idea.targetBusiness || "未分類",
    who: idea.targetUsers || "未設定",
    currentProcess: idea.currentWorkflow,
    problem: idea.currentIssue,
    dataUsed: idea.requiredData.join("、"),
    existingSystemRelation: idea.relatedSystems.join("、"),
    expectedEffect: idea.expectedEffects,
    mvpProposal: idea.mvpCandidate,
    securityNotes: idea.securityNotes.join("、"),
    stage: stageLabel,
    targetCount: Math.max(1, idea.aiUsageCount + idea.securityNotes.length + 8),
    createdAt: idea.createdAt.slice(0, 10),
    history: [{ date: idea.updatedAt.slice(0, 10), stage: stageLabel, note: "APIデータから表示" }],
    apiStage: idea.stage,
  };
}

function toStandaloneStage(stage: IdeaStage) {
  const stageMap: Record<IdeaStage, string> = {
    draft: "企画",
    submitted: "企画",
    planning: "企画",
    mvp: "MVP",
    verification: "検証",
    production_candidate: "検証",
    production: "本番化",
    rejected: "企画",
    archived: "企画",
  };
  return stageMap[stage];
}

function toApiStage(stage: string): IdeaStage {
  const stageMap: Record<string, IdeaStage> = {
    企画: "planning",
    MVP: "mvp",
    検証: "verification",
    本番化: "production",
  };
  return stageMap[stage] ?? "planning";
}

function mapAiSettingsToStandalone(
  settings: AiSettings,
  current: StandaloneState["adminSettings"],
): StandaloneState["adminSettings"] {
  return {
    ...current,
    model: settings.model,
    enabled: settings.enabled,
    monthlyCap: settings.monthlyBudget,
    testResult: settings.status === "connected" ? "success" : current.testResult,
  };
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

function bindIntegratedAiKeyControls(frame: HTMLIFrameElement | null) {
  const doc = frame?.contentDocument;
  if (!doc) return;

  const input = doc.getElementById("admin-api-key-input") as HTMLInputElement | null;
  const testButton = doc.getElementById("admin-api-key-test-button") as HTMLButtonElement | null;
  const clearButton = doc.getElementById("admin-api-key-clear-button") as HTMLButtonElement | null;
  const saveButton = doc.getElementById("admin-settings-save-button") as HTMLButtonElement | null;
  const status = doc.getElementById("admin-api-key-status") as HTMLElement | null;
  if (!input || !testButton || !clearButton || !saveButton || !status || testButton.dataset.bridgeBound === "true") {
    return;
  }

  testButton.dataset.bridgeBound = "true";
  clearButton.dataset.bridgeBound = "true";
  saveButton.dataset.bridgeBound = "true";

  testButton.addEventListener("click", () => {
    void testConnectionWithEnteredKey(doc, input, testButton, status);
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    showStatus(status, "", "neutral");
  });
  saveButton.addEventListener("click", () => {
    void saveAiSettings(doc, saveButton, status);
  });
}

async function testConnectionWithEnteredKey(
  doc: Document,
  input: HTMLInputElement,
  button: HTMLButtonElement,
  status: HTMLElement,
) {
  const apiKey = input.value.trim();
  if (!apiKey) {
    showStatus(status, "APIキーを入力してください。", "error");
    return;
  }

  const model = doc.querySelector<HTMLSelectElement>("select")?.value;
  button.disabled = true;
  button.style.opacity = "0.62";
  button.style.cursor = "wait";
  showStatus(status, "接続確認中です。APIキーは保存しません。", "neutral");

  try {
    const result = await api.testAiSettings(apiKey, model);
    const keyLast4 = result.keyLast4 ?? apiKey.slice(-4);
    showStatus(
      status,
      result.ok
        ? `接続成功: ${result.message} キー末尾 ${keyLast4}`
        : `接続失敗: ${result.message}`,
      result.ok ? "success" : "error",
    );
  } catch (error) {
    showStatus(status, toErrorMessage(error), "error");
  } finally {
    input.value = "";
    button.disabled = false;
    button.style.opacity = "1";
    button.style.cursor = "pointer";
  }
}

async function saveAiSettings(doc: Document, button: HTMLButtonElement, status: HTMLElement) {
  const model = doc.querySelector<HTMLSelectElement>("select")?.value ?? "claude-sonnet-4.5";
  const monthlyLimit = readMonthlyLimit(doc);
  const enabledLabel = Array.from(doc.querySelectorAll("div")).find((element) =>
    element.textContent?.includes("AIによる整理・壁打ち"),
  );

  button.disabled = true;
  button.style.opacity = "0.62";
  button.style.cursor = "wait";
  showStatus(status, "AI利用設定を保存中です。APIキー本体は保存しません。", "neutral");

  try {
    const settings = await api.updateAiSettings({
      model,
      enabled: enabledLabel?.textContent?.includes("有効") ?? true,
      dailyLimit: 10,
      monthlyBudget: monthlyLimit,
    });
    showStatus(
      status,
      `設定保存完了: ${settings.model} / 月間上限 ${settings.monthlyBudget} 回`,
      "success",
    );
  } catch (error) {
    showStatus(status, toErrorMessage(error), "error");
  } finally {
    button.disabled = false;
    button.style.opacity = "1";
    button.style.cursor = "pointer";
  }
}

function readMonthlyLimit(doc: Document) {
  const input = Array.from(doc.querySelectorAll<HTMLInputElement>("input")).find((candidate) =>
    candidate.previousElementSibling?.textContent?.includes("月間利用上限"),
  );
  const value = Number(input?.value);
  return Number.isFinite(value) && value >= 0 ? value : 500;
}

function showStatus(status: HTMLElement, message: string, tone: "success" | "error" | "neutral") {
  status.textContent = message;
  const styles = {
    success: "background:#E4F3EC;color:#1F8255;border:1px solid #CBE8DA;",
    error: "background:#FCE9E7;color:#C5392F;border:1px solid #F4C7C2;",
    neutral: "background:#F2F4F8;color:#5A6678;border:1px solid #E3E8EF;",
  };
  status.style.cssText =
    "display:" +
    (message ? "block" : "none") +
    ";margin-top:2px;padding:9px 11px;border-radius:8px;font-size:12.5px;font-weight:500;" +
    styles[tone];
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "処理に失敗しました。";
}
