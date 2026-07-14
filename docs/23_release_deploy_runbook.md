# リリース・デプロイRunbook

## 1. 目的

本書は、`Construction-DX-Idea` を本番直前状態へ進めるための環境値、デプロイ、スモークテスト、ロールバック手順を定義する。

## 1.5 Cloudflare実行前提（外部認証）

Cloudflareコマンド実行前提:

- `wrangler login` 済みであること
- 対象アカウントに `dxidea.mirai-dx-platform.com` の管理権限があること
- `wrangler whoami` が成功すること
- `release:deploy` を使う場合は `CLOUDFLARE_PAGES_PROJECT` が設定されること

## 2. 本番環境値

運用FQDN:

- `https://dxidea.mirai-dx-platform.com`

| 区分 | 変数 | 必須 | 備考 |
|---|---|---:|---|
| Frontend | `VITE_API_BASE_URL` | 必須 | Cloudflare Worker APIのOrigin |
| Frontend | `VITE_USE_MOCK_API=false` | 必須 | 本番でモックAPIを禁止 |
| Frontend/Pages | `CLOUDFLARE_PAGES_PROJECT` | リリース時必須 | `npm run release:deploy` で `frontend:deploy` を実行する場合のみ |
| Worker | `APP_BASE_URL` | 必須 | WebUIの本番URL |
| Worker | `ALLOWED_ORIGINS` | 必須 | WebUI Originのみ |
| Worker | `ADMIN_EMAILS` | 必須 | ステージ変更権限 |
| Worker | `SYSTEM_ADMIN_EMAILS` | 必須 | AI設定権限 |
| Worker | `ALLOW_LOCAL_AUTH_BYPASS=false` | 必須 | 本番でローカル認証を禁止 |
| Worker | `CF_ACCESS_CERTS_URL` | 必須 | Access JWK URL |
| Worker | `CF_ACCESS_AUD` | 必須 | Access Audience Tag |
| Worker | `CF_ACCESS_ISSUER` | 必須 | Access issuer |
| Worker | `AI_INPUT_COST_PER_1K_TOKENS` | 推奨 | 概算費用計算 |
| Worker | `AI_OUTPUT_COST_PER_1K_TOKENS` | 推奨 | 概算費用計算 |
| Secret | `DATABASE_URL` | 必須 | Neon接続文字列 |
| Secret | `ANTHROPIC_API_KEY` | 必須 | Claude API |
| Secret | `SLACK_WEBHOOK_URL` | 任意 | 未設定時はSlack通知をskippedにする |

## 3. 事前チェック

```bash
npm ci
npm run verify
npm run worker:deploy:dry-run
npm audit --audit-level=high
VITE_USE_MOCK_API=false npm run build
npm run predeploy:check
npm run release:monitor
npm run release:smoke
```

`npm run predeploy:check` と `npm run release:smoke` は本番環境値をシェル環境に設定してから実行する。placeholder、ローカルURL、モックAPI有効状態では失敗させる。

`release:smoke` は起動時に `SMOKE_API_BASE_URL` のDNS到達性を先に検証する。DNS未解決時は即時 `BLOCKED` とし、別途 `Cloudflare DNS/custom domain` の確認が必要。

`release:smoke` 用変数の最小構成:

```bash
export SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api
export SMOKE_CF_ACCESS_USER_JWT=<一般利用者JWT>
export SMOKE_CF_ACCESS_USER_EMAIL=<一般利用者メール>
export SMOKE_CF_ACCESS_ADMIN_JWT=<システム管理者JWT>
export SMOKE_CF_ACCESS_ADMIN_EMAIL=<システム管理者メール>
```

任意:

```bash
export SMOKE_ADMIN_TEST_MODEL=claude-sonnet-4-5
export SMOKE_ADMIN_TEST_API_KEY=<接続テストキー>
export SMOKE_SLACK_WEBHOOK_TEST=<通知確認用Webhook>
export SMOKE_REQUEST_TIMEOUT_MS=12000
```

`release:deploy` を使う場合は、追加で次を設定します。

```bash
export CLOUDFLARE_PAGES_PROJECT=construction-dx-idea
```

```bash
npm run release:deploy
```

## 4. Neon

1. Neonプロジェクトを作成する。
2. `migrations/001_initial_schema.sql` を適用する。
3. `ideas`、`idea_ai_sessions`、`audit_logs`、`ai_usage_counters`、`ai_monthly_usage_counters`、`notification_outbox` が作成されたことを確認する。
4. 接続文字列をCloudflare Worker Secretの `DATABASE_URL` に登録する。

