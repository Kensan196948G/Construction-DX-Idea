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

  it("detects and masks employee ids, IP addresses, project numbers, and money", () => {
    const findings = inspectIssueInput({
      workType: "社員番号 AB1234 が 192.168.10.5 から PJ-2026DX99 を扱う",
      affectedRole: "現場代理人",
      currentWorkflow: "契約金額 12,000,000円 の資料を確認している",
      desiredState: "匿名化して相談したい",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
    });

    assert.equal(findings.some((finding) => finding.type === "employee_id"), true);
    assert.equal(findings.some((finding) => finding.type === "ip_address"), true);
    assert.equal(findings.some((finding) => finding.type === "project_number"), true);
    assert.equal(findings.some((finding) => finding.type === "money"), true);
    assert.equal(
      maskSensitiveText("社員番号 AB1234 / 192.168.10.5 / PJ-2026DX99 / 契約金額 12,000,000円"),
      "[社員番号] / [IPアドレス] / [案件番号] / 契約金額 [金額]",
    );
  });
});
