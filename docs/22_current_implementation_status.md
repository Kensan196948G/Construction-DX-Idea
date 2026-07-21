# 現在の実装・検証ステータス

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
