# リリース・デプロイRunbook

## 1. 目的

本書は、`Construction-DX-Idea` を本番公開するための環境値、デプロイ、スモークテスト、ロールバック手順を定義する。

本番リリースは §1.6 の2段階（Stage A: 外殻公開 → Stage B: Access/DB/AI有効化）で行う。

## 1.5 Cloudflare実行前提（外部認証）

Cloudflareコマンド実行前提:

- wrangler認証済みであること（`wrangler login` または `CLOUDFLARE_API_TOKEN` 環境変数）
- 対象アカウントに zone `mirai-dx-platform.com` の管理権限があること
- `wrangler whoami` が成功すること

## 1.6 段階リリース（RELEASE_STAGE）

本プロジェクトは同一オリジン構成（1つのWorkerがSPA静的アセットと `/api/*` の両方を
`https://dxidea.mirai-dx-platform.com` で配信）を採用し、2段階でリリースする。

| Stage | `RELEASE_STAGE` | 内容 | 前提 |
|---|---|---|---|
| Stage A | `pre-access` | SPA外殻+APIを公開。Access/DB/AIは未接続で、APIは401/503のfail-close応答 | wrangler認証のみ |
| Stage B | `full`（デフォルト） | Cloudflare Access有効化・`DATABASE_URL`投入・（任意で）AI有効化を経た完全リリース | Accessアプリ作成・Secrets投入 |

`predeploy:check` / `release:monitor` / `release:smoke` は `RELEASE_STAGE=pre-access` を
明示した場合のみStage A緩和を適用する:

- `CF_ACCESS_CERTS_URL` / `CF_ACCESS_AUD` / `CF_ACCESS_ISSUER` / `DATABASE_URL` /
  `ANTHROPIC_API_KEY` を任意化（設定されている値へのplaceholder検査は継続）
- `release:monitor` は本番ホスト名のDNS未解決を許容（初回custom domainデプロイ前は
  未登録が正常）
- smokeのAccess JWT必須チェックをskipに維持し、代わりにSPA外殻（`GET /` が
  redirect追従なしでHTML 200かつアプリ識別子を含む）を検証

> ⚠️ `release:smoke` 自体は段階に関わらずDNS解決を必須とする（実URLの実測が目的の
> ため）。したがって**初回デプロイ前に `release:gate` を実行してはならない**
> （内包するsmokeがDNS未解決で即FAILする）。初回のデプロイ前検証は
> `release:monitor` + `release:prepare` で行い、smokeは `release:deploy` が
> デプロイ後に内部実行する。`release:gate` は初回デプロイ完了後から使用できる。

`RELEASE_STAGE` 未指定（または `full`）では従来どおり全値必須・DNS解決必須で、
未知の値は3スクリプトともfail-fastする。

## 2. 本番環境値

運用FQDN:

- `https://dxidea.mirai-dx-platform.com`（SPAとAPIの同一オリジン）

| 区分 | 変数 | Stage A | Stage B | 備考 |
|---|---|---|---|---|
| Frontend | `VITE_API_BASE_URL` | 必須 | 必須 | `https://dxidea.mirai-dx-platform.com`（**オリジンのみ**。`/api` を付けるとリクエストパスと二重になり404 — Issue #23。`predeploy:check` が `/api` 末尾を拒否し、フロント側も正規化する） |
| Frontend | `VITE_USE_MOCK_API=false` | 必須 | 必須 | 本番でモックAPIを禁止 |
| Worker | `APP_BASE_URL` | 必須 | 必須 | WebUIの本番URL |
| Worker | `ALLOWED_ORIGINS` | 必須 | 必須 | WebUI Originのみ |
| Worker | `ADMIN_EMAILS` | 必須 | 必須 | ステージ変更権限 |
| Worker | `SYSTEM_ADMIN_EMAILS` | 必須 | 必須 | AI設定権限 |
| Worker | `ALLOW_LOCAL_AUTH_BYPASS=false` | 必須 | 必須 | 本番でローカル認証を禁止 |
| Worker | `CF_ACCESS_CERTS_URL` | 任意 | 必須 | Access JWK URL |
| Worker | `CF_ACCESS_AUD` | 任意 | 必須 | Access Audience Tag |
| Worker | `CF_ACCESS_ISSUER` | 任意 | 必須 | Access issuer |
| Worker | `AI_INPUT_COST_PER_1K_TOKENS` | 推奨 | 推奨 | 概算費用計算 |
| Worker | `AI_OUTPUT_COST_PER_1K_TOKENS` | 推奨 | 推奨 | 概算費用計算 |
| Secret | `DATABASE_URL` | 任意 | 必須 | Neon接続文字列 |
| Secret | `ANTHROPIC_API_KEY` | 任意 | 必須 | Claude API（`AI_ENABLED=true` 時） |
| Secret | `SLACK_WEBHOOK_URL` | 任意 | 任意 | 未設定時はSlack通知をskippedにする |

