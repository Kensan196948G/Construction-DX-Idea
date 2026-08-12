# 改善台帳（2026-08-12実施）

改善前評価は `docs/25_baseline_evaluation.md`。本台帳は実装済み改善と検証証跡を管理する。

## 1. 実装済み改善

| ID | 分類 | 内容 | 対象ファイル | 検証証跡 |
|---|---|---|---|---|
| IMP-01 | セキュリティ/コスト | AI利用予約を処理失敗時に解放（questions/structureのcatchで `releaseAiUsage` を呼ぶ） | `worker/index.ts` | コードレビュー+verify |
| IMP-02 | セキュリティ | AIプロンプトをsystem/user分離し、入力データを命令として扱わない指示を追加。プロンプトバージョンを `_v2` へ | `worker/index.ts` | 単体テスト `AI prompt hardening` 2件 |
| IMP-03 | 性能/信頼性 | Claude API呼び出しに15秒タイムアウト（`AI_TIMEOUT` 504）を追加（接続テスト含む） | `worker/index.ts` | 型検査+verify |
| IMP-04 | ガバナンス | 監査ログ閲覧API `GET /api/admin/audit-logs`（システム管理者限定、limit/action絞り込み） | `worker/index.ts` `src/lib/api.ts` `src/lib/mockApi.ts` | 単体テスト（既存権限テスト枠）+verify |
| IMP-05 | ガバナンス | AI利用量API `GET /api/admin/ai-usage`（当月集計+直近50件） | 同上 | verify |
| IMP-06 | ガバナンス | 利用制限API `GET/PUT /api/admin/usage-limits`（利用者別・全体の日次/月次制限を管理） | 同上 | verify |
| IMP-07 | UI | 監査ログ画面を実APIデータへ接続（system_admin時に自動ロード・日本語ラベル化） | `src/App.tsx` | verify（ビルド） |
| IMP-08 | UI | AI利用設定画面の「今月の利用状況」を実APIの当月呼び出し数へ接続 | `src/App.tsx` | verify |
| IMP-09 | プライバシー | 一覧・評価ボードAPIで管理者以外・提出者以外へ `submitter_email` を返さない | `worker/index.ts` | 単体テスト `idea PII redaction` 3件 |
| IMP-10 | データ品質 | アイデア登録の冪等性（`Idempotency-Key` ヘッダー、部分ユニーク索引、重複時は既存を返却） | `worker/index.ts` `migrations/003_add_idea_idempotency.sql` `src/lib/api.ts` `src/App.tsx` `src/lib/mockApi.ts` | 単体テスト `idempotency key validation` 2件 |
| IMP-11 | ガバナンス | ステージ遷移の定義（飛び級・終端ステージからの復帰を拒否）、却下/保管は理由必須 | `worker/index.ts` `src/App.tsx` | 単体テスト `stage transition guardrails` 2件 |
| IMP-12 | データ品質 | CSVエクスポートに期待効果・部署・提出者名・調整要否・件数系カラムを追加（管理者限定のまま） | `worker/index.ts` `src/lib/mockApi.ts` | verify |
| IMP-13 | セキュリティ/可用性 | React/ReactDOMをunpkg CDNから自己ホストへ（SRI一致確認、同一オリジン配信） | `support.js` `public/design/vendor/*` `eslint.config.js` | SRI sha384照合、`dist/design/vendor/` 出力確認 |
| IMP-14 | セキュリティ | 依存脆弱性0件（`npm audit fix` で postcss GHSA-fxqj-rqcc-2cmp 等を解消） | `package.json` `package-lock.json` | `npm audit` 0 vulnerabilities |
| IMP-15 | 文書/運用 | 評価書・改善台帳・運用手順（監査/利用量/バックアップ）・API/DB/セキュリティ設計・リリースRunbookを更新 | `docs/25` `docs/26` `docs/27` `docs/06` `docs/07` `docs/09` `docs/10` `docs/23` `docs/22` `README.md` `state.json` | レビュー |

## 1.1 2026-08-12 第2サイクル（最優先改善10件対応）

