import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  authorities,
  authorityLabels,
  canTransferIdeaOwner,
  gateLabels,
  gateNumbers,
  gateRequiredAuthority,
  issueInputSchema,
  normalizeApiBaseUrl,
  savedFilterInputSchema,
  structuredIdeaSchema,
} from "../src/lib/shared";

describe("Authority (#49)", () => {
  it("defines a label for every authority value", () => {
    for (const value of authorities) {
      assert.equal(typeof authorityLabels[value], "string");
      assert.ok(authorityLabels[value].length > 0);
    }
  });

  it("has exactly the 3 Authority values (business/domain/engineering)", () => {
    assert.deepEqual([...authorities].sort(), ["business", "domain", "engineering"]);
  });
});

describe("Gate approval flow (#50)", () => {
  it("has 5 gates, each with a label and a required Authority", () => {
    assert.deepEqual([...gateNumbers], [1, 2, 3, 4, 5]);
    for (const gateNo of gateNumbers) {
      assert.equal(typeof gateLabels[gateNo], "string");
      assert.ok((authorities as readonly string[]).includes(gateRequiredAuthority[gateNo]));
    }
  });

  it("matches the primary Authority per gate defined in docs/New/ai-dx-dev-process.md #05", () => {
    assert.deepEqual(gateRequiredAuthority, {
      1: "business",
      2: "domain",
      3: "domain",
      4: "business",
      5: "engineering",
    });
  });
});

describe("shared API schemas", () => {
  it("rejects unknown fields in issue input", () => {
    const parsed = issueInputSchema.safeParse({
      workType: "写真整理",
      affectedRole: "現場代理人",
      currentWorkflow: "Excel",
      desiredState: "自動化",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
      unexpected: "must be rejected",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects oversized issue input fields", () => {
    const parsed = issueInputSchema.safeParse({
      workType: "a".repeat(2001),
      affectedRole: "",
      currentWorkflow: "Excel",
      desiredState: "自動化",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
    });

    assert.equal(parsed.success, false);
  });

  it("rejects unknown structured idea fields", () => {
    const parsed = structuredIdeaSchema.safeParse({
      ...validStructuredIdea(),
      extraPromptLeak: "must be rejected",
    });

    assert.equal(parsed.success, false);
  });

  it("limits structured idea array length and item length", () => {
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        requiredData: Array.from({ length: 51 }, (_, index) => `data-${index}`),
      }).success,
      false,
    );
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        requiredData: ["a".repeat(501)],
      }).success,
      false,
    );
  });

  it("accepts and defaults the submitter context fields (#14)", () => {
    const parsed = structuredIdeaSchema.safeParse({
      ...validStructuredIdea(),
      department: "土木工事部",
      submitterName: "山田太郎",
      submitterEmail: "yamada@example.jp",
      coordinationNeeded: "情報システム部との調整が必要",
    });
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.department, "土木工事部");
    assert.equal(parsed.data.submitterName, "山田太郎");
    assert.equal(parsed.data.submitterEmail, "yamada@example.jp");
    assert.equal(parsed.data.coordinationNeeded, "情報システム部との調整が必要");
  });

  it("defaults missing submitter context fields to empty strings (#14)", () => {
    const parsed = structuredIdeaSchema.safeParse(validStructuredIdea());
    assert.equal(parsed.success, true);
    assert.equal(parsed.data.department, "");
    assert.equal(parsed.data.submitterName, "");
    assert.equal(parsed.data.submitterEmail, "");
    assert.equal(parsed.data.coordinationNeeded, "");
  });

  it("rejects oversized submitter context fields (#14)", () => {
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        submitterEmail: "a".repeat(321) + "@example.jp",
      }).success,
      false,
    );
    assert.equal(
      structuredIdeaSchema.safeParse({
        ...validStructuredIdea(),
        department: "a".repeat(201),
      }).success,
      false,
    );
  });
});

