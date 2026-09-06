import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  buildGate3Brief,
  summarizeUatFeedback,
  type GateSummary,
  type Idea,
  type PocPlan,
} from "../src/lib/shared";

function baseIdea(): Pick<Idea, "id" | "caseId" | "title" | "department" | "submitterName"> {
  return {
    id: "idea-1",
    caseId: "DX-2026-0001",
    title: "出来形写真の自動分類",
    department: "土木工事部",
    submitterName: "山田太郎",
  };
}

function basePocPlan(overrides: Partial<PocPlan> = {}): PocPlan {
  return {
    ideaId: "idea-1",
    hypothesis: "写真の自動分類で確認時間を50%削減できる",
    successCriteria: "1現場で1週間試用し、確認時間が半減すること",
    mvpScopeIn: ["写真アップロード", "自動分類"],
    mvpScopeOut: ["帳票出力"],
    testUsers: "現場代理人3名",
    testScenarios: ["撮影→アップロード→分類確認"],
    uatChecklist: [
      { item: "3秒以内に分類完了", done: true },
      { item: "分類精度90%以上", done: false },
    ],
    acceptanceResult: "pending",
    acceptanceNotes: "",
    updatedBy: "yamada@example.jp",
    createdAt: "2026-09-01T00:00:00.000Z",
    updatedAt: "2026-09-01T00:00:00.000Z",
    ...overrides,
  };
}

function gate3Summary(overrides: Partial<GateSummary> = {}): GateSummary {
  return {
    gateNo: 3,
    label: "Gate3 MVP承認",
    requiredAuthorities: ["domain", "engineering", "business"],
    status: "requested",
    approvals: [],
    ...overrides,
  };
}

describe("Gate3資料自動生成（docs/29 §2.19残）", () => {
  it("counts UAT checklist completion and includes it in the brief", () => {
    const brief = buildGate3Brief({
      idea: baseIdea(),
      pocPlan: basePocPlan(),
      feedbackSummary: summarizeUatFeedback([]),
      gate3: gate3Summary(),
      generatedAt: "2026-09-06T00:00:00.000Z",
    });
    assert.equal(brief.uatChecklistDoneCount, 1);
    assert.equal(brief.uatChecklistTotalCount, 2);
    assert.equal(brief.ideaId, "idea-1");
    assert.equal(brief.caseId, "DX-2026-0001");
    assert.equal(brief.gate3?.gateNo, 3);
    assert.equal(brief.generatedAt, "2026-09-06T00:00:00.000Z");
  });

  it("recommends the manual acceptance result when it is already decided", () => {
    const brief = buildGate3Brief({
      idea: baseIdea(),
      pocPlan: basePocPlan({ acceptanceResult: "conditional_go" }),
      feedbackSummary: summarizeUatFeedback([
        { rating: 5, feedbackType: "general" },
        { rating: 3, feedbackType: "defect" },
      ]),
      gate3: null,
    });
    assert.match(brief.recommendation, /条件付きGo/);
    assert.match(brief.recommendation, /不具合1件/);
  });

  it("falls back to the feedback-derived verdict when acceptance is still pending", () => {
    const brief = buildGate3Brief({
      idea: baseIdea(),
      pocPlan: basePocPlan({ acceptanceResult: "pending" }),
      feedbackSummary: summarizeUatFeedback([
        { rating: 5, feedbackType: "general" },
        { rating: 4, feedbackType: "improvement" },
      ]),
      gate3: null,
    });
    assert.match(brief.recommendation, /「Go」を推奨/);
    assert.match(brief.recommendation, /人間の最終判定を記録/);
  });

  it("notes when no UAT feedback has been submitted yet", () => {
    const brief = buildGate3Brief({
      idea: baseIdea(),
      pocPlan: basePocPlan({ uatChecklist: [] }),
      feedbackSummary: summarizeUatFeedback([]),
      gate3: null,
    });
    assert.match(brief.recommendation, /まだ投稿されていません/);
    assert.equal(brief.uatChecklistTotalCount, 0);
  });
});
