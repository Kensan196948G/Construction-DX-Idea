# Cloudflare・Neonセットアップ手順

## 1. 前提

- Cloudflareアカウント
- Cloudflare Access利用設定
- Cloudflare Workers利用設定
- Neon PostgreSQLプロジェクト
- Claude APIキー
- Slack通知先

## 2. Cloudflare Access

設定内容:

- 対象ドメインまたはアプリケーションURL
- 許可するメールドメインまたはユーザー
- 管理者グループ
- セッション有効期限
- Worker APIへ `CF-Access-Authenticated-User-Email` が渡ること
- 既定公開ドメイン: `https://dxidea.mirai-dx-platform.com`

## 3. Cloudflare Workers

Workersの責務:

- APIルーティング
- Cloudflare Accessヘッダー検証
- 入力検査・匿名化
- Claude API呼び出し
- Neon接続
- Slack通知
- 利用制限
- 監査ログ

必須の環境変数（Stage B完成形。段階リリース中の扱いは `docs/23_release_deploy_runbook.md` §1.6参照 —
Stage Aでは `CF_ACCESS_*` は未設定のままWorkerがfail-closeで401/503を返す）:

| 変数 | 内容 |
|---|---|
| `APP_BASE_URL` | 本番WebUIのURL |
| `ALLOWED_ORIGINS` | CORSで許可するOriginのカンマ区切り |
| `ADMIN_EMAILS` | ステージ変更などを許可する管理者メールのカンマ区切り |
| `SYSTEM_ADMIN_EMAILS` | AI接続設定を許可するシステム管理者メールのカンマ区切り |
| `ALLOW_LOCAL_AUTH_BYPASS` | ローカル検証専用。本番では `false` |
| `CF_ACCESS_CERTS_URL` | Cloudflare AccessのJWK取得URL |
| `CF_ACCESS_AUD` | Cloudflare AccessアプリケーションのAudience Tag |
| `CF_ACCESS_ISSUER` | Cloudflare Accessチームドメイン由来のissuer URL |
| `AI_INPUT_COST_PER_1K_TOKENS` | 概算費用算出用の入力単価 |
| `AI_OUTPUT_COST_PER_1K_TOKENS` | 概算費用算出用の出力単価 |

## 4. Secret登録

MVPでは手動登録を推奨する。

必要なSecret例:

- `ANTHROPIC_API_KEY`
- `SLACK_WEBHOOK_URL`
- `DATABASE_URL`

`.env.example` にはキー名のみを記載し、実値は記載しない。

## 5. Neon PostgreSQL

作成するDB:

`migrations/001_initial_schema.sql` を適用する。主な作成対象は次のとおり。

- ideas
- idea_ai_sessions
- idea_decisions
- idea_stage_histories
- idea_comments
- ai_settings
- audit_logs
- usage_limits
- ai_usage_counters
- ai_monthly_usage_counters
- notification_outbox

## 6. 接続確認

1. Access経由でWebUIにログインできる。
2. Workers APIがユーザー情報を取得できる。
3. Neonへ読み書きできる。
4. Claude API接続テストに成功する。
5. Slackへテスト通知できる。
6. 監査ログが保存される。
7. Access JWTなしのAPI呼び出しが拒否される。
8. 不正なAccess JWT、期限切れJWT、issuer不一致JWT、audience不一致JWTが拒否される。
9. 未許可OriginからのCORSが許可されない。
10. `npm run predeploy:check` が本番環境値で成功する。
11. AI設定の `connected` 表示は接続テスト成功後だけになる。
12. `https://dxidea.mirai-dx-platform.com` でAccess保護された画面とAPI応答を確認する。

## 7. フロントエンド配信補足

- フロントエンド（SPA）は独立したホスティングを持たず、`wrangler.toml` の `[assets]` 設定により
  Worker本体と同一デプロイ（`wrangler deploy`）で `https://dxidea.mirai-dx-platform.com` から配信される。
- 旧構成（Cloudflare Pages分離配信、`CLOUDFLARE_PAGES_PROJECT`）は2026-07-21に廃止した。
  詳細は `docs/23_release_deploy_runbook.md` §7 を参照。

## 8. 現行本番構成（as-built、2026-07-28時点）

Secret値は記載しない。名前と所在のみを正とする。

### Cloudflare

| 項目 | 値 |
|---|---|
| Worker | `construction-dx-idea-api`（SPA静的資産を同梱、同一オリジン配信） |
| Custom Domain | `dxidea.mirai-dx-platform.com`（zone: `mirai-dx-platform.com`、deploy時自動登録） |
| Access | team `winter-lake-f4c9.cloudflareaccess.com`、アプリ「dxidea」全パス保護。Allow: `SYSTEM_ADMIN_EMAILS` のメール + `mirai-const.co.jp` ドメイン |
| Access検証vars | `CF_ACCESS_CERTS_URL` / `CF_ACCESS_AUD` / `CF_ACCESS_ISSUER`（公開検証パラメータ、wrangler.toml管理） |
| Secrets（名前のみ） | `DATABASE_URL`（必須）、`ANTHROPIC_API_KEY`（AI利用時必須・登録済み）、`SLACK_WEBHOOK_URL`（任意・未登録） |
| AI設定vars | `AI_ENABLED=true`、`AI_MODEL=claude-sonnet-5`（許可リスト: claude-sonnet-5 / claude-opus-5） |
| cron | `*/10 * * * *`（Slack通知outboxの再送。SLACK_WEBHOOK_URL未設定時は即return） |
| 監視 | `npx wrangler tail construction-dx-idea-api --format pretty`（診断の定石）。ログはsanitizeLogで秘密値マスク |

### Neon

| 項目 | 値 |
|---|---|
| Project | `twilight-cloud-06040828`（region: aws-us-east-2） |
| Database / Branch | `neondb` / デフォルトbranch（本番正本） |
| スキーマ | migration 001適用済み・11テーブル（ideas, ai_settings, audit_logs, notification_outbox, usage_limits ほか） |
| 接続 | Worker Secretの `DATABASE_URL` のみ（ローカル・リポジトリへは保持しない設計。release:monitorのローカル実行でDATABASE_URL未設定FAILが出るのは想定内） |
| 整合性確認（2026-07-28） | ai_settings最新行 model=claude-sonnet-5/enabled/connected、notification_outbox failed=0、DBサイズ約8MB |

### 環境境界

| 環境 | 実体 |
|---|---|
| local | `npm run dev`（モックAPI・system_admin自動付与、`http://<LAN-IP>:5173-5174`） |
| production | 上記Worker＋Neon（唯一の本番。preview環境は未使用、必要時はWorkers Preview URLを検討） |