function validStructuredIdea() {
  return {
    title: "写真整理の改善",
    currentIssue: "写真整理に時間がかかる",
    targetBusiness: "出来形管理",
    targetUsers: "現場代理人",
    currentWorkflow: "写真をExcel台帳へ手入力",
    improvementIdea: "分類を自動化する",
    expectedEffects: "整理時間削減",
    requiredData: ["写真"],
    relatedSystems: ["共有フォルダ"],
    implementationOptions: ["Web入力"],
    securityNotes: ["個人情報確認"],
    openQuestions: ["対象範囲"],
    mvpCandidate: "1現場で試す",
    mvpDoneDefinition: "1週間運用できる",
  };
}

describe("normalizeApiBaseUrl", () => {
  it("strips a trailing /api segment so request paths do not double the prefix", () => {
    assert.equal(
      normalizeApiBaseUrl("https://dxidea.mirai-dx-platform.com/api"),
      "https://dxidea.mirai-dx-platform.com",
    );
    assert.equal(
      normalizeApiBaseUrl("https://dxidea.mirai-dx-platform.com/api/"),
      "https://dxidea.mirai-dx-platform.com",
    );
    assert.equal(normalizeApiBaseUrl("https://dxidea.mirai-dx-platform.com/API"), "https://dxidea.mirai-dx-platform.com");
  });

  it("keeps an origin-only base and trailing slashes tidy", () => {
    assert.equal(
      normalizeApiBaseUrl("https://dxidea.mirai-dx-platform.com"),
      "https://dxidea.mirai-dx-platform.com",
    );
    assert.equal(
      normalizeApiBaseUrl("https://dxidea.mirai-dx-platform.com/"),
      "https://dxidea.mirai-dx-platform.com",
    );
  });

  it("keeps empty input empty for same-origin relative requests", () => {
    assert.equal(normalizeApiBaseUrl(""), "");
    assert.equal(normalizeApiBaseUrl("  "), "");
    assert.equal(normalizeApiBaseUrl("/api"), "");
  });

  it("does not touch /api appearing mid-path", () => {
    assert.equal(
      normalizeApiBaseUrl("https://example.net/api/v2"),
      "https://example.net/api/v2",
    );
  });
});

describe("Saved Filter / My View（docs/29 §2.23残P2）: savedFilterInputSchema", () => {
  it("accepts a valid issue-list filter with stage and q", () => {
    const parsed = savedFilterInputSchema.parse({
      listType: "issue",
      name: "至急対応",
      params: { stage: "submitted", q: "写真" },
    });
    assert.equal(parsed.listType, "issue");
    assert.equal(parsed.name, "至急対応");
    assert.deepEqual(parsed.params, { stage: "submitted", q: "写真" });
  });

  it("accepts params with neither stage nor q (empty filter)", () => {
    const parsed = savedFilterInputSchema.parse({ listType: "idea", name: "全件", params: {} });
    assert.deepEqual(parsed.params, {});
  });

  it("rejects an empty name", () => {
    assert.throws(() =>
      savedFilterInputSchema.parse({ listType: "idea", name: "", params: {} }),
    );
  });

  it("rejects a name made only of whitespace", () => {
    assert.throws(() =>
      savedFilterInputSchema.parse({ listType: "idea", name: "   ", params: {} }),
    );
  });

  it("rejects an unknown listType", () => {
    assert.throws(() =>
      savedFilterInputSchema.parse({ listType: "gate", name: "x", params: {} }),
    );
  });

  it("rejects a name longer than 100 characters", () => {
    assert.throws(() =>
      savedFilterInputSchema.parse({ listType: "idea", name: "あ".repeat(101), params: {} }),
    );
  });
});

describe("Owner Transfer（担当者引継ぎ・docs/29 §2.25残）: canTransferIdeaOwner", () => {
  it("管理者は自分の案件でなくても引継ぎできる", () => {
    assert.equal(canTransferIdeaOwner({ isAdmin: true, isOwner: false }), true);
  });

  it("提出者本人は引継ぎできる", () => {
    assert.equal(canTransferIdeaOwner({ isAdmin: false, isOwner: true }), true);
  });

  it("提出者でも管理者でもない場合は拒否される", () => {
    assert.equal(canTransferIdeaOwner({ isAdmin: false, isOwner: false }), false);
  });

  it("管理者かつ提出者本人でも許可される", () => {
    assert.equal(canTransferIdeaOwner({ isAdmin: true, isOwner: true }), true);
  });
});
