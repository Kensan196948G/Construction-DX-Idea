# 運用Runbook

## 1. 日次確認

- AI接続状態を確認する。
- AI利用量が上限に近づいていないか確認する。
- Slack通知失敗がないか確認する。
- 監査ログに異常な操作がないか確認する。
- エラーレート、タイムアウトを確認する。
- システム管理者は `GET /api/admin/audit-logs` と `GET /api/admin/ai-usage` で
  監査・利用量を実データで確認する（UIの監査ログ/利用量表示も同一API）。
- `npm run release:smoke` で一般ユーザー/管理者境界の継続監視を行う。
  - 前提:
    - `SMOKE_API_BASE_URL` 必須。未設定時は即時終了コード1。
    - 取得エラー時は `SMOKE_API_BASE_URL format` / `DNS lookup failed` / `Release smoke test failed.` を確認。
    - ログイン環境の制約で `SMOKE_CF_ACCESS_*` 未設定の場合、ユーザー系・管理者系APIは `- Skip` で実行継続される。
  - 必須補足:
    - `SMOKE_CF_ACCESS_USER_JWT / SMOKE_CF_ACCESS_USER_EMAIL`
    - `SMOKE_CF_ACCESS_ADMIN_JWT / SMOKE_CF_ACCESS_ADMIN_EMAIL`
  - 失敗時の対応:
    - 先にDNS登録とCloudflare Access経路を確認し、APIが返すHTTPコードとJSON内容をチェックして誤警報と実障害を切り分ける。

## 2. AI障害時

1. AI接続設定の状態を確認する。
2. Claude API側のエラー分類を確認する。
3. 必要に応じてAI機能を無効化する。
4. 利用者には手動入力と下書き保存を案内する。
5. 復旧後に接続テストを実行する。

## 3. Slack通知失敗時

1. Slack WebhookまたはBot tokenの状態を確認する。
2. 通知失敗ログを確認する。
3. アイデア登録自体が成功していることを確認する。
4. 必要に応じて手動でリンクを共有する。

## 4. APIキー更新

MVP:

1. Cloudflare DashboardまたはCLIでSecretを更新する。
2. 管理画面で接続テストを行う。
3. Neonのキー識別情報、最終確認日時、更新者を更新する。
4. 監査ログを確認する。

運用版:

1. 管理画面に新しいキーを入力する。
2. 接続テストに成功した場合だけSecrets Storeへ保存する。
3. 保存後、平文は破棄する。

## 5. 緊急停止

AI利用に情報漏えい、異常課金、誤設定の疑いがある場合:

1. AI機能を無効化する。
2. Cloudflare Secretを無効化または削除する。
3. 監査ログとAI処理履歴を確認する。
4. 影響範囲を整理する。
5. 再開条件を管理者が承認する。

## 6. バックアップ・復旧（2026-08-12追加）

Neonは自動バックアップ（PITR）を提供する。復旧手順の検証は四半期に1回以上実施する。

```bash
# Neon CLI（例。実行前に Neon プロジェクトIDを確認）
neonctl branches create --name backup-YYYYMMDD --project-id twilight-cloud-06040828
# バックアップブランチから一時接続URLを取得し、整合性SQLを実行
neonctl connection-string --branch backup-YYYYMMDD --project-id twilight-cloud-06040828
psql "$TEMPORARY_URL" -c "select count(*) from ideas; select count(*) from audit_logs;"
```

- RTO目標: 4時間 / RPO目標: 5分（Neon PITR前提。運用開始前にユーザー承認で確定する）。
- 復旧演習（リストア→スモーク→利用者確認）は本番を汚さないよう一時ブランチで行う。
- ロールバック手順は `docs/23_release_deploy_runbook.md` §ロールバックを参照。

## 7. 障害アラート（2026-08-12追加）

- Worker cron（毎時 `0 * * * *`）が直近1時間のAI処理失敗・Slack通知失敗を集計し、
  0件超の場合はSlackへアラートを送信し、`alert.failure.notified` を監査ログへ記録する。
- 毎時cronは監査チェーン整合性も自動検証し、不正時は `audit.chain.invalid.notified` として
  Slackへ通知・監査記録する（2026-08-31追加）。
- 週次cron（毎週日曜 `0 9 * * 0` = JST 18:00）は主要KPIと監査チェーン状態を
  `report.weekly.sent` としてSlackへ送信する（2026-08-31追加）。
- アラートのしきい値変更・停止はシステム管理者が判断する（現状は失敗1件以上で通知）。

## 8. 監査ログの改ざん検知

- `GET /api/admin/audit-logs/verify` でSHA-256チェーンを検証する（システム管理者限定）。
- `valid=false` の場合は `firstBrokenId` を確認し、原因（DB改変・スクリプト直接更新等）を調査する。
- 既存レガシー行は `legacyRows` として報告される（チェーン化前の行）。
- 毎時cronが自動検証・通知するため、Slack未設定環境では `checkAuditChainIntegrity` のログ
  （`監査チェーン検証エラー` がconsoleへ出る）も確認する。
- ローカル環境では `npm run dev:smoke` で主要APIと監査チェーンを一括検証できる。

## 9. ローカル実行環境（2026-08-31追加）

ローカルPostgreSQL（例: `dx_idea_mvp`）でAPIを動かす場合:

```bash
npm run db:migrate   # migrations/*.sql を冪等適用
npm run db:seed      # MVPデモ用ダミーデータを upsert（--reset で初期化）
PORT=8791 npm run dev:server   # Node直実行APIサーバー（既定127.0.0.1にbind）
npm run dev:smoke    # 一時ポートで自動起動→主要API・監査チェーン・413等を検証→停止
```

- 認証なしで操作確認する場合は `ALLOW_LOCAL_AUTH_BYPASS=true`（書き込みはレート制限あり）。
- 外部インターフェースへの公開は `HOST=0.0.0.0` を明示した場合のみ（既定はloopback）。
- 接続先は `neon.tech` 以外ならpostgres.js（TCP）、`neon.tech` ならNeon serverless driverを自動選択する。
