import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  defaultPhaseForStage,
  ideaToValuePhaseCount,
  ideaValuePhaseLabel,
  ideaValuePhases,
} from "../src/lib/shared";

describe("20フェーズ Idea-to-Value（migration 010）", () => {
  it("defines exactly 20 phases with labels and stages", () => {
    assert.equal(ideaToValuePhaseCount, 20);
    assert.equal(ideaValuePhases.length, 20);
    const seen = new Set<number>();
    for (const phase of ideaValuePhases) {
      assert.equal(phase.no >= 1 && phase.no <= 20, true);
      assert.ok(phase.label.length > 0);
      assert.ok(phase.stage.length > 0);
      assert.ok(!seen.has(phase.no), `phase no ${phase.no} duplicated`);
      seen.add(phase.no);
    }
  });

  it("starts at idea intake and ends at knowledge phase", () => {
    assert.equal(ideaValuePhases[0].label, "アイデア受付");
    assert.equal(ideaValuePhases[19].label, "ナレッジ化・継続判断");
    // Gate相関フェーズ
    const gateLabels = ideaValuePhases.filter((p) => p.stage.startsWith("Gate"));
    assert.ok(gateLabels.length >= 4, "Gate連動フェーズが定義されている");
  });

  it("maps legacy stages to expected default phases", () => {
    assert.equal(defaultPhaseForStage("draft"), 1);
    assert.equal(defaultPhaseForStage("submitted"), 4);
    assert.equal(defaultPhaseForStage("planning"), 6);
    assert.equal(defaultPhaseForStage("mvp"), 11);
    assert.equal(defaultPhaseForStage("verification"), 13);
    assert.equal(defaultPhaseForStage("production_candidate"), 15);
    assert.equal(defaultPhaseForStage("production"), 17);
    assert.equal(defaultPhaseForStage("rejected"), null);
    assert.equal(defaultPhaseForStage("archived"), null);
  });

  it("labels phases by number and handles unknown values", () => {
    assert.equal(ideaValuePhaseLabel(1), "アイデア受付");
    assert.equal(ideaValuePhaseLabel(20), "ナレッジ化・継続判断");
    assert.equal(ideaValuePhaseLabel(21), "フェーズ21");
    assert.equal(ideaValuePhaseLabel(null), "未設定");
    assert.equal(ideaValuePhaseLabel(undefined), "未設定");
  });
});
