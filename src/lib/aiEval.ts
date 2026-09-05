// AI品質Eval（Issue #13・docs/29 §2.14「AI品質Eval」）
// Golden Dataset 方式: 代表的な困りごと入力に対して、AI（質問生成・構造化）の
// 出力を「スキーマ適合」「PII非含有」「分類の妥当性」「必須フィールド充足」の
// 観点で機械検証し、スコア化する。デモAI（demoAi.ts）では決定的に回帰検証でき、
// 実AI（Claude/DeepSeek）でも同じ eval を実行できる（worker /api/admin/ai-eval）。
// 人間承認・誤判定時の責任分界は運用フロー（Gate・SoD）側で担保する。

import type { IssueInput, StructuredIdea } from "./shared";
import { issueInputSchema, structuredIdeaSchema } from "./shared";
import { inspectStructuredIdea, maskSensitiveText } from "./privacy";

/** Golden Dataset の1ケース。 */
export type AiEvalCase = {
  id: string;
  label: string;
  input: IssueInput;
  answers: Record<string, string>;
  /** 期待する業務分類キーワード（targetBusiness がいずれか1語を含めば合格。空なら判定しない） */
  expectBusinessHint?: readonly string[];
  /** このケースが機密情報を含む想定か（securityNotes に言及があるべき） */
  expectConfidential?: boolean;
};

export const aiEvalCases: readonly AiEvalCase[] = [
  {
    id: "photo-survey",
    label: "出来形写真の整理（写真・出来形管理）",
    input: {
      workType: "出来形写真の整理に時間がかかっている",
      affectedRole: "現場代理人",
      currentWorkflow: "カメラで撮影し、PCで工種別フォルダへ手動整理、Excel帳票へ転記している",
      desiredState: "撮影後に自動でタグ付けし、帳票まで自動化したい",
      usedData: "撮影写真, 黒板情報, 撮影日時",
      relatedSystems: "Excel検査帳票, ファイルサーバー",
      confidentiality: "possible",
    },
    answers: { q1: "出来形管理", q2: "写真の選別と転記", q3: "整理時間" },
    expectBusinessHint: ["出来形"],
    expectConfidential: true,
  },
  {
    id: "survey-data",
    label: "測量データの取り込み（測量・出来形管理）",
    input: {
      workType: "測量データのPC取り込みと差分計算が手作業",
      affectedRole: "測量担当",
      currentWorkflow: "測量機器のデータをPCへ移し、Excelで設計値と差分を計算している",
      desiredState: "測量データを自動取り込みし、出来形管理と連動させたい",
      usedData: "測量データ, 設計値",
      relatedSystems: "Excel, 測量ソフト",
      confidentiality: "none",
    },
    answers: { q1: "測量・出来形管理", q2: "データの移し替え", q3: "計算時間" },
    // 測量データ連携は出来形管理と隣接するため「測量」または「出来形」の
    // いずれかに分類されれば合格とする（デモAIは出来形優先で判定）。
    expectBusinessHint: ["測量", "出来形"],
  },
  {
    id: "daily-report",
    label: "日報の二重入力（日報・作業実績管理）",
    input: {
      workType: "日報の二重入力をなくしたい",
      affectedRole: "事務担当",
      currentWorkflow: "紙の日報を回収し、Excelへ転記してから社内システムへ再度入力している",
      desiredState: "スマートフォン入力から集計まで自動化したい",
      usedData: "作業内容, 人数, 機械, 安全指示",
      relatedSystems: "Excel, 社内システム",
      confidentiality: "none",
    },
    answers: { q1: "日報", q2: "Excel転記", q3: "転記時間" },
    expectBusinessHint: ["日報"],
  },
  {
    id: "safety-walk",
    label: "安全パトロール記録（安全管理）",
    input: {
      workType: "安全パトロールの指摘事項が現場ごとにバラバラで共有されない",
      affectedRole: "安全管理員",
      currentWorkflow: "紙のチェックリストに記入し、指摘の記録を添付して後日集計している",
      desiredState: "指摘事項を現場で記録し、是正状況まで追跡できるようにしたい",
      usedData: "チェックリスト, 指摘記録",
      relatedSystems: "紙帳票",
      confidentiality: "none",
    },
    answers: { q1: "安全管理", q2: "記録の集計", q3: "是正までの日数" },
    expectBusinessHint: ["安全"],
  },
  {
    id: "schedule-risk",
    label: "工程と天候リスク（工程管理）",
    input: {
      workType: "天候リスクを工程表へ反映するのが手作業",
      affectedRole: "工事主任",
      currentWorkflow: "天気予報を見て、中止判断を工程表と照らして毎回判断している",
      desiredState: "天候リスクを工程表と連動させて中止判断を支援したい",
      usedData: "工程表, 天気予報",
      relatedSystems: "工程表ソフト",
      confidentiality: "none",
    },
    answers: { q1: "工程管理", q2: "中止判断", q3: "判断ミス" },
    expectBusinessHint: ["工程"],
  },
];

/** 単一ケースの評価結果。 */
export type AiEvalCaseResult = {
  caseId: string;
  label: string;
  ok: boolean;
  checks: {
    questionsSchemaValid: boolean;
    questionsCount: boolean;
    structureSchemaValid: boolean;
    structureNoPii: boolean;
    businessClassified: boolean;
    structureComplete: boolean;
  };
  /** 不合格だった検査名（ok=false のとき説明に使う） */
  failures: string[];
};

