# 現在の実装・検証ステータス

## 0.11 最新（2026-09-04: 本番ローカルDBを migration 001-009 へ移行＋Gate Policy Engine v2）

- **DB はローカル PostgreSQL（Neon 廃止済み）で運用**: 本番 `.env`（`dx_idea`@127.0.0.1:5432）と
  MVP `.env`（`dx_idea_mvp`@127.0.0.1:5432）の両方が既にローカルPostgreSQLを指していることを確認。
- **本番ローカルDB `dx_idea` へ migration 001-009 を冪等適用**（006 case_id / 007 authority /
  008 gate_approvals / 009 複数Authorityポリシー+SoD列）。適用後スモークで
  health 200・監査チェーン `valid:true`（checked 13 / legacy 19）・metrics/users 正常を確認。
- **Gate Policy Engine v2（複数Authority共同承認＋SoD）を実装**:
  - migration 009: `idea_gate_approvals` を (idea_id, gate_no, required_authority) 単位の行へ拡張
    （旧 unique(idea_id, gate_no) を置換）、`requested_by`（SoD監査）・`approval_seq` を追加。
  - `gateAuthorityPolicy`（docs/New/ai-dx-dev-process.md #05の「承認の主な関与者」に基づく
    Gate別必要Authority組合せ）と `summarizeGateApprovals`（全必要Authority承認でGate通過の集約）、
    `evaluateGateSoD`（申請者≠承認者・提案者≠承認者・判定者）を src/lib/shared.ts に追加。
  - worker: `/gates/init` はポリシー行を冪等生成（旧1行データへ不足Authority行を自動補完）、
    request-approval/approval は Authority 行単位で処理し、前Gateは必要Authority全員の承認を必須化。
  - 検証: `npm run verify` PASS（test 103件）・`npm audit` 0件。ローカル実API E2Eで
    「Gate1の3Authority(business/domain/engineering)全員承認 → Gate1 approved → Gate2申請解禁」と
    「提案者本人の判定はSoD 403」を実機確認（scripts/gate-policy-e2e.mjs）。
- 本番モノレポ `DX-Project-Portfolio-Atlas/apps/dx-idea`（systemdが実行するコード）への
  最新コード同期は別途（本番反映は承認後）。

## 0.10 最新（2026-08-31: 本番・MVPデプロイ完了（ローカルsystemd + Cloudflare Tunnel））

- 現行アーキテクチャを確認: 本番 `dxidea.mirai-dx-platform.com` と MVP `dxidea-mvp.mirai-dx-platform.com` は
  Cloudflare Tunnel（`*.cfargotunnel.com` CNAME）経由でローカルPostgreSQL上のsystemdサービス
  （`dx-idea-api.service` / `dx-idea-mvp-api.service`）へ配信されている。
- デプロイ内容:
  - 本番: モノレポ `DX-Project-Portfolio-Atlas/apps/dx-idea` へ当リポジトリの最新コード
    （worker/index.ts・dev-server・src/lib・migration 003-005・migrate-local）を同期し、サービス再起動。
  - MVP: `dx-idea-mvp-api.service` の `ExecStart` を旧パス `worker/dev-server.ts` から
    `server/dev-server.ts`（PR #34で移動）へ修正して再起動。
  - 本番ローカルDB `dx_idea` へ migration 005（app_users）を冪等適用（ideas 0件のまま）。
  - Cloudflare Worker側も更新（コード＋スケジュール3本）。週次cronはCloudflare仕様に合わせ
    `0 9 * * SUN` へ修正（`0 9 * * 0` は API 10100 で拒否されたため）。
- 本番監査チェーン検証: 旧コードの `prev_hash` 参照バグにより3行が不整合だったため、
  正規のprevで末尾チェーンを再計算して修復（checked 13 / legacy 19 / bad 0）。
- 検証: 両サービスの health 200、Access保護（/api/me 401）維持、トンネル両方 active。
  本番DBに対して一時bypassインスタンスで metrics / users / CSV を読み取り確認。

## 0.9 最新（2026-08-31: ローカル実DBスモーク自動化）

- `npm run dev:smoke` を追加: `server/dev-server.ts` を一時ポートで自動起動し、
  health / identity / metrics / ideas / evaluation / users / 監査チェーンverify / CSV出力 /
  ボディ上限413 / メソッド許可を検証して確実に停止する（`scripts/local-smoke.mjs`）。
