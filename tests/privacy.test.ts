import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectIssueInput, maskSensitiveText } from "../src/lib/privacy";

describe("privacy inspection", () => {
  it("detects and masks email addresses", () => {
    const findings = inspectIssueInput({
      workType: "日報を test@example.com に送っている",
      affectedRole: "現場代理人",
      currentWorkflow: "Excel",
      desiredState: "自動化",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
    });

    assert.equal(findings.some((finding) => finding.type === "email"), true);
    assert.equal(maskSensitiveText("test@example.com"), "[メールアドレス]");
  });

  it("raises a blocker for confidentiality flag", () => {
    const findings = inspectIssueInput({
      workType: "写真管理",
      affectedRole: "",
      currentWorkflow: "紙",
      desiredState: "検索したい",
      usedData: "",
      relatedSystems: "",
      confidentiality: "possible",
    });

    assert.equal(findings.some((finding) => finding.severity === "blocker"), true);
  });
});
