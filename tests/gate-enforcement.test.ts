import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { workerSecurityTestHooks } from "../worker/index";
import type { GateApprovalRequest, GateDecisionInput, IdeaGateApproval } from "../src/lib/shared";

const { buildGateReminderTargets, formatGateReminderMessage } = workerSecurityTestHooks;

const now = new Date("2026-09-10T03:00:00.000Z");
const DAY_MS = 864e5;

function gateRow(overrides: Record<string, unknown>): Record<string, unknown> {
  return {
    idea_id: "idea-1",
    gate_no: 1,
    required_authority: "business",
    status: "requested",
    requested_at: new Date(now.getTime() - 1 * DAY_MS),
    requested_due_at: null,
    last_reminded_at: null,
    reminder_count: 0,
    escalated_at: null,
    approver_email: "approver@example.com",
    delegate_to: null,
    ...overrides,
  };
}

describe("Gate滞留分析: mapGateOverviewRow 相当の分類（docs/29 §2.7・migration 014）", () => {
  it("期限超過のrequested行を escalate に分類する", () => {
    const row = gateRow({ requested_due_at: new Date(now.getTime() - 1 * DAY_MS) });
    const targets = buildGateReminderTargets([row], now);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].action, "escalate");
  });

  it("期限まで2日以内の行を remind に分類する", () => {
    const row = gateRow({ requested_due_at: new Date(now.getTime() + 1 * DAY_MS) });
    const targets = buildGateReminderTargets([row], now);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].action, "remind");
  });

  it("期限まで3日以上先の行は対象外", () => {
    const row = gateRow({ requested_due_at: new Date(now.getTime() + 3 * DAY_MS) });
    assert.equal(buildGateReminderTargets([row], now).length, 0);
  });

  it("期限未設定の行は滞留7日未満なら対象外・7日以上で escalate", () => {
    const fresh = gateRow({ requested_at: new Date(now.getTime() - 3 * DAY_MS) });
    assert.equal(buildGateReminderTargets([fresh], now).length, 0);
    const stale = gateRow({ requested_at: new Date(now.getTime() - 8 * DAY_MS) });
    const targets = buildGateReminderTargets([stale], now);
    assert.equal(targets.length, 1);
    assert.equal(targets[0].action, "escalate");
  });

  it("requested以外（approved等）の行は対象外", () => {
    const approved = gateRow({
      status: "approved",
      requested_due_at: new Date(now.getTime() - 1 * DAY_MS),
    });
    assert.equal(buildGateReminderTargets([approved], now).length, 0);
  });

  it("エスカレーションとリマインダーのメッセージに案件・Gate・期限を含む", () => {
    const escalate = buildGateReminderTargets(
      [gateRow({ requested_due_at: new Date(now.getTime() - 1 * DAY_MS) })],
      now,
    )[0];
    const message = formatGateReminderMessage(escalate);
    assert.match(message, /エスカレーション/);
    assert.match(message, /Gate1（business）/);
    assert.match(message, /2026-09-09/);

    const remind = buildGateReminderTargets(
      [gateRow({ requested_due_at: new Date(now.getTime() + 1 * DAY_MS) })],
      now,
    )[0];
    assert.match(formatGateReminderMessage(remind), /リマインダー/);
  });

  it("代理承認者を指定するとメッセージに含まれる", () => {
    const remind = buildGateReminderTargets(
      [
        gateRow({
          requested_due_at: new Date(now.getTime() + 1 * DAY_MS),
          delegate_to: "delegate@example.com",
        }),
      ],
      now,
    )[0];
    assert.match(formatGateReminderMessage(remind), /代理承認者: delegate@example.com/);
  });
});

describe("Gate高度化の共有スキーマ（migration 014）", () => {
  it("IdeaGateApprovalは期限・代理・条件・リマインダー列を持つ", () => {
    const row: IdeaGateApproval = {
      id: "g1",
      ideaId: "i1",
      gateNo: 1,
      requiredAuthority: "business",
      status: "requested",
      requestedDueAt: "2026-09-15T00:00:00.000Z",
      delegateTo: "delegate@example.com",
      conditionNote: "XXの修正が完了すること",
      conditionMet: false,
      lastRemindedAt: "2026-09-10T00:00:00.000Z",
      reminderCount: 1,
      escalatedAt: "2026-09-10T00:00:00.000Z",
      createdAt: "",
      updatedAt: "",
    };
    assert.equal(row.conditionMet, false);
    assert.equal(row.reminderCount, 1);
  });

  it("GateApprovalRequestはdueAt/delegateToを、GateDecisionInputはconditionNote/conditionMetを受け付ける", () => {
    const request: GateApprovalRequest = {
      approverEmail: "a@example.com",
      dueAt: "2026-09-15T00:00:00.000Z",
      delegateTo: "d@example.com",
    };
    const decision: GateDecisionInput = {
      decision: "approve",
      reason: "条件付きで承認",
      conditionNote: "テスト完了まで本番化しない",
      conditionMet: false,
    };
    assert.ok(request.dueAt);
    assert.equal(decision.decision, "approve");
  });

  it("migration 014がリマインダー/エスカレーション列を含む（worker/mapGateOverviewRowと対になる）", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname ?? ".", "../migrations/014_gate_enforcement.sql"),
      "utf8",
    );
    for (const column of [
      "requested_due_at",
      "delegate_to",
      "condition_note",
      "condition_met",
      "last_reminded_at",
      "reminder_count",
      "escalated_at",
    ]) {
      assert.ok(sql.includes(column), `migration 014 must include ${column}`);
    }
  });
});