/** Eval全体のサマリ。 */
export type AiEvalSummary = {
  totalCases: number;
  passedCases: number;
  passRate: number; // 0..1
  results: AiEvalCaseResult[];
  executedWith: string; // demo | claude | deepseek など
  checkedAt: string;
};

/** AIプロバイダ実装の受け口（worker が注入する）。テストでは demoAi を使う。 */
export type AiEvalRunner = {
  providerLabel: string;
  generateQuestions: (input: IssueInput) => Promise<unknown>;
  structureIdea: (input: IssueInput, answers: Record<string, string>) => Promise<StructuredIdea>;
};

function questionListValid(parsed: unknown): boolean {
  if (!Array.isArray(parsed)) return false;
  if (parsed.length !== 3) return false;
  return parsed.every(
    (question) =>
      question &&
      typeof question === "object" &&
      typeof (question as { id?: unknown }).id === "string" &&
      typeof (question as { question?: unknown }).question === "string" &&
      typeof (question as { purpose?: unknown }).purpose === "string",
  );
}

// 構造化結果の必須フィールド充足チェック（title/currentIssue/targetBusiness/
// improvementIdea/expectedEffects が空でないか）。未分類・空欄は品質低下として検出する。
function structureCompleteEnough(idea: StructuredIdea): boolean {
  return Boolean(
    idea.title.trim() &&
      idea.currentIssue.trim() &&
      idea.targetBusiness.trim() &&
      idea.improvementIdea.trim() &&
      idea.expectedEffects.trim(),
  );
}

/**
 * 1ケースを評価する。generateQuestions/structureIdea は渡された runner に委譲し、
 * 出力は zod スキーマ（質問は形式チェック、構造化は structuredIdeaSchema）で検証する。
 */
export async function evaluateAiCase(
    runner: Pick<AiEvalRunner, "generateQuestions" | "structureIdea">,
    testCase: AiEvalCase,
  ): Promise<AiEvalCaseResult> {
    const checks = {
      questionsSchemaValid: false,
      questionsCount: false,
      structureSchemaValid: false,
      structureNoPii: false,
      businessClassified: false,
      structureComplete: false,
    };
    const failures: string[] = [];

    try {
      const rawQuestions = await runner.generateQuestions(testCase.input);
      checks.questionsSchemaValid = questionListValid(rawQuestions);
      checks.questionsCount =
        Array.isArray(rawQuestions) && rawQuestions.length === 3;
      if (!checks.questionsSchemaValid) failures.push("questionsSchemaValid");
      if (!checks.questionsCount) failures.push("questionsCount");
    } catch {
      checks.questionsSchemaValid = false;
      checks.questionsCount = false;
      failures.push("questionsSchemaValid");
      failures.push("questionsCount");
    }

    try {
      const structured = await runner.structureIdea(testCase.input, testCase.answers);
      checks.structureSchemaValid = structuredIdeaSchema.safeParse(structured).success;
      checks.structureNoPii = inspectStructuredIdea(structured).length === 0;
      checks.businessClassified =
        !testCase.expectBusinessHint ||
        testCase.expectBusinessHint.some((hint) => structured.targetBusiness.includes(hint));
      checks.structureComplete = structureCompleteEnough(structured);
      if (!checks.structureSchemaValid) failures.push("structureSchemaValid");
      if (!checks.structureNoPii) failures.push("structureNoPii");
      if (!checks.businessClassified) failures.push("businessClassified");
      if (!checks.structureComplete) failures.push("structureComplete");
    } catch {
      checks.structureSchemaValid = false;
      checks.structureNoPii = false;
      checks.businessClassified = false;
      checks.structureComplete = false;
      failures.push("structureSchemaValid", "structureNoPii", "businessClassified", "structureComplete");
    }

    const ok = failures.length === 0;
    return { caseId: testCase.id, label: testCase.label, ok, checks, failures };
  }

/**
 * Golden Dataset 全体を評価しサマリを返す。
 */
export async function runAiEval(
  runner: AiEvalRunner,
  cases: readonly AiEvalCase[] = aiEvalCases,
): Promise<AiEvalSummary> {
  const results: AiEvalCaseResult[] = [];
  for (const testCase of cases) {
    results.push(await evaluateAiCase(runner, testCase));
  }
  const passedCases = results.filter((result) => result.ok).length;
  return {
    totalCases: results.length,
    passedCases,
    passRate: results.length === 0 ? 0 : passedCases / results.length,
    results,
    executedWith: runner.providerLabel,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * eval ケースの入力が共有スキーマ（issueInputSchema）を満たすことを回帰検証する
 * （Golden Dataset 自体の品質保証）。
 */
export function validateEvalCaseInputs(cases: readonly AiEvalCase[] = aiEvalCases): string[] {
  const invalid: string[] = [];
  for (const testCase of cases) {
    const parsed = issueInputSchema.safeParse(testCase.input);
    if (!parsed.success) {
      invalid.push(`${testCase.id}: input schema invalid`);
    }
    // マスキングが空文字へ落とさないこと（AIへ送る前にマスクされる想定の構造）
    const masked = maskSensitiveText(JSON.stringify(testCase.input));
    if (masked.length === 0) {
      invalid.push(`${testCase.id}: masking erased everything`);
    }
  }
  return invalid;
}
