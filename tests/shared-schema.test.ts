import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { issueInputSchema, structuredIdeaSchema } from "../src/lib/shared";

describe("shared API schemas", () => {
  it("rejects unknown fields in issue input", () => {
    const parsed = issueInputSchema.safeParse({
      workType: "写真整理",
      affectedRole: "現場代理人",
      currentWorkflow: "Excel",
      desiredState: "自動化",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
      unexpected: "must be rejected",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects oversized issue input fields", () => {
    const parsed = issueInputSchema.safeParse({
      workType: "a".repeat(2001),
      affectedRole: "",
      currentWorkflow: "Excel",
      desiredState: "自動化",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects unknown structured idea fields", () => {
    const parsed = structuredIdeaSchema.safeParse({
      ...validStructuredIdea(),
      extraPromptLeak: "must be rejected",
    });

    assert.equal(parsed.success, false);
  });

  it("limits structured idea array length and item length", () => {
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        requiredData: Array.from({ length: 51 }, (_, index) => `data-${index}`),
      }).success,
      false,
    );
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        requiredData: ["a".repeat(501)],
      }).success,
      false,
    );
  });
});

function validStructuredIdea() {
  return {
    title: "写真整理の改善",
    currentIssue: "写真整理に時間がかかる",
    targetBusiness: "出来形管理",
    targetUsers: "現場代理人",
    currentWorkflow: "写真をExcel台帳へ手入力",
    improvementIdea: "分類を自動化する",
    expectedEffects: "整理時間削減",
    requiredData: ["写真"],
    relatedSystems: ["共有フォルダ"],
    implementationOptions: ["Web入力"],
    securityNotes: ["個人情報確認"],
    openQuestions: ["対象範囲"],
    mvpCandidate: "1現場で試す",
    mvpDoneDefinition: "1週間運用できる",
  };
}
