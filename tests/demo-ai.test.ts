import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { buildDemoQuestions, buildDemoStructure } from "../src/lib/demoAi";
import {
  issueInputSchema,
  structuredIdeaSchema,
} from "../src/lib/shared";

const input = issueInputSchema.parse({
  workType: "出来形写真の整理に時間がかかっている",
  affectedRole: "現場代理人",
  currentWorkflow: "カメラで撮影してPCでフォルダ整理し、Excel帳票へ手入力",
  desiredState: "撮影後に自動でタグ付けして帳票まで自動化したい",
  usedData: "撮影写真, 黒板情報, 撮影日時",
  relatedSystems: "Excel検査帳票\n既存ファイルサーバー",
  confidentiality: "possible",
});

describe("demo AI provider", () => {
  it("returns three schema-valid, clearly-labelled questions", () => {
    const questions = buildDemoQuestions(input);
    assert.equal(questions.length, 3);
    for (const question of questions) {
      assert.match(question.id, /^q\d+$/);
      assert.ok(question.question.length > 0);
      assert.ok(question.purpose.startsWith("[デモAI]"));
      assert.ok(["text", "number", "choice"].includes(question.answerType));
    }
  });

  it("is deterministic for the same input", () => {
    assert.deepEqual(buildDemoQuestions(input), buildDemoQuestions(input));
    assert.deepEqual(
      buildDemoStructure(input, { q1: "出来形管理", q2: "写真整理", q3: "作業時間" }),
      buildDemoStructure(input, { q1: "出来形管理", q2: "写真整理", q3: "作業時間" }),
    );
  });

  it("produces a StructuredIdea that passes the shared schema", () => {
    const structured = buildDemoStructure(input, {
      q1: "出来形管理",
      q2: "写真の選別",
      q3: "整理時間",
    });
    const parsed = structuredIdeaSchema.safeParse(structured);
    assert.equal(parsed.success, true);
    assert.equal(structured.targetBusiness, "出来形管理");
    assert.deepEqual(structured.requiredData, ["撮影写真", "黒板情報", "撮影日時"]);
    assert.deepEqual(structured.relatedSystems, ["Excel検査帳票", "既存ファイルサーバー"]);
    assert.ok(structured.securityNotes.some((note) => note.includes("機密情報")));
  });

  it("falls back to a generic category for unknown business types", () => {
    const structured = buildDemoStructure(
      issueInputSchema.parse({
        workType: "とある作業が大変",
        affectedRole: "",
        currentWorkflow: "手作業",
        desiredState: "楽にしたい",
        usedData: "",
        relatedSystems: "",
        confidentiality: "none",
      }),
      {},
    );
    assert.equal(structured.targetBusiness, "業務改善（未分類）");
    assert.ok(structured.openQuestions.length > 0);
  });
});