Stage Aで「任意」の値は未設定のままWorkerがfail-close（401/503）に倒れるため、
公開しても認証・データ・AIの各機能は一切露出しない。

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

Stage Aの実行例（Access/DB/AI値なし。`<admin-email>` は `wrangler.toml` の
`ADMIN_EMAILS` と同じ管理者メールを指定する）:

```bash
export RELEASE_STAGE=pre-access
export APP_BASE_URL=https://dxidea.mirai-dx-platform.com
export ALLOWED_ORIGINS=https://dxidea.mirai-dx-platform.com
export ADMIN_EMAILS=<admin-email>
export SYSTEM_ADMIN_EMAILS=<admin-email>
export VITE_API_BASE_URL=https://dxidea.mirai-dx-platform.com
export SMOKE_API_BASE_URL=https://dxidea.mirai-dx-platform.com/api
export ALLOW_LOCAL_AUTH_BYPASS=false
export VITE_USE_MOCK_API=false
npm run release:monitor && npm run release:prepare   # デプロイ前検証（初回はrelease:gate不可、§1.6参照）
npm run release:deploy   # デプロイ（Worker+静的アセット、custom domain自動登録、デプロイ後smoke内包）
```

Stage Bでは `RELEASE_STAGE=full` を**明示**し（同一シェルにStage Aの
`pre-access` が残ったまま緩和が効き続ける事故を防ぐ）、追加で `CF_ACCESS_*`、
`DATABASE_URL`、`ANTHROPIC_API_KEY` と `release:smoke` 用JWTを設定する:

```bash
export RELEASE_STAGE=full
export SMOKE_CF_ACCESS_USER_JWT=<一般利用者JWT>
export SMOKE_CF_ACCESS_USER_EMAIL=<一般利用者メール>
export SMOKE_CF_ACCESS_ADMIN_JWT=<システム管理者JWT>
export SMOKE_CF_ACCESS_ADMIN_EMAIL=<システム管理者メール>
```

任意:

```bash
export SMOKE_ADMIN_TEST_MODEL=claude-sonnet-5
export SMOKE_ADMIN_TEST_API_KEY=<接続テストキー>
export SMOKE_SLACK_WEBHOOK_TEST=<通知確認用Webhook>
export SMOKE_REQUEST_TIMEOUT_MS=12000
```

## 4. Neon

> ✅ 2026-07-21実施済み: project `Construction-DX-Idea`（`twilight-cloud-06040828`）、
> region `aws-us-east-2`（MCPのリージョン指定不可により組織デフォルト。ユーザー決裁で確定）、
> DB `neondb`、migration適用済み。

1. Neonプロジェクトを作成する（プロジェクト名 `Construction-DX-Idea`）。
2. `migrations/001_initial_schema.sql` を適用する。
3. `ideas`、`idea_ai_sessions`、`audit_logs`、`ai_usage_counters`、`ai_monthly_usage_counters`、`notification_outbox` が作成されたことを確認する。
4. 接続文字列をCloudflare Worker Secretの `DATABASE_URL` に登録する（Stage B。値は表示・保存しない）。

Stage Aではプロジェクト作成とmigration適用（スキーマ準備）まで行い、`DATABASE_URL` の
Secret投入はStage Bで行ってよい。Workerは `DATABASE_URL` 未設定の間、DB依存APIを503で
fail-closeする。

## 5. Cloudflare Access（Stage B）

