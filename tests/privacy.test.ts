import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { inspectIssueInput, inspectStructuredIdea, maskSensitiveText } from "../src/lib/privacy";
import { structuredIdeaSchema, type StructuredIdea } from "../src/lib/shared";

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

  it("detects labeled names, construction names, customer names, and credentials", () => {
    const findings = inspectIssueInput({
      workType: "工事名: 令和8年度中央橋補修工事 顧客名: 〇〇市",
      affectedRole: "担当者: 山田太郎",
      currentWorkflow: "トークン: dummycredential をExcelに残している",
      desiredState: "安全に共有したい",
      usedData: "",
      relatedSystems: "",
      confidentiality: "none",
    });

    assert.equal(findings.some((finding) => finding.type === "construction_name"), true);
    assert.equal(findings.some((finding) => finding.type === "customer_name"), true);
    assert.equal(findings.some((finding) => finding.type === "person_name"), true);
    assert.equal(findings.some((finding) => finding.type === "credential"), true);
    assert.equal(
      maskSensitiveText("担当者: 山田太郎 / 顧客名: 〇〇市 / 工事名: 中央橋補修工事 / トークン: dummycredential"),
      "[個人名] / [顧客名] / [工事名]/ [認証情報]",
    );
  });

  it("does not flag the structured submitter email as a content leak", () => {
    const idea = structuredIdeaSchema.parse({
      title: "写真整理の改善",
      currentIssue: "写真整理に時間がかかる",
      targetBusiness: "出来形管理",
      targetUsers: "現場代理人",
      currentWorkflow: "手作業",
      improvementIdea: "自動化",
      expectedEffects: "時間削減",
      requiredData: [],
      relatedSystems: [],
      implementationOptions: [],
      securityNotes: [],
      openQuestions: [],
      mvpCandidate: "",
      mvpDoneDefinition: "",
      department: "土木工事部",
      submitterName: "デモ 太郎",
      submitterEmail: "taro@demo.example.com",
      coordinationNeeded: "",
    }) as StructuredIdea;
    assert.deepEqual(inspectStructuredIdea(idea), []);
  });

  it("still detects emails embedded in free-text content", () => {
    const idea = structuredIdeaSchema.parse({
      title: "連絡先が記載された困りごと",
      currentIssue: "連絡先は tanaka@example.jp へお願いします",
      targetBusiness: "連絡",
      targetUsers: "",
      currentWorkflow: "メール",
      improvementIdea: "",
      expectedEffects: "",
      requiredData: [],
      relatedSystems: [],
      implementationOptions: [],
      securityNotes: [],
      openQuestions: [],
      mvpCandidate: "",
      mvpDoneDefinition: "",
    }) as StructuredIdea;
    const findings = inspectStructuredIdea(idea);
    assert.ok(findings.some((finding) => finding.type === "email"));
  });
});