## 5. Cloudflare Access

1. WebUIとWorker APIをAccess保護対象にする。
2. 許可ユーザーまたは許可ドメインを設定する。
3. Audience Tag、JWK URL、issuerをWorker変数へ設定する。
4. JWTなし、期限切れJWT、issuer不一致、audience不一致が401になることを確認する。

## 6. Cloudflare Worker

```bash
wrangler secret put DATABASE_URL
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SLACK_WEBHOOK_URL
wrangler deploy worker/index.ts
```

Worker を `https://dxidea.mirai-dx-platform.com` で公開する場合:

1. `wrangler.toml` の `routes` に Cloudflare Custom Domains 方式のルートを追加し、Host名とWorkersを紐づける。Custom Domainsはホスト名のみのパターンを取り、`zone_name` は不要（`https://` プレフィックスや `/*` サフィックスを付けない）。

```toml
routes = [
  { pattern = "dxidea.mirai-dx-platform.com", custom_domain = true }
]
```

2. `APP_BASE_URL` を `https://dxidea.mirai-dx-platform.com` に設定する。
3. `ALLOWED_ORIGINS` を `https://dxidea.mirai-dx-platform.com` のみ許可する。
4. Accessアプリケーションの対象URLを同一オリジンへ向ける。
5. `npm run worker:deploy:dry-run` と `wrangler deploy worker/index.ts` を実行し、401/200を確認する。
6. `SMOKE_CF_ACCESS_*` 用JWTが未期限切れで、正しい issuer/audience を持つことを確認する。

Cron Triggersは `wrangler.toml` の `*/10 * * * *` を利用し、Slack通知Outboxのfailed行を再送する。

## 7. Frontend

本番では次を設定してビルドする。

```bash
VITE_USE_MOCK_API=false VITE_API_BASE_URL=https://<worker-origin> npm run build
```

配信先はCloudflare Pagesまたは既存の静的ホスティングを利用する。WebUI OriginはWorkerの `ALLOWED_ORIGINS` とCloudflare Accessの許可対象に含める。

Cloudflare Pagesを使う場合:

```bash
npm run build:frontend
export CLOUDFLARE_PAGES_PROJECT=construction-dx-idea
npm run frontend:deploy
```

`CLOUDFLARE_PAGES_PROJECT` はCloudflare Pagesプロジェクト名を指定します。  
デプロイ先アカウントは `wrangler login` 済みのプロファイル側のデフォルトアカウントを参照します。

## 8. スモークテスト

| No | 確認 | 期待結果 |
|---:|---|---|
| 1 | Accessログイン | 許可ユーザーだけ入れる |
| 2 | `/api/health` | 未認証でも200 |
| 3 | `/api/me` | JWTなしは401、JWTありはユーザー情報 |
| 4 | 一般利用者 | ダッシュボード、入力、手動登録が可能 |
| 5 | システム管理者 | AI接続設定を取得・更新できる |
| 6 | AI接続テスト | 成功時に末尾4文字だけ表示 |
| 7 | 機密情報検出 | blockerはAI送信・登録を停止 |
| 8 | AI構造化 | JSON不正時は `AI_RESPONSE_INVALID` |
| 9 | 月次予算 | 上限到達時に `AI_BUDGET_EXCEEDED` |
| 10 | Slack | sent/skipped/failedがUIへ反映 |
| 11 | Slack再送 | failed OutboxがCron後に再試行される |
| 12 | 本番公開先 | `https://dxidea.mirai-dx-platform.com` が閲覧でき、Access未認証時に保護される |
| 13 | リリースゲート | `npm run release:gate` が 0 exit で完了 |

## 9. ロールバック

1. Workerの直前バージョンへ戻す。
2. Frontend配信を直前ビルドへ戻す。
3. `AI_ENABLED=false` にしてAI機能を停止する。
4. Slack通知に失敗した場合は `notification_outbox` を確認し、必要に応じて手動共有する。
5. 監査ログ、AI利用履歴、Cloudflareログから影響範囲を確認する。

## 10. リリース判定