| ID | 分類 | 内容 | 対象ファイル | 検証証跡 |
|---|---|---|---|---|
| IMP-16 | 承認フロー | 承認依頼API（`POST /api/ideas/:id/request-approval`）と承認判定API（`POST /api/ideas/:id/approval`）、承認ゲート（依頼中のMVP以降遷移を拒否）、承認状態フィールド | `worker/index.ts` `migrations/004` | verify |
| IMP-17 | コメント/編集 | 詳細取得 `GET /api/ideas/:id`、編集 `PATCH /api/ideas/:id`（本人・管理者）、コメント `GET/POST /api/ideas/:id/comments`、詳細画面でAPIコメント表示・投稿 | `worker/index.ts` `src/App.tsx` `src/lib/*` | verify |
| IMP-18 | 通知 | ステージ変更・承認依頼・承認判定のSlack通知（Outbox再送対応 `notifySlackEvent`） | `worker/index.ts` | verify |
| IMP-19 | 評価ボードUI | 評価ボード画面（優先度スコア順・理由表示）とCSV出力ボタンをstandaloneデザインへ追加、APIデータ接続 | `Construction DX Idea (standalone).html` `src/App.tsx` | HTML script構文チェック+verify |
| IMP-20 | 監視/アラート | 毎時クロンでAI処理失敗・Slack通知失敗を検知しSlackへアラート（`checkAndAlertFailures`）、`formatAlertMessage` テスト | `worker/index.ts` `wrangler.toml` | 単体テスト2件 |
| IMP-21 | 監査改ざん耐性 | `audit()` をSHA-256ハッシュチェーン化（prev_hash/entry_hash）、`GET /api/admin/audit-logs/verify`、レガシー行のカウント | `worker/index.ts` `migrations/004` | 単体テスト2件 |
| IMP-22 | PWA/オフライン | manifest.webmanifest・sw.js（App Shellキャッシュ、APIは非キャッシュ）、本番のみSW登録 | `public/manifest.webmanifest` `public/sw.js` `src/main.tsx` `index.html` | build確認 |
| IMP-23 | 運用 | バックアップ演習スクリプト（`scripts/neon-backup-drill.sh`）、管理者メールの個人ドメイン警告（predeploy-check）、Dependabot設定 | `scripts/*` `.github/dependabot.yml` | スクリプト存在確認 |
| IMP-24 | GitHub復元 | バックログIssue 10件を新リポジトリへ起票（#3〜#12） | GitHub Issues | gh issue list 確認 |
| IMP-25 | 文書 | docs/06/07/10/22/23/26/27・README・state.jsonを更新 | 各docs | レビュー |

## 1.2 2026-08-12 第3サイクル（本番反映・次期機能）

| ID | 分類 | 内容 | 対象 | 検証証跡 |
|---|---|---|---|---|
| IMP-26 | 承認UI | 詳細画面に承認依頼・判定UI（承認/差戻し/却下・理由必須）を追加しAPI接続 | `Construction DX Idea (standalone).html` `src/App.tsx` | verify |
| IMP-27 | Excel | SpreadsheetMLによるExcel出力（依存追加なし・式インジェクション対策）とUIボタン | `worker/index.ts` `src/lib/*` HTML | 単体テスト2件（xmlCell） |
| IMP-28 | 検索 | 一覧検索をAPI（qパラメータ）へデバウンス連携 | `src/App.tsx` | verify |
| IMP-29 | オフライン | 通信障害時に下書きをlocalStorageキューへ保存し復帰後自動同期 | `src/App.tsx` | verify |
| IMP-30 | migration修正 | 004の制約追加をDOブロック化（PostgreSQL非対応構文の修正） | `migrations/004` | 本番適用成功 |
| IMP-31 | 本番反映 | PR #2 merge→`wrangler deploy`（Version `0f311cb8`）→migration 003/004適用→バックアップ演習 | 本番 | deploy出力・psql検証 |

## 1.3 2026-08-12 第4サイクル（DeepSeek・ユーザー管理・監査エクスポート）

