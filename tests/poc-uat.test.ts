import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  pocAcceptanceResultLabels,
  summarizeUatFeedback,
  uatFeedbackTypeLabels,
} from "../src/lib/shared";

describe("PoC・MVP・UAT管理（docs/29 §2.19・migration 017）", () => {
  it("labels every acceptance result and feedback type in Japanese", () => {
    assert.equal(pocAcceptanceResultLabels.pending, "未判定");
    assert.equal(pocAcceptanceResultLabels.go, "Go");
    assert.equal(pocAcceptanceResultLabels.conditional_go, "条件付きGo");
    assert.equal(pocAcceptanceResultLabels.no_go, "No-Go");
    assert.equal(uatFeedbackTypeLabels.general, "所感");
    assert.equal(uatFeedbackTypeLabels.defect, "不具合");
    assert.equal(uatFeedbackTypeLabels.improvement, "改善要望");
  });

  it("proposes pending with no feedback", () => {
    const summary = summarizeUatFeedback([]);
    assert.equal(summary.count, 0);
    assert.equal(summary.averageRating, null);
    assert.equal(summary.recommendedVerdict, "pending");
  });

  it("proposes go when average rating is high and there are no defects", () => {
    const summary = summarizeUatFeedback([
      { rating: 5, feedbackType: "general" },
      { rating: 4, feedbackType: "improvement" },
    ]);
    assert.equal(summary.averageRating, 4.5);
    assert.equal(summary.defectCount, 0);
    assert.equal(summary.recommendedVerdict, "go");
  });

  it("proposes conditional_go when rating is decent but a defect was reported", () => {
    const summary = summarizeUatFeedback([
      { rating: 5, feedbackType: "general" },
      { rating: 4, feedbackType: "improvement" },
      { rating: 3, feedbackType: "defect" },
    ]);
    assert.equal(summary.defectCount, 1);
    assert.equal(summary.recommendedVerdict, "conditional_go");
  });

  it("proposes no_go when average rating is low or multiple defects were reported", () => {
    const lowRating = summarizeUatFeedback([{ rating: 2, feedbackType: "general" }]);
    assert.equal(lowRating.recommendedVerdict, "no_go");

    const manyDefects = summarizeUatFeedback([
      { rating: 4, feedbackType: "defect" },
      { rating: 4, feedbackType: "defect" },
    ]);
    assert.equal(manyDefects.recommendedVerdict, "no_go");
  });
});
