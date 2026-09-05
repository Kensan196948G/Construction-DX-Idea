-- 015_github_integration.sql
-- GitHub Engineering 連携（docs/29 §2.12 / 元カタログ#270〜291）。
-- 案件（DX-YYYY-NNNN）とGitHub Repoを紐付け、Issue/PR/CI/Releaseの状態を
-- Evidence として案件画面へ統合するためのスキーマ。
--
-- 変更点:
--   1. idea_repo_links: 案件とRepoの紐付け（1案件に複数Repo可）。
--   2. idea_github_evidence: GitHub上の活動（Issue/PR/CI/Release/Commit）を
--      Evidence（証跡）として案件に紐付けて収集する。/github/sync の都度 upsert。
--
-- Additive migration — safe on live databases。再実行冪等。

create table if not exists idea_repo_links (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  repo_full_name text not null,
  default_branch text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, repo_full_name)
);

create index if not exists idx_idea_repo_links_idea
  on idea_repo_links(idea_id);

create table if not exists idea_github_evidence (
  id uuid primary key default gen_random_uuid(),
  idea_id uuid not null references ideas(id) on delete cascade,
  -- 種別: pr / issue / release / commit / ci
  kind text not null check (kind in ('pr','issue','release','commit','ci')),
  -- GitHub上の識別子（PR番号・Issue番号・Releaseタグ・commit sha等）
  external_id text not null,
  title text not null default '',
  url text,
  -- 状態（open/closed/merged/success/failure/published 等・GitHubの生の状態）
  status text,
  occurred_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (idea_id, kind, external_id)
);

create index if not exists idx_idea_github_evidence_idea
  on idea_github_evidence(idea_id, kind);
