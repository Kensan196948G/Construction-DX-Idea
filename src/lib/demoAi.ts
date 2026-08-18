import type { AiQuestion, IssueInput, StructuredIdea } from "./shared";

/**
 * Deterministic, cost-free demo AI used only by the MVP/Prototype
 * environment (AI_PROVIDER=demo). It produces schema-valid wizard responses
 * without calling any external AI API, so reviewers can exercise the full
 * intake → questions → structure → register flow.
 */

const DEMO_LABEL = "[デモAI]";

export function buildDemoQuestions(input: IssueInput): AiQuestion[] {
  const workflowHint = input.currentWorkflow ? "（現在のやり方に基づく）" : "";
  return [
    {
      id: "q1",
      question: `この困りごとはどの業務に分類されますか${workflowHint}？（例: 出来形管理、日報、安全管理、測量、検査）`,
      purpose: `${DEMO_LABEL} 対象業務の分類を特定する`,
      answerType: "text",
    },
    {
      id: "q2",
      question: "現在の手順のうち、最も時間や手間がかかっている工程はどれですか？",
      purpose: `${DEMO_LABEL} 改善ポイントを絞り込む`,
      answerType: "text",
    },
    {
      id: "q3",
      question: "改善効果を測る指標として何が適切ですか？（例: 作業時間、件数、ミス率、待ち時間）",
      purpose: `${DEMO_LABEL} 効果測定の基準を確認する`,
      answerType: "text",
    },
  ];
}

const businessCategoryHints: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /写真|出来形|黒板|検査写真/, label: "出来形管理" },
  { pattern: /日報|作業実績|勤怠/, label: "日報・作業実績管理" },
  { pattern: /安全|点検|ヒヤリ|危険/, label: "安全管理" },
  { pattern: /測量|座標|出来形計測/, label: "測量・出来形管理" },
  { pattern: /重機|機械|稼働/, label: "機械・重機管理" },
  { pattern: /検査|成果品|提出資料/, label: "検査・成果品管理" },
  { pattern: /資材|材料|検収|納品/, label: "購買・資材管理" },
  { pattern: /工程|天候|天気|中止/, label: "工程管理" },
  { pattern: /品質|記録|帳票/, label: "品質管理" },
  { pattern: /指示|連絡|共有|掲示/, label: "情報共有・連絡" },
];

function splitList(value: string): string[] {
  return value
    .split(/[\n,、;；]/)
    .map((item) => item.trim())
    .filter((item) => item.length > 0 && item.length <= 500)
    .slice(0, 50);
}

function toAnswersText(answers: Record<string, string>): string {
  return Object.values(answers)
    .map((value) => value.trim())
    .filter(Boolean)
    .join("\n");
}

export function buildDemoStructure(
  input: IssueInput,
  answers: Record<string, string>,
): StructuredIdea {
  const combined = `${input.workType}\n${input.currentWorkflow}\n${input.desiredState}\n${toAnswersText(answers)}`;
  const category =
    businessCategoryHints.find((hint) => hint.pattern.test(combined))?.label ??
    "業務改善（未分類）";
  const dataItems = splitList(input.usedData);
  const systemItems = splitList(input.relatedSystems);
  const confidentialityNote =
    input.confidentiality !== "none"
      ? "入力に機密情報の可能性があるため、共有範囲とマスキングを確認すること"
      : "入力に機密情報の明示はないが、公開範囲は最小限にすること";

  return {
    title: input.workType.split(/\n/)[0]?.trim().slice(0, 160) || "（タイトル未設定）",
    currentIssue: input.workType.slice(0, 4000),
    targetBusiness: category,
    targetUsers: input.affectedRole || "現場管理者、関係部門",
    currentWorkflow: input.currentWorkflow.slice(0, 4000),
    improvementIdea: input.desiredState.slice(0, 4000),
    expectedEffects: "作業時間の短縮と手戻り・ミスの削減（具体的な数値は人間が確認のうえ確定）",
    requiredData: dataItems,
    relatedSystems: systemItems,
    implementationOptions: ["Webアプリ／フォームの導入", "既存システムとのデータ連携", "手順の標準化（まず紙運用の改善）"],
    securityNotes: [confidentialityNote],
    openQuestions: [
      "デモAIによる自動構造化のため、対象業務の分類とMVP範囲は人間が確認して確定すること",
    ],
    mvpCandidate: input.desiredState.slice(0, 4000) || "改善したい状態を最小機能で試行する",
    mvpDoneDefinition: "改善効果の指標を定め、試行期間中の計測方法を決める（要人間確認）",
    department: "",
    submitterName: "",
    submitterEmail: "",
    coordinationNeeded: "関係部署との調整要否を人間が確認する",
  };
}
