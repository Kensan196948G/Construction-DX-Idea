import type { IssueInput, PrivacyFinding, StructuredIdea } from "./shared";

const detectors: Array<{
  type: PrivacyFinding["type"];
  label: string;
  severity: PrivacyFinding["severity"];
  pattern: RegExp;
}> = [
  {
    type: "email",
    label: "メールアドレス候補",
    severity: "warning",
    pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
  },
  {
    type: "employee_id",
    label: "社員番号候補",
    severity: "warning",
    pattern: /(?:社員番号|employee|emp)[-_\s:]?[A-Z0-9]{4,12}\b/gi,
  },
  {
    type: "ip_address",
    label: "IPアドレス候補",
    severity: "warning",
    pattern: /\b(?:\d{1,3}\.){3}\d{1,3}\b/g,
  },
  {
    type: "project_number",
    label: "案件番号・工事番号候補",
    severity: "warning",
    pattern: /\b(?:PJ|工事|案件)[-_]?[0-9A-Z]{4,16}\b/gi,
  },
  {
    type: "money",
    label: "契約金額・金額候補",
    severity: "blocker",
    pattern: /(?:契約金額|請負金額|予算|金額).{0,12}(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:円|万円|億円)/g,
  },
  {
    type: "person_name",
    label: "個人名候補",
    severity: "warning",
    pattern: /(?:氏名|名前|担当者|発注者担当|受注者担当)[：:\s]+[^\s,、。]{2,24}/g,
  },
  {
    type: "customer_name",
    label: "顧客名・発注者名候補",
    severity: "warning",
    pattern: /(?:顧客名|発注者名|取引先|お客様)[：:\s]+[^\s,、。]{2,40}/g,
  },
  {
    type: "construction_name",
    label: "工事名候補",
    severity: "warning",
    pattern: /(?:工事名|案件名|現場名)[：:\s]+[^/\n,、。]{2,80}/g,
  },
  {
    type: "credential",
    label: "認証情報候補",
    severity: "blocker",
    pattern: /(?:password|passwd|pwd|token|secret|api[-_ ]?key|パスワード|トークン|シークレット)[：:=\s]+[^\s]{8,}/gi,
  },
];

export function inspectIssueInput(input: IssueInput): PrivacyFinding[] {
  const text = Object.values(input).join("\n");
  const findings: PrivacyFinding[] = [];

  for (const detector of detectors) {
    const matches = text.match(detector.pattern) ?? [];
    for (const match of matches.slice(0, 5)) {
      findings.push({
        type: detector.type,
        label: detector.label,
        severity: detector.severity,
        excerpt: maskSensitiveText(match),
      });
    }
  }

  if (input.confidentiality !== "none") {
    findings.push({
      type: "confidentiality_flag",
      label: "機密情報の可能性",
      severity: input.confidentiality === "unknown" ? "warning" : "blocker",
      excerpt: input.confidentiality === "unknown" ? "不明" : "あり",
    });
  }

  return findings;
}

export function maskSensitiveText(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[メールアドレス]")
    .replace(/(?:社員番号|employee|emp)[-_\s:]?[A-Z0-9]{4,12}\b/gi, "[社員番号]")
    .replace(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g, "[IPアドレス]")
    .replace(/\b(?:PJ|工事|案件)[-_]?[0-9A-Z]{4,16}\b/gi, "[案件番号]")
    .replace(/(?:\d{1,3}(?:,\d{3})+|\d+)\s*(?:円|万円|億円)/g, "[金額]")
    .replace(/(?:氏名|名前|担当者|発注者担当|受注者担当)[：:\s]+[^\s,、。]{2,24}/g, "[個人名]")
    .replace(/(?:顧客名|発注者名|取引先|お客様)[：:\s]+[^\s,、。]{2,40}/g, "[顧客名]")
    .replace(/(?:工事名|案件名|現場名)[：:\s]+[^/\n,、。]{2,80}/g, "[工事名]")
    .replace(
      /(?:password|passwd|pwd|token|secret|api[-_ ]?key|パスワード|トークン|シークレット)[：:=\s]+[^\s]{8,}/gi,
      "[認証情報]",
    );
}

export function inspectStructuredIdea(idea: StructuredIdea): PrivacyFinding[] {
  // Submitter context (department/name/email) is structured, schema-validated
  // identity metadata, not free-text content. Scanning it would block every
  // registration that fills in the intake email field (PRIVACY_BLOCKED),
  // which is not the detectors' purpose: they target sensitive data embedded
  // in business content.
  const {
    department: _department,
    submitterName: _submitterName,
    submitterEmail: _submitterEmail,
    ...contentFields
  } = idea;
  void _department;
  void _submitterName;
  void _submitterEmail;
  const text = JSON.stringify(contentFields);
  return inspectIssueInput({
    workType: text,
    affectedRole: "",
    currentWorkflow: text,
    desiredState: text,
    usedData: "",
    relatedSystems: "",
    confidentiality: "none",
  });
}
