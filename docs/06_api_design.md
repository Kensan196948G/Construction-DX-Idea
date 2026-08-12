# API設計書

## 1. 共通仕様

- すべてのAPIはHTTPSで利用する。
- 認証はCloudflare Accessを前提とする。
- レスポンスはJSON形式とする。
- エラー時は `code`, `message`, `request_id` を返す。
- `/api/health` 以外の `/api/*` はCloudflare Access JWTが必要。

## 2. 共通レスポンス例

```json
{
  "ok": false,
  "code": "AI_RATE_LIMITED",
  "message": "AI利用上限に達しました。",
  "request_id": "req_..."
}
```

## 3. エンドポイント

### GET `/api/me`

ログインユーザー情報を返す。

### POST `/api/ideas/drafts`

下書きを保存する。

主要項目:

- raw_issue_summary
- structured_fields
- privacy_flags

### POST `/api/ideas`

正式登録する。成功時はSlack通知を非同期または後続処理で実行する。

レスポンスには `notificationStatus` として `sent`、`skipped`、`failed` のいずれかを含める。

### POST `/api/ai/questions`

不足情報の質問を生成する。

制約:

- AI機能が有効であること
- 利用者の日次上限内であること
- 入力文字数が上限内であること
- 機密情報検査を通過していること

### POST `/api/ai/structure`

会話内容をアイデア構造へ変換する。

### POST `/api/admin/ai-settings/test`

管理者が入力したAPIキーまたは既存Secretを利用して接続テストを行う。

### PATCH `/api/admin/ai-settings`

システム管理者がAIモデル、有効・無効、日次上限、月額予算を更新する。APIキー本体は保存しない。

### GET `/api/ideas/:id/history`

ステージ変更履歴と決定履歴を返す。

### GET `/api/ideas/evaluation`

管理者向け評価ボード。アクティブアイデア（rejected/archived除く）へ優先度スコア
（0〜10点: ステージ・セキュリティ要検討・MVP案・実装方式候補・懸念事項なし・新しさ）を
付与し、スコア降順で返す。

### GET `/api/ideas/export.csv`

全アイデアをCSV（BOM付きUTF-8）で出力する。CSVインジェクション対策済み。

### GET `/api/ideas`

一覧取得。クエリパラメータで `q`（タイトル/対象業務/改善案の部分一致）、
`stage`（ステージ絞り込み）、`limit`（1〜200、デフォルト100）に対応。
管理者以外・提出者本人以外には `submitter_email` を空文字で返す（PII最小化）。

### POST `/api/ideas/:id/stage`

管理者によるステージ変更。`reason`（500文字以内）を受け付け、ステージ履歴と
決定履歴（mvp/production=approve、rejected=reject、archived=archive）へ記録する。
定義済み遷移（draft→submitted、submitted→planning等）以外は `INVALID_STAGE_TRANSITION` で拒否し、
rejected/archived への変更は理由が必須（`STAGE_REASON_REQUIRED`）。

### POST `/api/ideas/drafts` / POST `/api/ideas`

`Idempotency-Key` ヘッダー（8〜128文字の `[A-Za-z0-9_-]`）で冪等登録に対応。
同一キーによる再送は既存レコードを返す（重複登録防止）。

### GET `/api/admin/audit-logs`

システム管理者のみ。`limit`（1〜500、デフォルト100）と `action` で監査ログを取得できる。

### GET `/api/admin/ai-usage`

システム管理者のみ。当月のAI呼び出し数・成功/失敗・概算費用と直近50件の利用明細を返す。

### GET `/api/admin/usage-limits` / PUT `/api/admin/usage-limits`

システム管理者のみ。利用者別・全体のAI利用制限（日次回数・月次予算・有効/無効）を参照・更新できる。

### GET `/api/ideas/:id` / PATCH `/api/ideas/:id`

詳細取得（PII最小化適用）と編集（提出者本人または管理者のみ、`patch` に部分フィールド）。

### GET/POST `/api/ideas/:id/comments`

コメント取得・投稿（本文1〜1000文字、全認証ユーザー可）。

### POST `/api/ideas/:id/request-approval` / POST `/api/ideas/:id/approval`

承認依頼（提出者本人または管理者、承認者メール必須）と承認判定（approve/reject/return、
承認者または管理者、理由必須）。承認依頼中のアイデアはMVP以降へ遷移不可（`APPROVAL_PENDING`）。
依頼・判定はSlack通知（Outbox再送対応）。

### GET `/api/admin/audit-logs/verify`

監査ログのSHA-256ハッシュチェーン整合性を検証する（システム管理者限定）。
`valid` / `checked` / `legacyRows` / `firstBrokenId` を返す。

## 4. 権限

| API種別 | 一般利用者 | 管理者 | システム管理者 |
|---|---:|---:|---:|
| 自分の下書き作成 | 可 | 可 | 可 |
| アイデア正式登録 | 可 | 可 | 可 |
| ステージ変更 | 不可 | 可 | 可 |
| AI接続設定 | 不可 | 不可 | 可 |
| 監査ログ閲覧 | 不可 | 不可 | 可 |
| AI接続テスト | 不可 | 不可 | 可 |
| AI設定更新 | 不可 | 不可 | 可 |

## 5. ログ出力禁止項目

- APIキー本体
- 認証トークン
- 個人情報を含む原文
- AI送信前の未加工テキスト全文
- Cloudflare管理APIトークン
