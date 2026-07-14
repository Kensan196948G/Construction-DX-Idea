import type {
  AiQuestion,
  AiSettings,
  Idea,
  IdeaStage,
  IssueInput,
  StructuredIdea,
} from "./shared";

export type StandaloneIntakeType = "issue" | "idea";

export type StandaloneIdea = {
  id: string | number;
  type: StandaloneIntakeType;
  title: string;
  category: string;
  who: string;
  department: string;
  submitterName: string;
  email: string;
  currentProcess: string;
  problem: string;
  dataUsed: string;
  existingSystemRelation: string;
  ideaProcess: string;
  isNewIdea: "yes" | "no";
  requiredResources: string;
  coordinationNeeded: string;
  expectedEffect: string;
  mvpProposal: string;
  securityNotes: string;
  stage: string;
  targetCount: number;
  createdAt: string;
  comments: Array<{ author: string; time: string; text: string }>;
  history: Array<{ date: string; stage: string; note: string }>;
  apiStage?: IdeaStage;
};

export type StandaloneReviewDraft = {
  type: StandaloneIntakeType;
  title: string;
  category: string;
  who: string;
  department: string;
  submitterName: string;
  email: string;
  problem: string;
  currentProcess: string;
  dataUsed: string;
  existingSystemRelation: string;
  ideaProcess: string;
  isNewIdea: "yes" | "no";
  requiredResources: string;
  coordinationNeeded: string;
  expectedEffect: string;
  mvpProposal: string;
  securityNotes: string;
};

export type StandaloneIntakeForm = {
  type: StandaloneIntakeType;
  department: string;
  submitterName: string;
  email: string;
  work: string;
  who: string;
  currentMethod: string;
  desiredState: string;
  freeText: string;
  currentProcess: string;
  ideaProcess: string;
  isNewIdea: "yes" | "no";
  requiredResources: string;
  coordinationNeeded: string;
};

export type StandaloneState = {
  view: string;
  selectedIdeaId: string | number | null;
  ideas: StandaloneIdea[];
  toast: { message: string } | null;
  intakeForm: StandaloneIntakeForm;
  wizard: {
    questions: string[];
    answers: string[];
    draftAnswer: string;
    thinking: boolean;
    sourceIntake: StandaloneIntakeForm | null;
  };
  reviewDraft: StandaloneReviewDraft | null;
  adminSettings: {
    model: string;
    enabled: boolean;
    monthlyCap: number | string;
    used: number;
    testing: boolean;
    testResult: string | null;
    apiKey: string;
    apiKeySaved: boolean;
    apiKeySavedMsg: boolean;
  };
};

const emptyIntakeDefaults = {
  work: "",
  who: "現場代理人",
  currentMethod: "",
  desiredState: "",
  freeText: "",
  currentProcess: "",
  ideaProcess: "",
  isNewIdea: "yes" as const,
  requiredResources: "",
  coordinationNeeded: "",
};

export function emptyIntakeForm(source: StandaloneIntakeForm): StandaloneIntakeForm {
  return {
    type: "issue",
    department: source.department,
    submitterName: source.submitterName,
    email: source.email,
    ...emptyIntakeDefaults,
  };
}

export function toIssueInput(intake: StandaloneIntakeForm): IssueInput {
  const issueText = normalizeText(intake.freeText);
  const workText = normalizeText(
    [intake.work, issueText ? `困りごとの内容: ${issueText}` : ""]
      .filter(Boolean)
      .join("\n\n"),
  );
  const submitterInfo = [intake.department, intake.submitterName].filter(Boolean).join(" ");
  return {
    workType: workText,
    affectedRole: normalizeText(
      [intake.who, submitterInfo ? `(提出: ${submitterInfo})` : ""].filter(Boolean).join(" "),
    ),
    currentWorkflow: normalizeText(
      [intake.currentMethod, issueText ? `補足: ${issueText}` : ""]
        .filter(Boolean)
        .join("\n\n"),
    ),
    desiredState: normalizeText(intake.desiredState),
    usedData: "",
    relatedSystems: "",
    confidentiality: "unknown",
  };
}

export function validateIssueInput(input: IssueInput): string | null {
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

export function formatQuestion(question: AiQuestion) {
  return `${question.question}\n目的: ${question.purpose}`;
}

export function toAnswerRecord(questionIds: string[], questionTexts: string[], answers: string[]) {
  return answers.reduce<Record<string, string>>((record, answer, index) => {
    const id = questionIds[index] ?? `q-${index + 1}`;
    record[id] = answer || "未回答";
    if (!questionIds[index] && questionTexts[index]) {
      record[`question-${index + 1}`] = questionTexts[index];
    }
    return record;
  }, {});
}

export function buildManualStructuredIdea(input: IssueInput, answers: Record<string, string>): StructuredIdea {
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

export function toReviewDraft(
  structured: StructuredIdea,
  source?: StandaloneIntakeForm,
): StandaloneReviewDraft {
  return {
    type: "issue",
    title: structured.title,
    category: structured.targetBusiness,
    who: structured.targetUsers,
    department: source?.department ?? "",
    submitterName: source?.submitterName ?? "",
    email: source?.email ?? "",
    problem: structured.currentIssue,
    currentProcess: structured.currentWorkflow,
    dataUsed: structured.requiredData.join("、"),
    existingSystemRelation: structured.relatedSystems.join("、"),
    ideaProcess: "",
    isNewIdea: "yes",
    requiredResources: "",
    coordinationNeeded: "",
    expectedEffect: structured.expectedEffects,
    mvpProposal: structured.mvpCandidate,
    securityNotes: structured.securityNotes.join("、"),
  };
}

export function fromReviewDraft(
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

export function splitList(value: string) {
  return value
    .split(/[,、\n]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function mapApiIdeaToStandalone(idea: Idea): StandaloneIdea {
  const stageLabel = toStandaloneStage(idea.stage);
  return {
    id: idea.id,
    type: "issue",
    title: idea.title,
    category: idea.targetBusiness || "未分類",
    who: idea.targetUsers || "未設定",
    department: "",
    submitterName: "",
    email: "",
    currentProcess: idea.currentWorkflow,
    problem: idea.currentIssue,
    dataUsed: idea.requiredData.join("、"),
    existingSystemRelation: idea.relatedSystems.join("、"),
    ideaProcess: "",
    isNewIdea: "yes",
    requiredResources: "",
    coordinationNeeded: "",
    expectedEffect: idea.expectedEffects,
    mvpProposal: idea.mvpCandidate,
    securityNotes: idea.securityNotes.join("、"),
    stage: stageLabel,
    targetCount: Math.max(1, idea.aiUsageCount + idea.securityNotes.length + 8),
    createdAt: idea.createdAt.slice(0, 10),
    comments: [],
    history: [{ date: idea.updatedAt.slice(0, 10), stage: stageLabel, note: "APIデータから表示" }],
    apiStage: idea.stage,
  };
}

export function toStandaloneStage(stage: IdeaStage) {
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

export function toApiStage(stage: string): IdeaStage {
  const stageMap: Record<string, IdeaStage> = {
    企画: "planning",
    MVP: "mvp",
    検証: "verification",
    本番化: "production",
  };
  return stageMap[stage] ?? "planning";
}

export function mapAiSettingsToStandalone(
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

function normalizeText(value: string) {
  return value.trim();
}