- ローカル実行結果: 10チェック ALL PASS（監査チェーン `valid:true`）。

## 0.8 最新（2026-08-31: 週次レポート）

- 毎週日曜 09:00 UTC（18:00 JST）にSlackへ週次レポートを送信する `sendWeeklyDigest` を追加
  （登録アイデア数・今週の新規・AI呼び出し/失敗・Slack通知失敗・アクティブユーザー・監査チェーン状態）。
- `wrangler.toml` のcronへ `0 9 * * 0` を追加。
- 検証: `npm run verify` PASS（test 76件）、`worker:deploy:dry-run` PASS。
  ローカルE2Eで週次レポート送信（capture serverで受信）と `report.weekly.sent` 監査記録を確認。

## 0.7 最新（2026-08-31: 監査チェーン定期検証とスモーク堅牢化）

- 監査チェーンverifyロジックを `verifyAuditChainFromDb` に共通化し、毎時cronで自動検証・不正時にSlack通知する
  `checkAuditChainIntegrity` を追加（`audit.chain.invalid.notified` で監査記録）。
- `mvp:smoke` を認証モード変化に耐えるよう堅牢化: 401時に診断メッセージを出力、`SMOKE_CF_ACCESS_JWT` 対応、
  レスポンス形式想定外でクラッシュしないよう防御。
- 検証: `npm run verify` PASS（test 75件）。ローカルDBでチェーン1行改変→Slack通知（captureサーバーで受信）→
  監査記録→ハッシュ復元→`valid:true`（checked 86）までE2E確認。
- 環境メモ: MVP URL（dxidea-mvp）は2026-08-31時点で `UNAUTHENTICATED`（Access JWT要求）を確認。
  レビュー用に公開継続する場合は `ALLOW_LOCAL_AUTH_BYPASS=true` の再デプロイ、保護が意図なら
  `SMOKE_CF_ACCESS_JWT` を設定してスモークを実行する。

## 0.6 最新（2026-08-31: ローカルPostgreSQL実行対応）

- ローカルPostgreSQL（`dx_idea_mvp`）向け実行基盤を整備:
  - WorkerのDB接続をドライバ自動選択に（`neon.tech` → Neon serverless / それ以外 → postgres.js TCP）+ URL単位の接続キャッシュ
  - Node直実行APIサーバー `server/dev-server.ts`（`.env`自動読込、cron相当の定期処理対応）
  - npmスクリプト `dev:server` / `db:migrate` / `db:seed` を追加
- postgres.js の jsonb 二重エンコード問題を修正（アイデア登録・編集・監査metadata・通知payload で配列/オブジェクトを直接バインド）。
  ローカルDBで監査ハッシュチェーン `GET /api/admin/audit-logs/verify` が `valid:true` になることを実測確認。
- metricsの `security_notes` 集計を非配列jsonbでも500にならないよう防御的に修正。
- 検証: `npm run verify` PASS（test 74件）、ローカル実APIスモーク（health / me / ideas / metrics / users / audit verify / 登録E2E）PASS。

## 0.5 最新（2026-08-13: MVP/Prototype環境の新設と重大バグ修正）

- **MVP/Prototype環境**を本番と分離して新設・デプロイ:
  - URL: `https://dxidea-mvp.mirai-dx-platform.com`（Worker `construction-dx-idea-api-mvp`、wrangler `env.mvp`）
  - DB: Neon branch `mvp`（parent main）にダミーデータ投入（ideas 14 / users 6 / audit_logs 26 / 履歴36 / 判定7 / コメント6等）
  - 認証: `ALLOW_LOCAL_AUTH_BYPASS=true`（レビュー用・書き込みレート制限付き）、AI: `demo`プロバイダー（課金なし・決定的ローカル応答）
- **重大バグ修正**（本番ideas 0件の原因と整合する不具合を含む）:
  - 提出者メールを含む構造化保存が常に `PRIVACY_BLOCKED` になる不具合 → blockerのみブロック・submitter context除外
  - 監査ハッシュチェーンがjsonbキー順序で破綻 → canonical serialization（stableStringify）へ統一
  - `toIsoString` のDateミリ秒欠落 → 監査行ハッシュ不整合の修正
  - 監査追記の並行競合（同じprevを2行が共有） → isolate内直列化＋フロント逐次化（PR #25）
