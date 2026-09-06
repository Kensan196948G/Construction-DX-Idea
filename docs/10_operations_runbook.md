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
3. DB（ローカルPostgreSQL）のキー識別情報、最終確認日時、更新者を更新する。
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

## 6. バックアップ・復旧（2026-08-12追加 / 2026-09-06 pg_dump/pg_restore実装で更新）

**DBはローカルPostgreSQL**（Neonは2026-08-31に廃止済み）。本番 `dx_idea` はローカル
PostgreSQL 16.14 上にあり、systemd（dx-idea-api.service）が postgres.js（TCP）で接続する。

### バックアップの取得

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:5432/dx_idea" npm run backup:run
```

- `scripts/backup-postgres.mjs` が `DATABASE_URL` の指すDBを custom形式（`-Fc`）で
  `backups/<dbname>/<dbname>-<timestamp>.dump` へ保存する。
- サーバーのメジャーバージョンを問い合わせ、一致する `pg_dump` バイナリ
  （`/usr/lib/postgresql/<major>/bin/pg_dump`）を自動選択する（重要: `PATH` 上の
  `pg_dump` がサーバーより新しいバージョンだと、`pg_restore` で復元不能なダンプが
  生成される。2026-09-06に実機で確認済みの既知の落とし穴）。
- 既定で同一DB名の直近14世代を保持し、それより古いものは自動削除する（`--keep N`で変更可）。
- `backups/` はgit管理外（`.gitignore`）。実データを含むため、Cloudflare等へ絶対に
  アップロードしない。保管先は本番ホストのローカルディスク＋別ディスク/別ホストへの
  コピー（オフサイト）を別途運用で確保すること。

### 復元演習（Restore Drill）

```bash
DATABASE_URL="postgresql://<user>@127.0.0.1:5432/dx_idea" npm run backup:drill
```

- `scripts/restore-drill.mjs` が最新のバックアップファイルを一時DB
  （`<dbname>_restore_drill_<timestamp>`）へ復元し、元DBとの主要テーブル行数比較、および
  本番 `GET /api/admin/audit/verify` と同一ロジックによる監査ハッシュチェーン検証を
  行ったうえで一時DBを削除する。結果は `backups/restore-drill-log.tsv` へ追記される。
- 一時DBの作成・削除にはCREATEDB権限が必要なため、アプリ用ロール
  （`DATABASE_URL`の接続ユーザー）ではなく、peer認証のローカル管理ユーザー
  （既定: 実行OSユーザー。`PG_ADMIN_SUPERUSER`で上書き可）で行う。
- 2026-09-06実機検証: `dx_idea_mvp`（23テーブル）で全テーブル行数一致・監査チェーン
  valid:true を確認済み。
- 四半期に1回以上、本番 `dx_idea` に対しても同じ手順で実施し、結果を本ファイルへ記録する。

### RTO/RPO目標

- RTO目標: 4時間 / RPO目標: 直近バックアップの取得間隔（日次実行を推奨。ユーザー承認で確定）。
- 本番切替が必要な障害時は、最新バックアップを別DB（例: `dx_idea_recovered`）へ復元して
  `backup:drill`相当の検証を行い、`DATABASE_URL`（systemdユニットのEnvironment）を
  切り替えたうえでサービス再起動・`release:smoke`で確認する。

### 定期実行（ホスト側cron/systemd timer・任意）

`npm run backup:run` を日次で自動実行する場合は、対象ホストのcrontab等へ以下のように
登録する（このリポジトリのgit管理下には置かない。ホストの運用設定として別途管理する）。

```cron
0 3 * * * cd /path/to/Construction-DX-Idea && DATABASE_URL="postgresql://..." npm run backup:run >> /var/log/dx-idea-backup.log 2>&1
```

- ロールバック手順は `docs/23_release_deploy_runbook.md` §ロールバックを参照。
- 旧・Neon時代の演習スクリプト（`scripts/neon-backup-drill.sh`、`neonctl`ベース）は
  廃止済みのNeon基盤を前提としており、現行のローカルPostgreSQL構成には対応しない。

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