- `npm run verify` が成功している。
- `npm run worker:deploy:dry-run` が成功している。
- `npm run predeploy:check` が本番環境値で成功している。
- `npm run release:smoke` が本番環境値で成功している。
- `npm run release:gate` が成功している（`release:monitor` + `release:prepare` + `release:smoke`）。
- `npm run release:deploy` が成功している（`release:monitor` + `release:prepare`、デプロイ実行、デプロイ後smoke）。
- 実Claude API、Neon、Slack、Cloudflare Accessで必要観点のスモークテストが完了している。
- CodeRabbitレビューは P0/P1実装要件に対し完了扱い。`codex review --uncommitted` は `No findings`。
- security review は `npm run security:scan` をPASS。`code-review --fix` は `command not found` で未導入のため、`Issue #6` でトラックを継続。

## 11. 最近の実行結果（2026-07-13）

| チェック | 実行結果 | 備考 |
|---|---|---|
| PR反映状況 | ✅ 完了 | PR #8 が `main` にマージ済み（Merge commit: `ab327b5`） |
| CI | ✅ 完了 | 最新 run `29227437875` は success |
| `npm run verify` | ✅ 完了 | lint / test / build / security scan すべて通過 |
| `npm run worker:deploy:dry-run` | ✅ 完了 | 環境変数一覧が想定値で読み込み可 |
| `npm audit --audit-level=high` | ✅ 完了 | 高リスク脆弱性なし |
| `npm run release:prepare` | ✅ 完了 | 11:05の `release:prepare` 通過 |
| `npm run release:smoke` | 🚫 BLOCKED | DNS未解決で失敗 |
| `npm run release:gate` | 🚫 BLOCKED | `release:prepare` PASS、`release:smoke` BLOCKED |
| `npm run verify`（15:56） | ✅ 完了 | 通常検証再実行 |
| `npm run predeploy:check`（15:56） | ⚠️ BLOCKED | 実環境値未投入 |
| `npm run predeploy:check`（15:56） | ✅ PASS（疑似値） | `ALLOW_LOCAL_AUTH_BYPASS=false`・`VITE_USE_MOCK_API=false` |
| `npm run predeploy:check`（15:58） | ⚠️ BLOCKED | 実運用値未投入 |
| `npm run release:monitor`（15:58） | 🚫 BLOCKED | `wrangler` 未認証 / DNS未解決 |
| `npm run verify`（15:59） | ✅ 完了 | lint / test / build / security scan を再確認 |
| `npm run release:monitor`（15:59） | 🚫 BLOCKED | `APP_BASE_URL`等の必須値不足 / DNS未解決 / wrangler未認証 |
| `code-review --fix` | ⚠️ 未実施 | 実行環境に未導入（command not found） |
| `codex review --uncommitted` | ✅ No findings | release readiness差分を再確認済み |
| `security scan` | ✅ PASS | `npm run security:scan` |
| `codex review` | ⚠️ 実行未完了 | `--uncommitted` / `--base` / `--commit` が必要 |
| `npm run verify`（16:05） | ✅ 完了 | `16:05` 再確認 |
| `npm run predeploy:check`（16:05） | ✅ 完了 | 本番値ダミー投入時PASS |
| `npm run worker:deploy:dry-run`（16:05） | ✅ 完了 | `wrangler` dry-run完了 |
| `npm run verify`（16:05再実行） | ✅ 完了 | eslint/test/build/security scan を再確認 |
| `npm run predeploy:check`（16:05再実行） | ✅ 完了 | 本番値ダミー投入時にPASS |
| `npm run release:smoke`（16:08） | 🚫 BLOCKED | `dxidea.mirai-dx-platform.com` のDNS解決失敗 |
| `npm run release:gate`（16:08） | 🚫 BLOCKED | `release:prepare` はPASS、`release:smoke` はDNSエラー |
| `npm run release:monitor`（17:20） | 🚫 BLOCKED | `wrangler` 未認証、DNS未解決 |

次は以下を実環境値で実行し、Release Gate を打ち上げる。

1. `APP_BASE_URL`、`ALLOWED_ORIGINS`、`ADMIN_EMAILS`、`SYSTEM_ADMIN_EMAILS`  
2. `CF_ACCESS_CERTS_URL`、`CF_ACCESS_AUD`、`CF_ACCESS_ISSUER`  
3. `DATABASE_URL`、`VITE_API_BASE_URL`、`ALLOW_LOCAL_AUTH_BYPASS=false`、`VITE_USE_MOCK_API=false`  
4. `npm run predeploy:check` を再実行  
5. `npm run release:smoke` を実行  
6. `npm run release:deploy` を実行（または本番値確定環境で `release:gate` を事前確認後、`release:deploy` へ進む）  
