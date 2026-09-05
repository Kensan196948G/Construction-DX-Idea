import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { workerSecurityTestHooks } from "../worker/index";
import { ragMinSimilarity, ragSimilarityLevel } from "../src/lib/shared";

const { buildIdeaQueryText, normalizeRagQuery } = workerSecurityTestHooks;

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