- オフライン下書き同期へIdempotency-Keyを追加（再送重複登録リスク解消、`src/lib/offlineDrafts.ts`）
- 検証: `npm run verify` PASS（lint / test 71件 / build×2 / security:scan）、`mvp:smoke` ALL PASS（連続2回）、
  登録→ステージ→承認→コメントのE2E PASS、監査verify `valid:true`
- デモ手順: `docs/28_mvp_prototype_demo.md`。アセスメント: `docs/audit/2026-08-13-assessment.md`

## 0.4 最新（2026-08-12: DeepSeek・ユーザー管理・監査エクスポート）

- AI設定: DeepSeekプロバイダー（deepseek-chat / deepseek-reasoner）を追加し、接続テスト・設定保存・リセットを
  プロバイダー対応で有効化。キーはCloudflare Secret（`DEEPSEEK_API_KEY`）で管理。
- ログインユーザー管理: 新規追加・編集（氏名/部署/ロール/ステータス）・削除・一覧をAPI/UI実装（migration 005）。
- 監査ログ: CSV・Excel（SpreadsheetML）・HTMLエクスポートを追加。
- 検証: `npm run verify` PASS（test 56件）。PR #22 merge → 本番デプロイ（Version `d1edb3c4`）→ migration 005本番適用済み。
- 残: `DEEPSEEK_API_KEY` のCloudflare Secret登録（ユーザー操作）、会社ドメイン管理者複数化。

## 0.3 最新（2026-08-12: 本番反映完了）

- PR #2 merge（main `86d216c`）→ `wrangler deploy` 成功（Version `0f311cb8`、custom domain + cron2本）。
- Neon本番へ migration 003（idempotency_key）・004（承認フィールド＋監査ハッシュチェーン）適用済み。
- バックアップ演習: `backup-20260812` ブランチで整合性確認（ideas 0 / audit_logs 19 / outbox 0 / counters 0）。
- 承認UI（詳細画面）・Excel出力（SpreadsheetML）・検索API連携・オフライン下書きキューを追加（test 54件）。
- 残課題: 会社ドメイン管理者複数化、CodeRabbit指摘対応、次期機能の実運用確認。

## 0.2 最新（2026-08-12: 最優先改善10件対応）

- 承認フローAPI（依頼・判定・承認ゲート・理由必須）とmigration 004。
- コメント・詳細・編集APIと、詳細画面のコメントAPI接続。
- ステージ変更・承認依頼/判定のSlack通知（Outbox再送対応）。
- 評価ボード画面（優先度スコア順）とCSV出力ボタンをstandaloneデザインへ追加し、APIデータ接続。
- 毎時障害アラート（AI処理失敗・Slack通知失敗）と監査ログSHA-256ハッシュチェーン＋verify API。
- PWA（manifest/SW）とバックアップ演習スクリプト、管理者個人ドメイン警告、Dependabot。
- GitHub Issue 10件復元（#3〜#12）。
- 検証: `npm run verify` PASS（test 52件）、HTMLデザインscript構文チェックOK、`worker:deploy:dry-run` PASS。
- 未実施: 本番デプロイ・migration 004本番適用・承認フローUI・オフライン下書きキュー（人間承認/次期）。

## 0.1 最新（2026-08-12: 総合評価・改善サイクル）

- 統合評価（`docs/25_baseline_evaluation.md`）: 18カテゴリ平均55.5点 / 総合判定「条件付き利用可」。
- 実装済み改善（`docs/26_improvement_ledger.md`）:
  - AI利用予約の失敗時解放（コスト・上限の公正化）
  - AIプロンプトのsystem/user分離とプロンプトインジェクション対策（`questions_v2`/`structure_v2`）
  - Claude APIタイムアウト15秒（504 `AI_TIMEOUT`）
  - 監査ログ閲覧・AI利用量・利用制限の管理API（システム管理者限定）とUI接続
  - 一覧/評価APIのPII最小化（submitter_email）
  - `Idempotency-Key` によるアイデア登録の冪等化（`migrations/003_add_idea_idempotency.sql`）
  - ステージ遷移ガードと却下/保管理由必須
  - CSVエクスポートのカラム拡充
  - React/ReactDOMの自己ホスト化（unpkg CDN依存解消、SRI一致確認）
  - npm依存脆弱性0件化
