import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  computeCompositeScore,
  computeScoreGateAlignment,
  gateAuthorityPolicy,
  gateLabels,
  summarizeGateApprovals,
} from "../src/lib/shared";
import type { GateNo, Idea, IdeaGateApproval } from "../src/lib/shared";

const baseIdea: Idea = {
  id: "IDEA-1",
  title: "テスト",
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
  mvpCandidate: "",
  mvpDoneDefinition: "",
  department: "",
  submitterName: "",
  submitterEmail: "",
  coordinationNeeded: "",
  stage: "draft",
  createdBy: "user@example.jp",
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  aiUsageCount: 0,
};

function gateRow(gateNo: GateNo, overrides: Partial<IdeaGateApproval> = {}): IdeaGateApproval[] {
  return gateAuthorityPolicy[gateNo].map((authority, index) => ({
    id: `row-${gateNo}-${authority}`,
    ideaId: "IDEA-1",
    gateNo,
    requiredAuthority: authority,
    status: "pending",
    createdAt: "",
    updatedAt: "",
    approvalSeq: index + 1,
    ...overrides,
  }));
}

describe("複合スコア体系: computeCompositeScore（docs/29 §2.4残）", () => {
  it("5軸すべてを0〜10の範囲で返す", () => {
    const result = computeCompositeScore(baseIdea, summarizeGateApprovals([]));
    assert.equal(result.axes.length, 5);
    for (const axis of result.axes) {
      assert.ok(axis.score >= 0 && axis.score <= 10, `${axis.key} out of range: ${axis.score}`);
    }
    assert.ok(result.total >= 0 && result.total <= 10);
  });

  it("何も材料がない案件はROI軸が0で「ベースライン未登録」を含む", () => {
    const result = computeCompositeScore(baseIdea, summarizeGateApprovals([]));
    const roi = result.axes.find((a) => a.key === "roi");
    assert.equal(roi?.score, 0);
    assert.ok(roi?.reasons.some((r) => r.includes("ベースライン未登録")));
  });

  it("ベースライン工数・コストがあるとROI軸が加点される", () => {
    const result = computeCompositeScore(
      { ...baseIdea, kpiBaselineHours: 40, kpiBaselineCost: 100000 },
      summarizeGateApprovals([]),
    );
    const roi = result.axes.find((a) => a.key === "roi");
    assert.equal(roi?.score, 6);
  });

  it("実装方式候補があるとEngineering軸が加点される", () => {
    const result = computeCompositeScore(
      { ...baseIdea, implementationOptions: ["SaaS活用"] },
      summarizeGateApprovals([]),
    );
    const engineering = result.axes.find((a) => a.key === "engineering");
    assert.equal(engineering?.score, 2);
  });

  it("未解決の確認事項が多いとFeasibility軸が減点される", () => {
    const result = computeCompositeScore(
      { ...baseIdea, openQuestions: ["Q1", "Q2", "Q3"] },
      summarizeGateApprovals([]),
    );
    const feasibility = result.axes.find((a) => a.key === "feasibility");
    assert.equal(feasibility?.score, 3); // 6(初期) - 3(openQuestions) + 0(MVP未定)
  });

  it("Gate承認が進むほどBusiness/Domain/Engineering軸が加点される", () => {
    const approvals = [
      ...gateRow(1, { status: "approved" }),
    ];
    const gateSummaries = summarizeGateApprovals(approvals);
    const result = computeCompositeScore(baseIdea, gateSummaries);
    const business = result.axes.find((a) => a.key === "business");
    assert.ok(business!.score > 0);
    assert.ok(business!.reasons.some((r) => r.includes("承認進捗")));
  });

  it("Gate1でrejectedがあるとBusiness軸のreasonsにrejected表記が入る", () => {
    const approvals = gateRow(1, { status: "rejected" });
    const gateSummaries = summarizeGateApprovals(approvals);
    const result = computeCompositeScore(baseIdea, gateSummaries);
    const business = result.axes.find((a) => a.key === "business");
    assert.ok(business!.reasons.some((r) => r.includes("rejected")));
  });
});

describe("AI推奨順位と人間評価の差異表示: computeScoreGateAlignment（docs/29 §2.4残）", () => {
  it("いずれかのGateがrejectedならrejected_by_gate", () => {
    const gateSummaries = summarizeGateApprovals(gateRow(1, { status: "rejected" }));
    assert.equal(computeScoreGateAlignment(8, gateSummaries), "rejected_by_gate");
  });

  it("Gateが1件もない場合、スコアが高ければai_ahead", () => {
    assert.equal(computeScoreGateAlignment(10, []), "ai_ahead");
  });

  it("スコアが低くGate進捗が高ければgate_ahead", () => {
    const approvals = [1, 2, 3, 4, 5].flatMap((n) => gateRow(n as GateNo, { status: "approved" }));
    const gateSummaries = summarizeGateApprovals(approvals);
    assert.equal(gateSummaries.every((g) => g.status === "approved"), true);
    assert.equal(computeScoreGateAlignment(0, gateSummaries), "gate_ahead");
  });

  it("スコアとGate進捗が概ね一致すればmatched", () => {
    const approvals = gateRow(1, { status: "approved" });
    const gateSummaries = summarizeGateApprovals(approvals);
    // 1/5 Gate承認 = 0.2, スコア比率も概ね同程度に設定
    assert.equal(computeScoreGateAlignment(2, gateSummaries), "matched");
  });

  it("gateLabelsが全Gate番号を網羅している（テストフィクスチャの健全性確認）", () => {
    for (const gateNo of [1, 2, 3, 4, 5] as GateNo[]) {
      assert.ok(gateLabels[gateNo]);
    }
  });
});
