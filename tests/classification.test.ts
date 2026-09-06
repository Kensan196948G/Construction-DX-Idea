import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  canChangeClassification,
  informationClassificationLabel,
  informationClassifications,
  isIdeaVisibleTo,
} from "../src/lib/shared";

describe("情報区分・公開制御（migration 012・docs/29 §2.17）", () => {
  it("defines four classifications and readable labels", () => {
    assert.deepEqual(informationClassifications, ["public", "internal", "confidential", "restricted"]);
    assert.equal(informationClassificationLabel("public"), "公開（Public）");
    assert.equal(informationClassificationLabel("internal"), "社内（Internal）");
    assert.equal(informationClassificationLabel("confidential"), "機密（Confidential）");
    assert.equal(informationClassificationLabel("restricted"), "限定（Restricted）");
    assert.equal(informationClassificationLabel(undefined), "社内（Internal）");
  });

  it("owner can change non-sensitive classifications", () => {
    const result = canChangeClassification({
      current: "internal",
      next: "public",
      isAdmin: false,
      isOwner: true,
    });
    assert.deepEqual(result, { allowed: true });
  });

  it("owner cannot set confidential (admin required)", () => {
    const result = canChangeClassification({
      current: "public",
      next: "confidential",
      isAdmin: false,
      isOwner: true,
    });
    assert.deepEqual(result, { allowed: false, reason: "admin_required" });
  });

  it("owner cannot downgrade from restricted (admin required)", () => {
    const result = canChangeClassification({
      current: "restricted",
      next: "internal",
      isAdmin: false,
      isOwner: true,
    });
    assert.deepEqual(result, { allowed: false, reason: "admin_required" });
  });

  it("admin can change any classification", () => {
    for (const current of informationClassifications) {
      for (const next of informationClassifications) {
        const result = canChangeClassification({ current, next, isAdmin: true, isOwner: false });
        assert.equal(result.allowed, true, `${current} -> ${next}`);
      }
    }
  });

  it("non-owner non-admin is forbidden", () => {
    const result = canChangeClassification({
      current: "public",
      next: "public",
      isAdmin: false,
      isOwner: false,
    });
    assert.deepEqual(result, { allowed: false, reason: "forbidden" });
  });
});

describe("isIdeaVisibleTo（fail-closed可視性判定・PoC/UAT・KPIエンドポイントで共用）", () => {
  it("admin can see every classification", () => {
    for (const classification of informationClassifications) {
      assert.equal(isIdeaVisibleTo({ classification, isAdmin: true, isOwner: false }), true, classification);
    }
  });

  it("owner can see every classification of their own idea", () => {
    for (const classification of informationClassifications) {
      assert.equal(isIdeaVisibleTo({ classification, isAdmin: false, isOwner: true }), true, classification);
    }
  });

  it("non-admin non-owner can see public and internal only", () => {
    assert.equal(isIdeaVisibleTo({ classification: "public", isAdmin: false, isOwner: false }), true);
    assert.equal(isIdeaVisibleTo({ classification: "internal", isAdmin: false, isOwner: false }), true);
    assert.equal(isIdeaVisibleTo({ classification: undefined, isAdmin: false, isOwner: false }), true);
  });

  it("non-admin non-owner cannot see confidential or restricted (regression: restricted was previously not excluded)", () => {
    assert.equal(isIdeaVisibleTo({ classification: "confidential", isAdmin: false, isOwner: false }), false);
    assert.equal(isIdeaVisibleTo({ classification: "restricted", isAdmin: false, isOwner: false }), false);
  });
});