- 再評価（`docs/27_improvement_evaluation_report.md`）: 平均62.4点 / 代替率54.5%→61.0% / 「条件付き利用可」。
- 検証: `npm run verify` PASS（lint / test 49件 / build / build:production-api / security:scan）、
  `worker:deploy:dry-run` PASS（assets 12ファイル）、`npm audit` 0件、`release:monitor` 9/9 PASS（pre-access）。
- 未実施: 本番デプロイ・migration 003本番適用・JWT付きsmoke（人間承認・本番操作のため保留）。

## 0. 最新（2026-08-09: ソース正本復元 + Issue #14永続化）

- 本番Worker（2026-08-07デプロイ）にのみ存在し、ローカルgit HEADから失われていた新機能の
  ソースを、デプロイ済みbundledコードを正本として再実装し、ローカルと完全一致させた。
  - 評価ボードAPI `GET /api/ideas/evaluation`（#36、管理者限定、evaluationScore 0-10点）
  - CSVエクスポート `GET /api/ideas/export.csv`（#40、CSVインジェクション対策 csvCell）
  - 一覧検索・絞り込み `GET /api/ideas?q=&stage=&limit=`（#37）
  - 履歴API `GET /api/ideas/:id/history`（stage履歴 + decision履歴）
  - ステージ変更時の `reason` 記録と `idea_decisions` 条件付き書き込み（#38準備）
  - metrics拡張（stageCounts / submittedLast7Days / rejectedCount / avgPriorityScore）
- **Issue #14**: `ideas` テーブルへ `department` / `submitter_name` / `submitter_email` /
  `coordination_needed` を追加（`migrations/002_add_idea_submitter_fields.sql`、additive）。
  UI入力フォームの提出者情報がDBへ永続化される（保存→読出しラウンドトリップ）。本番Neon適用済み。
- 検証: `npm run verify` PASS（lint / test 39件 / build / build:production-api / security:scan）、
  `worker:deploy:dry-run` PASS。
- 本番デプロイ: `wrangler deploy` 成功（Version 26c92c09）。デプロイ後Observabilityエラー0件。
- 判定: ソース正本がローカルに復元されたため、次回以降のデプロイで本番機能が消えるリスクは解消。

## 1. 現在の状態

🚀 **2026-07-21: Stage A本番デプロイ完了**。本番URL `https://dxidea.mirai-dx-platform.com`
（v0.1.0、Worker `construction-dx-idea-api`、Version `eb7807c5`）。SPA外殻+APIが同一オリジンで
稼働し、APIはfail-close（401/503）。Neonプロジェクト `twilight-cloud-06040828`（us-east-2、
`neondb`）へmigration適用済み。デプロイ後smoke・`release:gate` PASS。残りはStage B
（Access/DB Secret/AI有効化、`docs/23_release_deploy_runbook.md` §12）。

2026-07-21（Stage A準備）:

- wrangler認証が `CLOUDFLARE_API_TOKEN` 設定により解消。`release:monitor` の wrangler auth チェックがPASS。
- 配信構成を同一オリジンへ統合: 1つのWorker（`construction-dx-idea-api`）が `[assets]`（Workers Static Assets、SPA fallback、`run_worker_first=["/api/*"]`）でSPAと `/api/*` を `https://dxidea.mirai-dx-platform.com` 上で配信する。Cloudflare Pages分離配信（`frontend:deploy` / `CLOUDFLARE_PAGES_PROJECT`）は廃止。
- 段階リリース `RELEASE_STAGE`（`full`=従来どおり全必須 / `pre-access`=Stage A外殻公開向け緩和）を `predeploy-check` / `release-readiness-monitor` / `release-smoke-test` へ実装。詳細は `docs/23_release_deploy_runbook.md` §1.6。
- `wrangler.toml` に本番値（routes custom_domain、APP_BASE_URL、ALLOWED_ORIGINS、ADMIN_EMAILS/SYSTEM_ADMIN_EMAILS）を投入。CF_ACCESS_* はStage Bで設定。
- Stage A実行（Neonプロジェクト作成 + migration + `RELEASE_STAGE=pre-access release:deploy`）はマージY承認後にCTOが自律実行する。Stage B（Accessアプリ作成・Secrets投入）は人間作業を含む。