1. WebUIとWorker API（同一オリジン `dxidea.mirai-dx-platform.com`）をAccess保護対象にする。
2. 許可ユーザーまたは許可ドメインを設定する（`wrangler.toml` の `ADMIN_EMAILS` と同じ管理者メール）。
3. Audience Tag、JWK URL、issuerをWorker変数（`wrangler.toml` の `CF_ACCESS_*`）へ設定し再デプロイする。
4. JWTなし、期限切れJWT、issuer不一致、audience不一致が401になることを確認する。

同一オリジン構成のためAccessアプリケーションは1つでよい。現行のCloudflare API Tokenには
Access編集権限がないため、Accessアプリの作成はダッシュボードでの人間作業となる。

## 6. Cloudflare Worker（同一オリジン配信）

`wrangler.toml` は次を設定済み:

- `routes = [{ pattern = "dxidea.mirai-dx-platform.com", custom_domain = true }]`
  （Custom Domainsはホスト名のみのパターンで `zone_name` 不要。初回デプロイ時に
  DNSレコードとTLS証明書が自動作成される）
- `[assets]` で `./dist` をSPA配信（`not_found_handling = "single-page-application"`、
  `run_worker_first = ["/api/*"]` により `/api/*` のみWorkerコードが処理）

デプロイ:

```bash
npm run build:production-api   # dist を生成（release:prepare 経由でも可）
wrangler deploy worker/index.ts
```

Secrets（Stage B）:

```bash
wrangler secret put DATABASE_URL
wrangler secret put ANTHROPIC_API_KEY
wrangler secret put SLACK_WEBHOOK_URL
```

Cron Triggersは `wrangler.toml` の `*/10 * * * *` を利用し、Slack通知Outboxのfailed行を再送する。

## 7. Frontend（Workers Static Assetsに同梱）

フロントエンドは独立したホスティングを持たず、`dist/` をWorkerの静的アセットとして
同一デプロイで配信する。`npm run release:deploy` は `release:prepare` 内の
`build:production-api`（`VITE_USE_MOCK_API=false`）で `dist/` を生成してから
`wrangler deploy` する。

ビルドのみ行う場合:

```bash
VITE_USE_MOCK_API=false VITE_API_BASE_URL=https://dxidea.mirai-dx-platform.com npm run build
```

旧構成（Cloudflare Pages分離配信、`frontend:deploy` / `CLOUDFLARE_PAGES_PROJECT`)は
2026-07-21に廃止した。クロスオリジンではCloudflare AccessのJWTヘッダがフロントからの
API呼び出しに乗らず、CORS許可ヘッダの追加も必要になるため、同一オリジンへ統合した。

## 8. スモークテスト

| No | 確認 | 期待結果 | Stage A |
|---:|---|---|---|
| 1 | Accessログイン | 許可ユーザーだけ入れる | −（Stage B） |
| 2 | `GET /`（SPA外殻） | HTML 200 | ✅ 対象 |
| 3 | `/api/health` | 未認証でも200 | ✅ 対象 |
| 4 | `/api/me` | JWTなしは401、JWTありはユーザー情報 | ✅ 401側のみ |
| 5 | 一般利用者 | ダッシュボード、入力、手動登録が可能 | −（Stage B） |
| 6 | システム管理者 | AI接続設定を取得・更新できる | −（Stage B） |
| 7 | AI接続テスト | 成功時に末尾4文字だけ表示 | −（Stage B） |
| 8 | 機密情報検出 | blockerはAI送信・登録を停止 | −（Stage B） |
| 9 | AI構造化 | JSON不正時は `AI_RESPONSE_INVALID` | −（Stage B） |
| 10 | 月次予算 | 上限到達時に `AI_BUDGET_EXCEEDED` | −（Stage B） |
| 11 | Slack | sent/skipped/failedがUIへ反映 | −（Stage B） |
| 12 | Slack再送 | failed OutboxがCron後に再試行される | −（Stage B） |
| 13 | 本番公開先 | `https://dxidea.mirai-dx-platform.com` が閲覧できる | ✅ 対象（Access保護はStage B） |
| 14 | リリースゲート | `npm run release:gate` が 0 exit で完了 | ✅ `RELEASE_STAGE=pre-access`（**初回デプロイ完了後**から。デプロイ前は§1.6のとおりmonitor+prepareで代替） |

