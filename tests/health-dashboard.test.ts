import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { computeHealthSummary, type HealthDashboard } from "../src/lib/shared";

function baseDashboard(overrides: Partial<HealthDashboard> = {}): HealthDashboard {
  return {
    generatedAt: "2026-09-06T00:00:00.000Z",
    ai: { callsToday: 3, failuresToday: 0, monthlyCostEstimate: 0.12 },
    notificationOutbox: { pendingCount: 0, failedCount24h: 0 },
    auditChain: { valid: true, checked: 10, legacyRows: 0 },
    gate: { overdueCount: 0 },
    ...overrides,
  };
}

describe("System Health Dashboard: computeHealthSummary（docs/29 §2.21）", () => {
  it("returns overall ok when every section is healthy", () => {
    const summary = computeHealthSummary(baseDashboard());
    assert.equal(summary.overall, "ok");
    assert.ok(summary.sections.every((s) => s.status === "ok"));
  });

  it("marks an invalid audit chain as critical and overall critical", () => {
    const summary = computeHealthSummary(
      baseDashboard({ auditChain: { valid: false, checked: 10, legacyRows: 0, firstBrokenId: "log-5" } }),
    );
    const auditSection = summary.sections.find((s) => s.key === "auditChain");
    assert.equal(auditSection?.status, "critical");
    assert.match(auditSection?.label ?? "", /log-5/);
    assert.equal(summary.overall, "critical");
  });

  it("marks AI failures as warning without escalating to critical", () => {
    const summary = computeHealthSummary(baseDashboard({ ai: { callsToday: 5, failuresToday: 2, monthlyCostEstimate: 0.2 } }));
    const aiSection = summary.sections.find((s) => s.key === "ai");
    assert.equal(aiSection?.status, "warning");
    assert.equal(summary.overall, "warning");
  });

  it("marks failed outbox notifications and overdue gates as warning", () => {
    const summary = computeHealthSummary(
      baseDashboard({
        notificationOutbox: { pendingCount: 1, failedCount24h: 3 },
        gate: { overdueCount: 2 },
      }),
    );
    assert.equal(summary.sections.find((s) => s.key === "notificationOutbox")?.status, "warning");
    assert.equal(summary.sections.find((s) => s.key === "gate")?.status, "warning");
    assert.equal(summary.overall, "warning");
  });

  it("critical takes precedence over warning when both are present", () => {
    const summary = computeHealthSummary(
      baseDashboard({
        auditChain: { valid: false, checked: 10, legacyRows: 0 },
        ai: { callsToday: 5, failuresToday: 1, monthlyCostEstimate: 0.2 },
      }),
    );
    assert.equal(summary.overall, "critical");
  });
});