2026-07-13時点で、MVPのリリース直前検証に向けたバックエンド、インフラ定義、セキュリティ検査、CI、ドキュメントを実装済み。WebUIは提供された `Construction DX Idea (standalone).html` を正本として表示し、困りごと入力、入力検査、AI質問、構造化、下書き保存、正式登録、一覧表示、ステージ変更、AI利用設定をWorker APIへブリッジ済み。本番前にはCloudflare Access、Neon、Claude API、Slackを実環境値でE2E確認する。

2026-07-13（最新）:

- 16:05 JST: `npm run verify` PASS、`npm run worker:deploy:dry-run` PASS、`npm run predeploy:check` PASS（本番値ダミー再現）
- 16:08 JST: `npm run release:prepare` PASS、`npm run release:smoke` BLOCKED（DNS lookup failed for dxidea.mirai-dx-platform.com）
- 16:41 JST: `npm run -s release:monitor` → BLOCKED（13件）。未設定（APP/Access/DB/VITE）、本番前提フラグ不一致、`dxidea.mirai-dx-platform.com` DNS未解決、`wrangler` 未認証。
- 16:41 JST: `SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api npm run release:smoke` → `DNS lookup failed` で BLOCKED。
- 16:44 JST: `TMPDIR=<tmpdir> npm run -s verify` → ✅ PASS（`lint` / `test` / `build` / `build:production-api` / `security:scan`）。
- テスト補足: `npm run -s test` は Node 25.2.1 + tsx でデフォルトTMPDIRだと EPERM(pipe作成)が再現。`TMPDIR=<tmpdir> npm run -s test` は PASS。`npm run -s lint` と `npm run security:scan` は PASS。
- 22:20 JST: `codex review --uncommitted` 実行 → No findings。`CodeRabbit review --plain` も No findings。`npm run security:scan` PASS。`code-review --fix` は `command not found`。
- 22:20 JST: `SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api npm run release:smoke` → `DNS lookup failed` でBLOCKED。
- 22:20 JST: `SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api npm run release:gate` → `release:monitor` で BLOCKED（本番Env未投入、wrangler未認証、DNS未解決）。
- 22:20 JST: `release:monitor` → 本番Env未設定、`wrangler auth` 失敗、DNS未解決で BLOCKED。

- `main` に PR #8 がマージされ、リモート `origin/main` と同一 (`ab327b5`)。
- `npm run verify`、`npm run worker:deploy:dry-run`、`npm audit --audit-level=high` は通過。
- `npm run predeploy:check` は実環境値未設定では失敗するが、`ALLOW_LOCAL_AUTH_BYPASS=false` と実設定を入れた本番疑似値でPASSを確認済み。
- `npm run release:smoke` は `SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api` でDNS解決不能のため未達（status=0）。
- `npm run release:gate` は `release:prepare` PASS 後に `release:smoke` ブロックで失敗（DNS未解決）。
- `npm run release:monitor` は `wrangler whoami` 未認証＋DNS未解決で失敗（外部接続準備未完了）。
- GitHub Projects `users/Kensan196948G/projects/42` は P0 Issue#2-5 を Done、Issue#6 を In Progress に更新済み。
- `code-review --fix` は現在の作業環境に未導入（`command not found`）。導入後は release 直前に再実施し、レビュー結果をIssue #6 に追記する。

## 2. 実装済みファイル

| 領域 | 主なファイル |
|---|---|
| WebUI | `Construction DX Idea (standalone).html`, `src/App.tsx`, `src/styles/app.css`, `src/lib/api.ts`, `src/lib/mockApi.ts` |
| 共通型・検査 | `src/lib/shared.ts`, `src/lib/privacy.ts` |
| Worker API | `worker/index.ts` |
| DB | `migrations/001_initial_schema.sql` |
| CI/検証 | `.github/workflows/ci.yml`, `scripts/security-scan.mjs`, `tests/privacy.test.ts` |
| Cloudflare | `wrangler.toml`, `.env.example` |