## 9. ロールバック

Stage A（初回デプロイ）:

1. 公開を止める場合は `wrangler.toml` から `routes` を外して再デプロイするか、
   ダッシュボードでWorkerのCustom Domainを切断する（DB未接続のためデータ影響なし）。
2. Worker自体を撤去する場合は `wrangler delete`（人間確認のうえで実行）。

Stage B以降:

1. `wrangler rollback` または直前バージョンの再デプロイでWorker（静的アセット込み）を戻す。
2. `AI_ENABLED=false` にしてAI機能を停止する。
3. Slack通知に失敗した場合は `notification_outbox` を確認し、必要に応じて手動共有する。
4. 監査ログ、AI利用履歴、Cloudflareログから影響範囲を確認する。

## 10. Production Ready 判定

> 💡 以下は**Production Ready**（Stage B完了＝本番稼働開始）の判定条件です。
> Stage A完了時点は「外殻公開済み・機能はfail-close」であり、Production Readyでは
> ありません。Release Ready（デプロイ準備完了）の判断基準・現在地は§12を参照。

- `npm run verify` が成功している。
- `npm run worker:deploy:dry-run` が成功している。
- `npm run predeploy:check` が本番環境値（`RELEASE_STAGE` 未指定）で成功している。
- `npm run release:smoke` が本番環境値で成功している。
- `npm run release:gate` が成功している（`release:monitor` + `release:prepare` + `release:smoke`）。
- `npm run release:deploy` が成功している（`release:monitor` + `release:prepare`、デプロイ実行、デプロイ後smoke）。
- 実Claude API、Neon、Slack、Cloudflare Accessで必要観点のスモークテストが完了している。
- CodeRabbitレビューは P0/P1実装要件に対し完了扱い。`codex review --uncommitted` は `No findings`。
- security review は `npm run security:scan` をPASS。

## 11. 実行結果履歴

### 2026-07-28（保守: AI機能有効化＋UI改善＋モデルID統一）

| 項目 | 結果 |
|---|---|
| PR #29（Issue #28） | ✅ AI利用設定の接続テストが入力キーを無視するバグ修正、↺リセットボタン追加、サーバー登録キー状態表示、`AI_ENABLED=true` 切替。Version `d433ecf6` |
| `ANTHROPIC_API_KEY` 投入 | ✅ ユーザーが `wrangler secret put` で実行（Secret登録により新Version `3828f822` 自動発行。再デプロイ不要が実証された） |
| PR #31（Issue #30） | ✅ モデルIDをClaude 5世代へ統一（サーバーデフォルト`claude-sonnet-5`、選択肢にOpus 5）、Worker許可リスト検証追加、旧ID行の読み出し補正。Version `a5f0b1b8` |
| 本番検証 | ✅ 接続テスト成功（サーバー登録キー）、AI利用設定保存成功、`wrangler tail` 25分間エラー0件。Neon: `ai_settings` 最新行 model=`claude-sonnet-5`/enabled/connected |
| PR #32（Issue #25 security） | ✅ DB接続文字列・Neonパスワードのログ露出遮断（getDbのURL検証＋`npg_`マスク＋scheduledのsanitize catch）。回帰テスト3件追加 |
| PR #33（Issue #26） | ✅ 初期データ取得を最大5回・指数バックオフ化＋number inputテンプレート警告解消 |
| 最終デプロイ | ✅ PR #32/#33反映の本番デプロイ完了。**最終Version `475f4c50-e5df-4689-9d8f-c94efcbdd929`**（rollback先の直前Versionは `a5f0b1b8`）。Cloudflare Observability直近3hエラー0件 |
| 教訓 | Secret登録は新Versionを自動発行するためコード再デプロイ不要。マスク処理は「壊れた形式の秘密値」も想定する（`npg_`単体はpostgres://パターン非一致で素通り→PR #32で恒久対策） |

### 2026-07-21（Stage B完了 — Production Ready）

