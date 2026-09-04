import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorities,
  defaultGateApprovalRows,
  evaluateGateSoD,
  gateAuthorityPolicy,
  gateLabels,
  gateNumbers,
  gateRequiredAuthority,
  summarizeGateApprovals,
  type Authority,
  type IdeaGateApproval,
} from "../src/lib/shared";

function approval(partial: Partial<IdeaGateApproval> & { gateNo: 1 | 2 | 3 | 4 | 5 }): IdeaGateApproval {
  return {
    id: "g1",
    ideaId: "idea-1",
    requiredAuthority: "business",
    status: "pending",
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...partial,
  };
}

describe("Gate Policy Engine v2: 複数Authorityポリシー (#57)", () => {
  it("has 5 gates each with a non-empty required Authority policy", () => {
    assert.deepEqual([...gateNumbers], [1, 2, 3, 4, 5]);
    for (const gateNo of gateNumbers) {
      assert.ok(gateAuthorityPolicy[gateNo].length >= 1, `Gate${gateNo} policy is empty`);
      for (const authority of gateAuthorityPolicy[gateNo]) {
        assert.ok((authorities as readonly string[]).includes(authority));
      }
      assert.equal(typeof gateLabels[gateNo], "string");
    }
  });

  it("keeps the primary Authority (008 gateRequiredAuthority) as policy head", () => {
    for (const gateNo of gateNumbers) {
      assert.equal(
        gateAuthorityPolicy[gateNo][0],
        gateRequiredAuthority[gateNo],
        `Gate${gateNo} の主承認Authorityが policy 先頭と一致する必要がある`,
      );
    }
  });

  it("defaults to the doc #05 authority involvement per gate", () => {
    assert.deepEqual([...gateAuthorityPolicy[1]], ["business", "domain", "engineering"]);
    assert.deepEqual([...gateAuthorityPolicy[2]], ["domain", "engineering"]);
    assert.deepEqual([...gateAuthorityPolicy[3]], ["domain", "engineering", "business"]);
    assert.deepEqual([...gateAuthorityPolicy[4]], ["business", "domain"]);
    assert.deepEqual([...gateAuthorityPolicy[5]], ["engineering"]);
  });

  it("generates one pending row per gate × required authority", () => {
    const rows = defaultGateApprovalRows("idea-1");
    const expectedCount = gateNumbers.reduce((sum, g) => sum + gateAuthorityPolicy[g].length, 0);
    assert.equal(rows.length, expectedCount);
    const keyed = new Set(rows.map((r) => `${r.gateNo}:${r.requiredAuthority}`));
    assert.equal(keyed.size, rows.length, "no duplicate (gateNo, authority)");
    for (const row of rows) {
      assert.equal(row.ideaId, "idea-1");
      assert.equal(row.status, "pending");
    }
  });
});