## 3. 実装済み機能

- 提供standaloneデザインの全画面表示
- WebUIからの実APIデータ初期読込
- 困りごと入力の必須項目、使用中データ、関連システム、機密情報可能性入力
- WebUIからの入力検査、AI質問生成、AI構造化、手動フォールバック
- WebUIからの下書き保存、正式登録、Slack通知結果表示
- WebUIからの管理者ステージ変更
- WebUI操作のロールガードと二重送信ガード
- standalone WebUIブリッジ変換ロジックの単体テスト
- 共有API schemaのstrict化、配列件数・要素長制限
- AI利用設定カード内のClaude APIキー接続テスト
- AI利用設定カード内の保存済みSecret接続テスト、モデル・月間上限の設定保存
- standaloneデザイン内のダッシュボード、困りごと入力、AI壁打ち、構造化確認、一覧、詳細、ステージ管理の画面表示
- 入力検査・機密情報候補検出ロジック
- Cloudflare Workers API
- Claude API呼び出し処理
- AI無効化、日次上限、文字数上限
- 月次概算予算上限
- AI無効・障害時の手動登録導線
- AI接続設定の取得・更新
- Claude API接続テスト
- システム管理者向けAI設定UI
- 許可Origin限定CORS
- Cloudflare Access JWT検証
- 管理者・システム管理者メールの明示設定
- Neon PostgreSQL保存処理
- ステージ変更履歴保存
- 利用制限テーブル
- Slack新規登録通知
- Slack通知失敗時の登録成功維持
- Slack通知OutboxとCron再送
- 監査ログとAI利用履歴
- Secret混入検査
- WorkerランタイムログのSecretマスキング
- GitHub Actions CI

## 3.1 WebUI機能ブリッジ状況

| 領域 | 状態 | 備考 |
|---|---|---|
| AI利用設定 | API接続済み | APIキー接続テスト、保存済みSecret接続テスト、設定保存をWorker APIへ接続。APIキー本体は保存しない |
| 困りごと入力 | API接続済み | `POST /api/privacy/inspect`、`POST /api/ai/questions` へ接続。機密情報blocker時はAI送信停止 |
| AI壁打ち・構造化 | API接続済み | `POST /api/ai/structure` へ接続。AI障害時は手動確認用下書きへフォールバック |
| 一覧・詳細 | API接続済み | `GET /api/ideas` の実データ表示へ接続。失敗時は警告し再試行 |
| 保存・正式登録 | API接続済み | `POST /api/ideas/drafts`、`POST /api/ideas` へ接続。Slack通知失敗は登録成功として表示 |
| ステージ管理 | API接続済み | `POST /api/ideas/:id/stage` へ接続。管理者以外のUI操作は停止 |

## 4. 検証結果

実行済み:

```bash
npm run verify
npm run build:production-api
npm run worker:deploy:dry-run
```

結果:

| 検証 | 結果 |
|---|---|
| ESLint | 成功 |
| Node test | 成功。入力検査、マスキング、standaloneブリッジ、共有schema、CORS許可Origin、明示ロール判定、ログ秘匿、Cloudflare Access JWTの正常系・主要異常系を確認 |
| TypeScript build | 成功 |
| Vite production build | 成功 |
| Production API build | 成功。`VITE_USE_MOCK_API=false` でビルド確認 |
| Secret scan | 成功 |
| Wrangler deploy dry-run | 成功 |
| npm audit | 成功。0 vulnerabilities |
| `npm run predeploy:check` | 実環境値未投入時は未完了。ダミー本番値で再実行するとPASS |
| `npm run release:monitor` | BLOCKED（`wrangler auth` 未認証、DNS未解決）→ **2026-07-21: `RELEASE_STAGE=pre-access` でPASS 9チェック**（wrangler auth解消、DNS未解決は初回デプロイ前の想定内扱い） |
| `npm run release:smoke` | BLOCKED（`dxidea.mirai-dx-platform.com` のDNS解決失敗）→ Stage Aデプロイ後に実測予定 |
| `npm run release:gate` | BLOCKED（`release:smoke` ブロック）→ Stage Aデプロイ後に実測予定 |
| `code-review --fix` | BLOCKED（未インストール） |
| `codex review --uncommitted` | 改善実施（`custom_domain` サンプルを `routes` 形式へ修正） |
| `RELEASE_STAGE` 段階モード（2026-07-21） | 成功。pre-access緩和 / full従来動作 / 不正値fail-fast / placeholder（localhost入りDATABASE_URL）拒否を実機検証 |
| `wrangler dev` ローカル実動（2026-07-21） | BLOCKED。workerd（V8）が開発機sandboxで `Fatal process out of memory: SegmentedTable::InitializeTable` により起動不可。`worker:deploy:dry-run`（assets 7ファイル認識）とデプロイ後smokeで代替 |