| 項目 | 結果 |
|---|---|
| Accessアプリ作成 | ✅ ユーザーがダッシュボードで作成（team `winter-lake-f4c9`、対象 `dxidea.mirai-dx-platform.com` 全パス、Allow: 管理者メール + `mirai-const.co.jp` ドメイン） |
| `CF_ACCESS_*` 反映 | ✅ PR #22（`afafc2b`）。AUD/チームはAccessリダイレクトの `kid`+meta JWT `aud` から取得（certs 200/JWK 2鍵疎通） |
| フロント404バグ修正 | ✅ PR #24（`3e354d5`）。`VITE_API_BASE_URL` の `/api` 二重付与（Issue #23）を正規化+ゲートで恒久対策。test 28/28 |
| `DATABASE_URL` 投入 | ✅ ユーザー実行。1回目はNeonリセット画面のパスワード単体を投入し全API 500（`neon()` が「not a valid URL」）→ wrangler tailで即特定 → パスワード再リセット+URL全体の再投入で解消 |
| 本番E2E（実ユーザー/system_admin） | ✅ `/api/me`・`/api/ideas`・`/api/admin/ai-settings` すべて200、ダッシュボード表示正常、wrangler tail 50秒間エラー0件 |
| `RELEASE_STAGE=full` のJWT付きgate | ⏸ NOT RUN（Access JWTが必要）。実ユーザーE2E確認で代替。JWT提供時に実行可能 |
| AI機能 | ⏸ 無効のまま（`AI_ENABLED=false`、`ANTHROPIC_API_KEY` 未投入）。有効化は任意の後続作業 |

### 2026-07-21（Stage A本番デプロイ完了）

PR #18（`2da4055` としてsquash merge）のY承認に基づき、CTOがStage Aを実行した。

| 項目 | 結果 |
|---|---|
| PR #18 merge → main CI | ✅ PASS（`2da4055`） |
| tag / GitHub Release | ✅ `v0.1.0` 作成済み |
| Neonプロジェクト作成 | ✅ `Construction-DX-Idea`（project_id `twilight-cloud-06040828`、region **us-east-2**、PG17、DB `neondb`）。MCPにリージョン指定がなく組織デフォルトが適用されたため、承認どおり us-east-2 続行をユーザーが追加決裁（2026-07-21）。初回に誤作成した `round-queen-86824264` はユーザー承認のうえ削除済み |
| migration `001_initial_schema.sql` | ✅ 適用完了（29文を1トランザクションで実行、全11テーブル作成確認） |
| デプロイ前検証（monitor + prepare） | ✅ PASS（monitor 9チェック、build、predeploy:check、dry-run） |
| `RELEASE_STAGE=pre-access npm run release:deploy` | ✅ 成功。Worker `construction-dx-idea-api` 作成、静的アセット5ファイル、custom domain `dxidea.mirai-dx-platform.com` 自動登録（DNS A/AAAA + TLS）、cron設定。Version ID `eb7807c5-b93e-451a-af41-c61c9891d9b7`（2026-07-21T09:57:47Z、100%） |
| デプロイ後smoke | ✅ PASS 6チェック（`GET /` HTML 200+識別子、`/api/health` 200、`/api/me` 401、境界401、JWT系はStage A仕様でSkip）。直後はローカルリゾルバのnegative cacheでDNS失敗→ `resolvectl flush-caches` で即解決 |
| `release:gate`（初回デプロイ後） | ✅ PASS（monitor + prepare + smoke） |

### 2026-07-21（Stage A準備）

| チェック | 実行結果 | 備考 |
|---|---|---|
| wrangler認証 | ✅ 解消 | `CLOUDFLARE_API_TOKEN` 設定済み。`release:monitor` の `wrangler auth` がPASS |
| `npm run verify` | ✅ 完了 | lint / test（fail 0）/ build / build:production-api / security scan すべて通過 |
| `npm run worker:deploy:dry-run` | ✅ 完了 | `[assets]` 統合構成で dist 7ファイルを認識、バインディング本番値 |
| `RELEASE_STAGE` 段階モード | ✅ 完了 | pre-access緩和 / fullの従来動作 / 不正値fail-fast / placeholder拒否を実機検証 |
| `wrangler dev` ローカル実動 | 🚫 BLOCKED | workerd（V8）が開発機sandboxで起動不可（`Fatal process out of memory: SegmentedTable::InitializeTable`）。dry-run＋デプロイ後smokeで代替 |
| Neonプロジェクト | ⏳ Stage A実行時 | 未作成（2026-07-21時点）。承認済み: region `aws-ap-southeast-1` |
| Cloudflare上のWorker/DNS | ⏳ Stage A実行時 | Worker `construction-dx-idea-api` 未作成、`dxidea.` DNS未登録（初回デプロイで自動作成） |