describe("summarizeGateApprovals: Gate単位の集約", () => {
  it("treats a gate as approved only when ALL required Authorities approved", () => {
    // Gate1 = business + domain + engineering（主+共同）
    const approvals: IdeaGateApproval[] = [
      approval({ gateNo: 1, requiredAuthority: "business", status: "approved" }),
      approval({ gateNo: 1, requiredAuthority: "domain", status: "approved" }),
      // engineering 未承認 -> Gate1 は approved にならない
      approval({ gateNo: 1, requiredAuthority: "engineering", status: "requested" }),
    ];
    const summary = summarizeGateApprovals(approvals).find((s) => s.gateNo === 1)!;
    assert.equal(summary.status, "requested");
  });

  it("approves Gate1 only after all three authorities approve", () => {
    const approvals: IdeaGateApproval[] = ["business", "domain", "engineering"].map((authority) =>
      approval({ gateNo: 1, requiredAuthority: authority as Authority, status: "approved" }),
    );
    const summary = summarizeGateApprovals(approvals).find((s) => s.gateNo === 1)!;
    assert.equal(summary.status, "approved");
    assert.equal(summary.approvals.length, 3);
  });

  it("reflects rejected / returned / requested / pending precedence", () => {
    // rejected が1つでもあれば Gate 全体は rejected
    const rejected = summarizeGateApprovals([
      approval({ gateNo: 2, requiredAuthority: "domain", status: "approved" }),
      approval({ gateNo: 2, requiredAuthority: "engineering", status: "rejected" }),
    ]).find((s) => s.gateNo === 2)!;
    assert.equal(rejected.status, "rejected");

    const returned = summarizeGateApprovals([
      approval({ gateNo: 3, requiredAuthority: "domain", status: "returned" }),
      approval({ gateNo: 3, requiredAuthority: "engineering", status: "requested" }),
      approval({ gateNo: 3, requiredAuthority: "business", status: "pending" }),
    ]).find((s) => s.gateNo === 3)!;
    assert.equal(returned.status, "returned");

    const pending = summarizeGateApprovals([
      approval({ gateNo: 4, requiredAuthority: "domain", status: "pending" }),
      approval({ gateNo: 4, requiredAuthority: "business", status: "pending" }),
    ]).find((s) => s.gateNo === 4)!;
    assert.equal(pending.status, "pending");
  });

  it("treats a missing required authority row as pending (backward compat)", () => {
    // 008形式の旧データ: Gate1 に business（主）行のみ存在
    const oldStyle: IdeaGateApproval[] = [
      approval({ gateNo: 1, requiredAuthority: "business", status: "approved" }),
    ];
    const summary = summarizeGateApprovals(oldStyle).find((s) => s.gateNo === 1)!;
    assert.equal(summary.status, "pending", "domain/engineering 行が無い場合は pending 扱いで未通過");
    assert.equal(summary.approvals.length, 3);
  });

  it("reports all five gate summaries even with partial rows", () => {
    const summaries = summarizeGateApprovals([]);
    assert.equal(summaries.length, 5);
    for (const s of summaries) assert.equal(s.status, "pending");
  });
});

describe("evaluateGateSoD: 自己承認・SoD防止 (#06)", () => {
  const base = {
    ideaCreator: "proposer@example.co.jp",
    requester: "requester@example.co.jp",
    requiredAuthority: "business" as Authority,
  };

  it("rejects requester == approver (自己承認)", () => {
    const msg = evaluateGateSoD({
      ...base,
      approverEmail: "requester@example.co.jp",
    });
    assert.ok(msg, "申請者=承認者 は違反");
    assert.match(msg!, /申請者自身/);
  });

  it("rejects idea creator as approver (提案者≠承認者)", () => {
    const msg = evaluateGateSoD({
      ...base,
      approverEmail: "proposer@example.co.jp",
    });
    assert.ok(msg);
  });

  it("rejects idea creator as decider even when admin", () => {
    const msg = evaluateGateSoD({
      ...base,
      requester: "",
      actor: "proposer@example.co.jp",
      actorAuthority: "business",
      isAdmin: true,
    });
    assert.ok(msg, "管理者でも提案者本人の判定は禁止");
  });

  it("allows an independent admin decider (上位Gate Owner相当のオーバーライド)", () => {
    const msg = evaluateGateSoD({
      ...base,
      requester: "proposer@example.co.jp",
      actor: "it-admin@example.co.jp",
      actorAuthority: "engineering",
      requiredAuthority: "business",
      isAdmin: true,
    });
    assert.equal(msg, null);
  });

  it("rejects non-admin decider without the required Authority", () => {
    const msg = evaluateGateSoD({
      ...base,
      actor: "domain-user@example.co.jp",
      actorAuthority: "domain",
      requiredAuthority: "engineering",
      isAdmin: false,
    });
    assert.ok(msg);
    assert.match(msg!, /engineering Authority が必要/);
  });

  it("allows non-admin decider holding the required Authority", () => {
    const msg = evaluateGateSoD({
      ...base,
      requester: "proposer@example.co.jp",
      actor: "biz-user@example.co.jp",
      actorAuthority: "business",
      requiredAuthority: "business",
      isAdmin: false,
    });
    assert.equal(msg, null);
  });

  it("is case-insensitive for emails", () => {
    const msg = evaluateGateSoD({
      ...base,
      approverEmail: "REQUESTER@example.co.jp",
    });
    assert.ok(msg);
  });
});
