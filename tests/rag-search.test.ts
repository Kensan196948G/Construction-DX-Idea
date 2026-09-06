import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workerSecurityTestHooks } from "../worker/index";
import {
  buildStructuredQueryText,
  computeStructureConfidence,
  duplicateVerdictLabel,
  ragMinSimilarity,
  ragOverallVerdict,
  ragSimilarityLevel,
  type StructuredIdea,
} from "../src/lib/shared";

const { buildIdeaQueryText, normalizeRagQuery } = workerSecurityTestHooks;

function baseStructured(overrides: Partial<StructuredIdea> = {}): StructuredIdea {
  return {
    title: "出来形写真の整理",
    currentIssue: "写真の振り分けに時間がかかる",
    targetBusiness: "出来形管理",
    targetUsers: "現場代理人",
    currentWorkflow: "手作業でフォルダ分け",
    improvementIdea: "メタデータで自動分類",
    expectedEffects: "時間削減",
    requiredData: ["写真"],
    relatedSystems: ["Excel"],
    implementationOptions: ["WebUI"],
    securityNotes: [],
    openQuestions: [],
    mvpCandidate: "1現場で試行",
    mvpDoneDefinition: "100枚を自動分類",
    department: "土木工事部",
    submitterName: "山田",
    submitterEmail: "yamada@example.jp",
    coordinationNeeded: "",
    ...overrides,
  };
}

describe("RAG 類似アイデア検索（migration 011・Issue #13）", () => {
  it("defines a positive minimum similarity threshold", () => {
    assert.ok(ragMinSimilarity > 0 && ragMinSimilarity < 1);
  });

  it("classifies similarity into high/medium/low levels", () => {
    assert.equal(ragSimilarityLevel(0.9), "high");
    assert.equal(ragSimilarityLevel(0.5), "high");
    assert.equal(ragSimilarityLevel(0.49), "medium");
    assert.equal(ragSimilarityLevel(0.25), "medium");
    assert.equal(ragSimilarityLevel(0.24), "low");
    assert.equal(ragSimilarityLevel(ragMinSimilarity), "low");
  });

  it("normalizes rag query strings", () => {
    assert.equal(normalizeRagQuery("  写真の整理  "), "写真の整理");
    assert.equal(normalizeRagQuery(""), "");
    assert.equal(normalizeRagQuery(undefined), "");
    assert.equal(normalizeRagQuery(null), "");
    const long = "あ".repeat(600);
    assert.equal(normalizeRagQuery(long).length, 500);
  });

  it("builds idea query text from meaningful fields only", () => {
    const text = buildIdeaQueryText({
      id: "idea-1",
      title: "出来形写真の整理",
      currentIssue: "写真の振り分けに時間がかかる",
      targetBusiness: "出来形管理",
      targetUsers: "現場代理人",
      currentWorkflow: "手作業でフォルダ分け",
      improvementIdea: "メタデータで自動分類",
      expectedEffects: "時間削減",
      requiredData: ["写真"],
      relatedSystems: ["Excel"],
      implementationOptions: ["WebUI"],
      securityNotes: [],
      openQuestions: [],
      mvpCandidate: "1現場で試行",
      mvpDoneDefinition: "100枚を自動分類",
      department: "土木工事部",
      submitterName: "山田",
      submitterEmail: "yamada@example.jp",
      coordinationNeeded: "",
      stage: "mvp",
      createdBy: "yamada@example.jp",
      createdAt: "2026-09-01T00:00:00.000Z",
      updatedAt: "2026-09-01T00:00:00.000Z",
      aiUsageCount: 0,
    });
    assert.ok(text.includes("出来形写真の整理"));
    assert.ok(text.includes("写真の振り分けに時間がかかる"));
    // 空白のみのフィールドやPII（メール）は検索テキストに含めない
    assert.ok(!text.includes("yamada@example.jp"));
  });
});

describe("重複判定・AI根拠/信頼度（docs/29 §2.2/§2.3・元#45〜65）", () => {
  it("classifies the overall duplicate verdict from the best similarity", () => {
    assert.equal(ragOverallVerdict([{ similarity: 0.9 }, { similarity: 0.1 }]), "merge_candidate");
    assert.equal(ragOverallVerdict([{ similarity: 0.3 }]), "add_to_existing");
    assert.equal(ragOverallVerdict([{ similarity: 0.1 }]), "new_case");
    assert.equal(ragOverallVerdict([]), "new_case");
  });

  it("labels each duplicate verdict in Japanese", () => {
    assert.equal(duplicateVerdictLabel("merge_candidate"), "統合候補（既存案件と高い類似性）");
    assert.equal(duplicateVerdictLabel("add_to_existing"), "既存案件へ追加を検討");
    assert.equal(duplicateVerdictLabel("new_case"), "新規案件として進行可");
  });

  it("scores structure confidence as high when core fields are filled and no open questions remain", () => {
    const result = computeStructureConfidence(baseStructured());
    assert.equal(result.confidence, 1);
    assert.equal(result.confidenceLevel, "high");
  });

  it("lowers confidence when core fields are missing or open questions remain", () => {
    const result = computeStructureConfidence(
      baseStructured({ mvpDoneDefinition: "", openQuestions: ["対象範囲", "予算", "期間"] }),
    );
    assert.ok(result.confidence < 1);
    assert.ok(result.confidence >= 0);
    assert.notEqual(result.confidenceLevel, "high");
  });

  it("never returns a negative confidence even with many open questions", () => {
    const result = computeStructureConfidence(
      baseStructured({
        title: "",
        currentIssue: "",
        targetBusiness: "",
        targetUsers: "",
        currentWorkflow: "",
        improvementIdea: "",
        expectedEffects: "",
        mvpCandidate: "",
        mvpDoneDefinition: "",
        openQuestions: Array.from({ length: 20 }, (_, i) => `q${i}`),
      }),
    );
    assert.equal(result.confidence, 0);
    assert.equal(result.confidenceLevel, "low");
  });

  it("builds the RAG query text from structured idea fields only", () => {
    const text = buildStructuredQueryText(baseStructured());
    assert.ok(text.includes("出来形写真の整理"));
    assert.ok(!text.includes("yamada@example.jp"));
  });
});
