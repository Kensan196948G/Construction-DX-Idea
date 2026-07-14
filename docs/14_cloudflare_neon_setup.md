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

必須の環境変数:

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

## 7. Cloudflare Pages デプロイ補足

- 本番配信には次の環境変数が必要です。
  - `CLOUDFLARE_PAGES_PROJECT`: Cloudflare Pagesプロジェクト名
