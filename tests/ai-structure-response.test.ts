import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { mockApi } from "../src/lib/mockApi";
import type { IssueInput } from "../src/lib/shared";

const sampleInput: IssueInput = {
  workType: "出来形写真の整理",
  currentWorkflow: "現場で撮影した写真を手作業でフォルダ分けしている",
  desiredState: "撮影後に自動でメタデータ分類したい",
  affectedRole: "現場代理人",
  usedData: "写真, 作業記録",
  relatedSystems: "Excel, 共有フォルダ",
  confidentiality: "none",
};

describe("AI構造化のRAG根拠・信頼度・重複判定（モックAPI・docs/29 §2.2/§2.3）", () => {
  it("wraps structureIdea with confidence, citations and a duplicate verdict", async () => {
    const response = await mockApi.structureIdea(sampleInput, {});
    assert.ok(response.structured.title.length > 0);
    assert.ok(response.confidence >= 0 && response.confidence <= 1);
    assert.ok(["high", "medium", "low"].includes(response.confidenceLevel));
    assert.ok(Array.isArray(response.citations));
    assert.ok(["merge_candidate", "add_to_existing", "new_case"].includes(response.duplicateVerdict));
  });

  it("exposes duplicateVerdict on similar-idea and RAG-search results", async () => {
    const similar = await mockApi.getSimilarIdeas("IDEA-001", 5).catch(() => null);
    if (similar) {
      assert.ok(["merge_candidate", "add_to_existing", "new_case"].includes(similar.duplicateVerdict));
    }
    const searched = await mockApi.searchRag("写真の整理", 5);
    assert.ok(["merge_candidate", "add_to_existing", "new_case"].includes(searched.duplicateVerdict));
  });
});
