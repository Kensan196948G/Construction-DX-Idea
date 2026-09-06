import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, it } from "node:test";
import { workerSecurityTestHooks } from "../worker/index";
import {
  classifyKnowledgeSource,
  computeKnowledgeQualityScore,
  knowledgeCategories,
  knowledgeCategoryLabels,
  type GitHubOverview,
} from "../src/lib/shared";

const { buildEvidenceRowsFromOverview } = workerSecurityTestHooks;

const baseOverview: GitHubOverview = {
  repoFullName: "org/demo-repo",
  defaultBranch: "main",
  stars: 5,
  openIssuesCount: 2,
  pushedAt: "2026-09-05T00:00:00Z",
  archived: false,
  ciStatus: "success",
  ciUrl: "https://github.com/org/demo-repo/actions",
  latestRelease: {
    tagName: "v1.0.0",
    name: "MVP",
    publishedAt: "2026-09-01T00:00:00Z",
    url: "https://github.com/org/demo-repo/releases/tag/v1.0.0",
    prerelease: false,
  },
  openPullRequests: [
    {
      number: 7,
      title: "feat: DX-2026-0001 検収写真チェックのMVP",
      state: "open",
      draft: false,
      url: "https://github.com/org/demo-repo/pull/7",
      caseIdMatched: true,
    },
    {
      number: 8,
      title: "chore: 依存更新",
      state: "open",
      draft: false,
      caseIdMatched: false,
    },
  ],
  openIssues: [
    {
      number: 3,
      title: "DX-2026-0001 検収フローの改善",
      state: "open",
      caseIdMatched: true,
    },
  ],
  fetchedAt: "2026-09-05T03:00:00.000Z",
};

describe("GitHub Engineering 連携: Evidence変換（migration 015・docs/29 §2.12）", () => {
  it("CI・Release・PR・IssueをEvidence行へ変換する", () => {
    const rows = buildEvidenceRowsFromOverview("idea-1", baseOverview);
    const kinds = rows.map((r) => r.kind);
    assert.ok(kinds.includes("ci"));
    assert.ok(kinds.includes("release"));
    assert.ok(kinds.includes("pr"));
    assert.ok(kinds.includes("issue"));
    assert.equal(rows.length, 5); // ci + release + PR2件 + Issue1件
  });

  it("PR/Issueのexternal_idにはRepo名と番号が入る（複数Repoで衝突しない）", () => {
    const rows = buildEvidenceRowsFromOverview("idea-1", baseOverview);
    const pr = rows.find((r) => r.kind === "pr");
    const issue = rows.find((r) => r.kind === "issue");
    assert.equal(pr?.externalId, "pr-org/demo-repo-7");
    assert.equal(issue?.externalId, "issue-org/demo-repo-3");
  });

  it("CIが無い（none）場合・Releaseが無い場合はEvidence行を作らない", () => {
    const rows = buildEvidenceRowsFromOverview("idea-1", {
      ...baseOverview,
      ciStatus: null,
      latestRelease: null,
    });
    assert.deepEqual(rows.map((r) => r.kind).sort(), ["issue", "pr", "pr"]);
  });
});

describe("Knowledge Management: 抽出ルール（migration 016・docs/29 §2.16）", () => {
  it("Gate判定理由系のキーワードを decision に分類する", () => {
    assert.equal(classifyKnowledgeSource("検収写真チェックの導入を決定した。")?.category, "decision");
  });

  it("解決系のキーワードを problem_solution に分類する", () => {
    assert.equal(classifyKnowledgeSource("Excel転記の二重入力を、フォーム自動化で解決した。")?.category, "problem_solution");
  });

  it("教訓系のキーワードを lessons に分類する", () => {
    assert.equal(classifyKnowledgeSource("現場展開前に現場代理人へのヒアリングが必須という教訓を得た。")?.category, "lessons");
  });

  it("手順系は runbook、該当なしは null を返す", () => {
    assert.equal(classifyKnowledgeSource("月次の運用手順をまとめた。")?.category, "runbook");
    assert.equal(classifyKnowledgeSource("特にまとめなし"), null);
    assert.equal(classifyKnowledgeSource(""), null);
  });

  it("knowledgeCategoriesは7カテゴリを定義し、すべてラベルを持つ", () => {
    assert.equal(knowledgeCategories.length, 7);
    for (const category of knowledgeCategories) {
      assert.ok(knowledgeCategoryLabels[category]);
    }
  });
});

describe("Knowledge Management: 品質スコア自動評価（docs/29 §2.16残・migration 018）", () => {
  it("本文が短いほど低いスコアを返す", () => {
    assert.equal(computeKnowledgeQualityScore("", "decision"), 1);
    assert.equal(computeKnowledgeQualityScore("短い所感", "decision"), 1);
  });

  it("本文の長さに応じて段階的にスコアが上がる", () => {
    assert.equal(computeKnowledgeQualityScore("あ".repeat(60), "decision"), 2);
    assert.equal(computeKnowledgeQualityScore("あ".repeat(200), "decision"), 3);
    assert.equal(computeKnowledgeQualityScore("あ".repeat(500), "decision"), 4);
    assert.equal(computeKnowledgeQualityScore("あ".repeat(900), "decision"), 5);
  });

  it("ADR/runbook/best_practiceは構造的価値として+1され、5を上限とする", () => {
    assert.equal(computeKnowledgeQualityScore("あ".repeat(60), "runbook"), 3);
    assert.equal(computeKnowledgeQualityScore("あ".repeat(900), "adr"), 5);
  });
});

describe("GitHub/Knowledge の共有スキーマ・migration", () => {
  it("migration 015が idea_repo_links / idea_github_evidence を含む", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname ?? ".", "../migrations/015_github_integration.sql"),
      "utf8",
    );
    assert.ok(sql.includes("create table if not exists idea_repo_links"));
    assert.ok(sql.includes("create table if not exists idea_github_evidence"));
    assert.ok(sql.includes("unique (idea_id, kind, external_id)"));
  });

  it("migration 016が knowledge_candidates とライフサイクル制約を含む", () => {
    const sql = readFileSync(
      path.resolve(import.meta.dirname ?? ".", "../migrations/016_knowledge_management.sql"),
      "utf8",
    );
    assert.ok(sql.includes("create table if not exists knowledge_candidates"));
    assert.ok(sql.includes("'candidate','approved','rejected','promoted'"));
    assert.ok(sql.includes("unique (source_type, source_idea_id, title)"));
  });
});
