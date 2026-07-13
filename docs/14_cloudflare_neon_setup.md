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

## 4. Secret登録

MVPでは手動登録を推奨する。

必要なSecret例:

- `ANTHROPIC_API_KEY`
- `SLACK_WEBHOOK_URL`
- `DATABASE_URL`

`.env.example` にはキー名のみを記載し、実値は記載しない。

## 5. Neon PostgreSQL

作成するDB:

- ideas
- idea_ai_sessions
- idea_decisions
- idea_stage_histories
- ai_settings
- audit_logs
- usage_limits

## 6. 接続確認

1. Access経由でWebUIにログインできる。
2. Workers APIがユーザー情報を取得できる。
3. Neonへ読み書きできる。
4. Claude API接続テストに成功する。
5. Slackへテスト通知できる。
6. 監査ログが保存される。
