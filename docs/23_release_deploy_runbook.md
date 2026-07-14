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

## 10. Production Ready 判定

> 💡 以下は**Production Ready**（本番稼働開始）の判定条件です。CTOが自律実行できる
> 範囲が完了した状態を指す**Release Ready**（デプロイ準備完了）の判断基準・現在地は
> §12を参照してください。本節の項目のうち `release:smoke` 以降は外部インフラ未接続の
> ため現時点で未達成です。

- `npm run verify` が成功している。
- `npm run worker:deploy:dry-run` が成功している。
- `npm run predeploy:check` が本番環境値で成功している。
- `npm run release:smoke` が本番環境値で成功している。
- `npm run release:gate` が成功している（`release:monitor` + `release:prepare` + `release:smoke`）。
- `npm run release:deploy` が成功している（`release:monitor` + `release:prepare`、デプロイ実行、デプロイ後smoke）。
- 実Claude API、Neon、Slack、Cloudflare Accessで必要観点のスモークテストが完了している。
- CodeRabbitレビューは P0/P1実装要件に対し完了扱い。`codex review --uncommitted` は `No findings`。
- security review は `npm run security:scan` をPASS。`code-review --fix` は `command not found` で未導入のため、`Issue #6` でトラックを継続。

## 11. 最近の実行結果（2026-07-14）

コード・CI・レビュー側で実行可能な検証はすべて完了した。残る未達成項目は
すべて外部インフラ（Cloudflare DNS・Access・Secrets・wrangler認証）のセット
アップに依存しており、人間による実施が必要（§12参照）。

| チェック | 実行結果 | 備考 |
|---|---|---|
| PR反映状況 | ✅ 完了 | PR #9（`53ca40b`）・PR #10（`366091e`）が `main` にマージ済み |
| CI | ✅ 完了 | 直近5run連続 success |
| `npm run verify` | ✅ 完了 | lint / test 24/24 / build / build:production-api / security scan すべて通過 |
| `npm run worker:deploy:dry-run` | ✅ 完了 | 環境変数一覧が想定値で読み込み可 |
| CodeRabbit review（PR #9, #10） | ✅ 完了 | Critical/High指摘0件（指摘は全件対応済みまたは設計判断で現状維持） |
| `codex review` / `codex exec`（PR #9, #10） | ✅ 完了 | No findings 相当（Low指摘は対応済み） |
| `npm run release:monitor` / `release:smoke` / `release:gate` | 🚫 BLOCKED | 本番ドメイン `dxidea.mirai-dx-platform.com` のDNS未登録、`wrangler` 未認証。外部インフラ未接続が根本原因でコード側の問題ではない |

過去の詳細な実行ログ（2026-07-13時点、DNS未解決/wrangler未認証の同一原因による
BLOCKED記録）は `docs/24_autonomous_cto_execution_log.md` を参照。

## 12. Release Ready 判断と Production Ready への残作業

CTOが自律実行できる範囲（実装・テスト・CI・レビュー・手順書整備）はすべて
完了しており、**Release Ready**（デプロイ準備完了）と判断する。

`release:gate` の実環境到達確認は、以下の人間による外部インフラ操作が
完了して初めて実行可能になる（すべて人間決裁事項。CTOは代行しない）：

1. Cloudflareで `dxidea.mirai-dx-platform.com` のDNS登録・Custom Domain設定
2. Cloudflare Accessアプリケーションの設定（許可ユーザー/ドメイン、Audience Tag）
3. `wrangler login` によるCloudflareアカウント認証
4. Worker Secrets投入（`DATABASE_URL`、`ANTHROPIC_API_KEY`、`SLACK_WEBHOOK_URL`）
5. Neonプロジェクト作成 + `migrations/001_initial_schema.sql` 適用
6. 上記完了後、本番環境値を投入して `npm run predeploy:check` → `npm run release:smoke` → `npm run release:gate` を実行
7. `release:gate` 成功を確認したら `npm run release:deploy` で **Production Ready** へ進む

上記1〜5が完了すれば、6・7はコマンド1回で実行できる状態まで準備済み。