| ID | 分類 | 内容 | 対象 | 検証証跡 |
|---|---|---|---|---|
| IMP-32 | AI | DeepSeekプロバイダー対応（モデル許可リスト・API分岐・接続テスト・設定保存/リセット） | `worker/index.ts` `src/lib/*` HTML | 単体テスト2件（モデル許可リスト） |
| IMP-33 | RBAC | app_usersテーブルとユーザー管理API（追加/編集/削除/一覧・自分自身保護）、DBロールを権限判定へ反映 | `worker/index.ts` `migrations/005` | 単体テスト1件（ロール解決） |
| IMP-34 | 監査 | 監査ログのCSV/Excel/HTMLエクスポートAPIとUIボタン | `worker/index.ts` `src/lib/*` HTML | verify |
| IMP-35 | UI | ユーザー管理画面（追加/編集/削除/ロール/有効無効）とAI設定のプロバイダー切替 | HTML `src/App.tsx` | HTML script構文OK |
| IMP-36 | 文書 | docs/06/07/09/22/26/27・README・state.json更新 | 各docs | レビュー |

## 2. 検証証跡（2026-08-12）

| 検証 | 結果 |
|---|---|
| `npm run verify`（lint / test / build / build:production-api / security:scan） | ✅ PASS（test 54件、suites 12） |
| 単体テスト追加分 | ✅ 14件（prompt 2 / idempotency 2 / stage 2 / PII 3 / 監査チェーン2 / アラート1 / xmlCell 2） |
| 本番デプロイ | ✅ Version `0f311cb8`（custom domain + cron2本） |
| Neon本番migration | ✅ 003（idempotency_key）・004（承認+監査チェーン）適用・カラム/制約/索引確認 |
| バックアップ演習 | ✅ `backup-20260812` ブランチで整合性SQL実行（ideas 0 / audit_logs 19 / outbox 0 / counters 0） |
| `npx wrangler deploy worker/index.ts --dry-run` | ✅ PASS（assets 12ファイル、891KB / gzip 168.5KB） |
| `npm audit` | ✅ 0 vulnerabilities |
| `release:monitor`（pre-access、実DNS） | ✅ PASS 9/9（wrangler認証・DNS解決含む） |
| 本番到達性 | ✅ `dxidea.mirai-dx-platform.com` はCloudflare Access保護（302）で稼働確認 |
| CI | main最新2 runs success（2026-08-08） |

## 3. 未実施（理由と必要操作）

| 項目 | 理由 | 必要操作 |
|---|---|---|
| 本番デプロイ | 本番影響を伴うため人間承認が必要 | PR merge後に `npm run release:deploy`（または承認後の自動デプロイ） |
| 本番Access JWT付きsmoke | JWTは本番ログイン環境で発行されるため | 管理者が `SMOKE_CF_ACCESS_*` を設定して実行 |
| migration 003の本番適用 | Neon本番DBへの書き込みは人間承認が必要 | 承認後に `migrations/003` を適用 |
| 管理者メールの会社ドメイン化 | 会社の実管理者アドレスが不明 | IT/DX部門で `ADMIN_EMAILS`/`SYSTEM_ADMIN_EMAILS` を複数化 |
| バックアップ復旧演習 | 本番DB操作を伴う | 四半期に1回、一時ブランチで演習 |

## 4. 残課題（優先順）

1. 承認フロー・差戻し（#38相当）とコメント・詳細・編集API/UI
2. 評価ボードUI・検索UI・CSVダウンロード導線（#36/#37/#40のUI部分）
3. ステージ変更・承認依頼のSlack通知
4. アラート通知（Slack/メール）と監視ダッシュボード
5. 監査ログの改ざん耐性（ハッシュチェーン）
6. モバイル/PWA/オフライン対応
7. SharePoint/Teams/Excel連携とCSVインポート
8. AI評価（eval）とRAG・人間承認ワークフロー
9. GitHub Issue/Projectsの復元（新リポジトリへの起票）
10. データ保持ポリシーの実装（90日匿名化等）
