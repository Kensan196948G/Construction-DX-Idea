import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildManualStructuredIdea,
  fromReviewDraft,
  mapApiIdeaToStandalone,
  splitList,
  toAnswerRecord,
  toApiStage,
  toIssueInput,
  toReviewDraft,
  validateIssueInput,
} from "../src/lib/standaloneBridge";
import type { Idea } from "../src/lib/shared";

describe("standalone WebUI bridge helpers", () => {
  it("keeps the free-text issue body in the API input", () => {
    const input = toIssueInput({
      type: "issue",
      department: "土木工事部",
      submitterName: "山田太郎",
      email: "",
      work: "日報作成",
      who: "主任技術者",
      currentMethod: "紙の日報をExcelへ転記",
      desiredState: "転記をなくしたい",
      freeText: "同じ内容を複数回入力していて月末に残業が増える",
      currentProcess: "",
      ideaProcess: "",
      isNewIdea: "yes",
      requiredResources: "",
      coordinationNeeded: "",
    });

    assert.match(input.workType, /日報作成/);
    assert.match(input.workType, /同じ内容を複数回入力/);
    assert.match(input.currentWorkflow, /紙の日報/);
    assert.match(input.currentWorkflow, /同じ内容を複数回入力/);
    assert.equal(input.confidentiality, "unknown");
    assert.equal(validateIssueInput(input), null);
  });

  it("rejects missing required fields and over-limit fields before API calls", () => {
    assert.match(
      validateIssueInput({
        workType: "",
        affectedRole: "",
        currentWorkflow: "",
        desiredState: "",
        usedData: "",
        relatedSystems: "",
        confidentiality: "unknown",
      }) ?? "",
      /入力してください/,
    );

    assert.match(
      validateIssueInput({
        workType: "a".repeat(2001),
        affectedRole: "",
        currentWorkflow: "現行手順",
        desiredState: "改善したい",
        usedData: "",
        relatedSystems: "",
        confidentiality: "none",
      }) ?? "",
      /2,000文字以内/,
    );
  });

  it("maps AI answers with stable ids and fallback question keys", () => {
    assert.deepEqual(
      toAnswerRecord(["q-frequency"], ["頻度は?", "共有先は?"], ["10", "職長"]),
      {
        "q-frequency": "10",
        "q-2": "職長",
        "question-2": "共有先は?",
      },
    );
  });

  it("round-trips structured draft fields used by the standalone review screen", () => {
    const manual = buildManualStructuredIdea(
      {
        workType: "写真整理",
        affectedRole: "現場代理人",
        currentWorkflow: "写真を手作業で分類",
        desiredState: "自動分類したい",
        usedData: "写真, Excel台帳",
        relatedSystems: "共有フォルダ",
        confidentiality: "none",
      },
      { "q-time": "毎回30分" },
    );
    const draft = toReviewDraft(manual);
    const structured = fromReviewDraft(draft, manual);

    assert.equal(structured.title, manual.title);
    assert.deepEqual(structured.requiredData, ["写真", "Excel台帳"]);
    assert.deepEqual(structured.relatedSystems, ["共有フォルダ"]);
    assert.deepEqual(splitList("写真、Excel\nCSV"), ["写真", "Excel", "CSV"]);
  });

  it("preserves API stage while mapping to the compact standalone stage labels", () => {
    const idea: Idea = {
      id: "IDEA-100",
      title: "下書き案件",
      currentIssue: "課題",
      targetBusiness: "業務",
      targetUsers: "利用者",
      currentWorkflow: "現行",
      improvementIdea: "改善",
      expectedEffects: "効果",
      requiredData: [],
      relatedSystems: [],
      implementationOptions: [],
      securityNotes: [],
      openQuestions: [],
      mvpCandidate: "MVP",
      mvpDoneDefinition: "完了",
      stage: "draft",
      createdBy: "user@example.com",
      createdAt: "2026-07-13T00:00:00.000Z",
      updatedAt: "2026-07-13T01:00:00.000Z",
      aiUsageCount: 0,
    };

    const mapped = mapApiIdeaToStandalone(idea);
    assert.equal(mapped.stage, "企画");
    assert.equal(mapped.apiStage, "draft");
    assert.equal(toApiStage("MVP"), "mvp");
  });
});