### 2026-07-14

コード・CI・レビュー側で実行可能な検証はすべて完了した。残る未達成項目は
すべて外部インフラ（Cloudflare DNS・Access・Secrets・wrangler認証）のセット
アップに依存しており、人間による実施が必要。

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

## 12. 残作業（Stage A / Stage B）

### Stage A: 外殻公開（マージY承認の範囲でCTOが自律実行）

> ✅ **2026-07-21完了**。実行結果は§11参照。本番URL: `https://dxidea.mirai-dx-platform.com`

前提: wrangler認証は完了済み（2026-07-21確認）。

1. Neonプロジェクト `Construction-DX-Idea` 作成（region `aws-ap-southeast-1`）
   → `migrations/001_initial_schema.sql` 適用 → テーブル作成確認
2. §3のStage A環境値を設定し `npm run release:monitor && npm run release:prepare` で
   デプロイ前検証を行う（初回は `release:gate` を使わない。§1.6参照）
3. `RELEASE_STAGE=pre-access npm run release:deploy` を実行
   （初回 `wrangler deploy` がWorker作成・静的アセットアップロード・
   `dxidea.mirai-dx-platform.com` のDNS/TLS自動登録を行い、デプロイ後smokeまで内包）
4. smoke結果（`GET /` HTML 200＋アプリ識別子、`/api/health` 200、`/api/me` 401）を確認。
   DNS伝播直後にsmokeが失敗した場合は数分待って `RELEASE_STAGE=pre-access npm run release:smoke` を単独再実行

### Stage B: Access / DB / AI 有効化（人間作業を含む）

1. 【人間】Cloudflare AccessアプリをダッシュボードでSelf-hostedとして作成
   （対象: `dxidea.mirai-dx-platform.com`、許可ユーザー: `wrangler.toml` の `ADMIN_EMAILS` と同じ管理者メール）
   → ✅ 2026-07-21完了（team `winter-lake-f4c9`、policy: 管理者メール + `mirai-const.co.jp` ドメイン許可）
2. 【人間→CTO】Audience Tag（AUD）・チーム名を共有 → CTOが `CF_ACCESS_CERTS_URL` /
   `CF_ACCESS_AUD` / `CF_ACCESS_ISSUER` を `wrangler.toml` へ反映するPRを作成
   → ✅ 2026-07-21完了。AUD/チームドメインは本番URLのAccessリダイレクト（`kid` と
   Cloudflare署名のmeta JWT `aud` の2箇所一致）から取得し、**ダッシュボードの
   Application Audience (AUD) Tag と突合して確定させる**（正値の出典はダッシュボード。
   リダイレクト値のみに依存しない）。Access有効化後は無認証smoke（pre-access）は302と
   なり使えないため、検証は「302保護確認 + certs疎通 + ログイン後の目視確認」で行う
3. 【人間】**先にNeonダッシュボードでロール `neondb_owner` のパスワードをリセット**する
   （プロジェクト作成時にNeon MCPが接続文字列を応答へ含める仕様のため、リセットにより
   セッションログへ出た値を無効化してから使う）。その後Secrets投入（値はCTOに共有しない）:
   `wrangler secret put DATABASE_URL`（リセット後の**接続URL全体** —
   `postgresql://` で始まる1行。リセット画面のパスワード単体Copyと取り違えないこと）、
   AI有効化時は `wrangler secret put ANTHROPIC_API_KEY`、任意で `SLACK_WEBHOOK_URL`
   → ✅ 2026-07-21完了（§11参照）
4. 本番環境値＋JWTを設定して `npm run release:gate`（`RELEASE_STAGE` 未指定）→
   `npm run release:deploy` で **Production Ready** へ進む
   → ✅ 2026-07-21 Production Ready判定（JWT付きgateは未実行、実ユーザーE2Eで代替。§11参照）
