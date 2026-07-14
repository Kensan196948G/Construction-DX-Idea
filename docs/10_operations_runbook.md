# 運用Runbook

## 1. 日次確認

- AI接続状態を確認する。
- AI利用量が上限に近づいていないか確認する。
- Slack通知失敗がないか確認する。
- 監査ログに異常な操作がないか確認する。
- エラーレート、タイムアウトを確認する。
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
