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

## 2. 検証証跡（2026-08-12）

| 検証 | 結果 |
|---|---|
| `npm run verify`（lint / test / build / build:production-api / security:scan） | ✅ PASS（test 49件、suites 9） |
| 単体テスト追加分 | ✅ 9件（prompt 2 / idempotency 2 / stage 2 / PII 3） |
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
