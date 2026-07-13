# 現在の実装・検証ステータス

## 1. 現在の状態

2026-07-13時点で、MVPのリリース直前検証に向けたフロントエンド、バックエンド、インフラ定義、セキュリティ検査、CI、ドキュメントを実装済み。

## 2. 実装済みファイル

| 領域 | 主なファイル |
|---|---|
| WebUI | `src/App.tsx`, `src/styles/app.css`, `src/lib/api.ts`, `src/lib/mockApi.ts` |
| 共通型・検査 | `src/lib/shared.ts`, `src/lib/privacy.ts` |
| Worker API | `worker/index.ts` |
| DB | `migrations/001_initial_schema.sql` |
| CI/検証 | `.github/workflows/ci.yml`, `scripts/security-scan.mjs`, `tests/privacy.test.ts` |
| Cloudflare | `wrangler.toml`, `.env.example` |

## 3. 実装済み機能

- ダッシュボード指標表示
- 困りごと入力ウィザード
- 入力検査・機密情報候補検出
- AI追加質問フロー
- AI構造化結果の確認・修正
- 下書き保存、正式登録のUI
- アイデア一覧・詳細表示
- ステージ変更UI
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
- GitHub Actions CI

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
| Node test | 成功。入力検査、マスキング、CORS許可Origin、明示ロール判定を確認 |
| TypeScript build | 成功 |
| Vite production build | 成功 |
| Production API build | 成功。`VITE_USE_MOCK_API=false` でビルド確認 |
| Secret scan | 成功 |
| Wrangler deploy dry-run | 成功 |
| npm audit | 0 vulnerabilities |

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

- Neonへ `migrations/001_initial_schema.sql` を適用する。
- Cloudflare Accessの許可ユーザー、管理者、システム管理者を設定する。
- `DATABASE_URL`、`ANTHROPIC_API_KEY`、`SLACK_WEBHOOK_URL` をCloudflare Secretへ登録する。
- `AI_ENABLED=true`、`APP_BASE_URL`、利用上限を本番値へ変更する。
- `ALLOWED_ORIGINS`、`ADMIN_EMAILS`、`SYSTEM_ADMIN_EMAILS` を本番値へ変更する。
- `CF_ACCESS_CERTS_URL`、`CF_ACCESS_AUD`、`CF_ACCESS_ISSUER` をCloudflare Accessの値へ変更する。
- `ALLOW_LOCAL_AUTH_BYPASS=false` を確認する。
- `VITE_USE_MOCK_API=false` と `VITE_API_BASE_URL` を本番値へ設定する。
- `npm run predeploy:check` を本番環境値で実行する。
- 実Claude API接続テストを実行する。
- Slack通知テストを実行する。
- 一般利用者と管理者ロールでE2E確認を行う。
- GitHub ProjectのP0 Issueをレビュー結果に応じてDoneへ更新する。
- PR #7のCodeRabbitレビュー完了後、指摘があれば追加修正する。
