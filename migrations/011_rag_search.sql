-- 011_rag_search.sql
-- RAG基盤: 類似アイデア検索・重複判定（Issue #13 / docs/29_additional_implementation_backlog.md §2.3）。
-- ローカルPostgreSQL の pg_trgm によるテキスト類似検索をコアとする
-- （ベクトル埋め込み = pgvector は将来拡張。外部埋め込みAPI依存を避けるため第一段階は pg_trgm）。
--
-- 変更点:
--   1. pg_trgm 拡張を有効化（冪等。検索に必要）。
--   2. ideas.search_text: 検索対象テキストの小文字連結を保持する STORED 生成列。
--      title / current_issue / target_business / target_users / current_workflow /
--      improvement_idea / expected_effects / mvp_candidate を空白区切りで連結。
--      ※既存行は ALTER 時に自動計算され、以後の UPDATE でも自動維持される。
--   3. idx_ideas_search_text_trgm: search_text に対する GIN (gin_trgm_ops) インデックス。
--      pg_trgm の `%` 演算子（デフォルト閾値 0.3）による候補絞り込みに使用。
--   4. rag_search_logs: RAG検索の履歴（誰が・いつ・何を検索し・何件・上位ヒット）。
--      監査ログ（audit_logs）とは別に「類似検索の利用記録」として保存する。
--
-- Additive migration — safe on live databases。再実行冪等。

create extension if not exists pg_trgm;

alter table ideas add column if not exists search_text text
  generated always as (
    lower(
      coalesce(title, '') || ' ' ||
      coalesce(current_issue, '') || ' ' ||
      coalesce(target_business, '') || ' ' ||
      coalesce(target_users, '') || ' ' ||
      coalesce(current_workflow, '') || ' ' ||
      coalesce(improvement_idea, '') || ' ' ||
      coalesce(expected_effects, '') || ' ' ||
      coalesce(mvp_candidate, '')
    )
  ) stored;

create index if not exists idx_ideas_search_text_trgm
  on ideas using gin (search_text gin_trgm_ops);

create table if not exists rag_search_logs (
  id uuid primary key default gen_random_uuid(),
  query text not null,
  query_type text not null default 'text' check (query_type in ('text', 'idea')),
  source_idea_id uuid,
  result_count integer not null default 0,
  top_idea_ids jsonb not null default '[]',
  created_by text not null,
  created_at timestamptz not null default now()
);

create index if not exists idx_rag_search_logs_created on rag_search_logs(created_at desc);
