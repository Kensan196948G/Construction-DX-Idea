import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { kpiOutcomeLabels, kpiOutcomes } from "../src/lib/shared";

describe("KPI・ROI・ポートフォリオ（migration 013・docs/29 §2.5/§2.6）", () => {
  it("defines four KPI outcomes with labels", () => {
    assert.deepEqual(kpiOutcomes, ["pending", "continue", "improve", "stop"]);
    assert.equal(kpiOutcomeLabels.pending, "未判定");
    assert.equal(kpiOutcomeLabels.continue, "継続");
    assert.equal(kpiOutcomeLabels.improve, "改善");
    assert.equal(kpiOutcomeLabels.stop, "停止");
  });

  it("labels every outcome (no missing keys)", () => {
    for (const outcome of kpiOutcomes) {
      assert.ok(kpiOutcomeLabels[outcome].length > 0);
    }
  });
});