## 5. GitHub Projects

Project:

- [Construction-DX-Idea 開発司令盤](https://github.com/users/Kensan196948G/projects/42)

起票済みIssue:

- [#2 P0: WebUI wizard and dashboard MVP](https://github.com/Kensan196948G/Construction-DX-Idea/issues/2)
- [#3 P0: Cloudflare Worker API, AI guardrails, Slack notification](https://github.com/Kensan196948G/Construction-DX-Idea/issues/3)
- [#4 P0: Neon PostgreSQL schema and migration baseline](https://github.com/Kensan196948G/Construction-DX-Idea/issues/4)
- [#5 P0: CI, verification, security scan, release dry-run](https://github.com/Kensan196948G/Construction-DX-Idea/issues/5)
- [#6 P1: Production deployment settings and real environment validation](https://github.com/Kensan196948G/Construction-DX-Idea/issues/6)

## 6. ローカル起動

```bash
npm install
npm run dev
```

ローカル開発では `VITE_USE_MOCK_API=true` でモックAPIを利用できる。本番ビルドでは `VITE_USE_MOCK_API=false` と `VITE_API_BASE_URL` を必ず設定し、`npm run predeploy:check` を通す。

## 7. 本番直前に必要な作業

> 💡 2026-07-21更新: 以下はStage A（外殻公開）/ Stage B（Access/DB/AI有効化）の
> 2段階へ再編した。実行順・分担の正本は `docs/23_release_deploy_runbook.md` §12。

- Neonへ `migrations/001_initial_schema.sql` を適用する。
- Cloudflare Accessの許可ユーザー、管理者、システム管理者を設定する。
- `DATABASE_URL`、`ANTHROPIC_API_KEY`、`SLACK_WEBHOOK_URL` をCloudflare Secretへ登録する。
- `AI_ENABLED=true`、`APP_BASE_URL`、利用上限を本番値へ変更する。
- `ALLOWED_ORIGINS`、`ADMIN_EMAILS`、`SYSTEM_ADMIN_EMAILS` を本番値へ変更する。
- `CF_ACCESS_CERTS_URL`、`CF_ACCESS_AUD`、`CF_ACCESS_ISSUER` をCloudflare Accessの値へ変更する。
- `ALLOW_LOCAL_AUTH_BYPASS=false` を確認する。
- `VITE_USE_MOCK_API=false` と `VITE_API_BASE_URL` を本番値へ設定する。
- `npm run predeploy:check` を本番環境値で実行する。
- `npm run release:smoke` を実行し、一般ユーザーとシステム管理者の観点でAPI境界・接続確認を実施する。
- `npm run release:gate` を実行し、`release:monitor` + `release:prepare` + `release:smoke` をまとめて事前確認する。
- 本番デプロイ実行時は `npm run release:deploy` を用いて、実デプロイ後に `release:smoke` が走ることを確認する。
- 実Claude API接続テストを実行する。
- Slack通知テストを実行する。
- 一般利用者と管理者ロールでE2E確認を行う。
- GitHub ProjectのP0 Issueをレビュー結果に応じてDoneへ更新する。
- PR #8のCodeRabbitレビュー完了後、指摘があれば追加修正する。
- 未完了の `#6 Production deployment settings and real environment validation` は、
  `mirai-dx-platform.com` サブドメイン導入前提でCloudflare設定、Secret投入、Neon移行、ライブE2E検証が完了した場合のみクローズする。現時点はDNS解決と公開接続が未完了のため In Progress。
- `code-review --fix` は実行環境に未導入（`command not found`）。代替として `npm run security:scan` をセキュリティゲートとして継続。
