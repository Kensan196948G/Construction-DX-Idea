# API設計書

## 1. 共通仕様

- すべてのAPIはHTTPSで利用する。
- 認証はCloudflare Accessを前提とする。
- レスポンスはJSON形式とする。
- エラー時は `code`, `message`, `request_id` を返す。

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

## 4. 権限

| API種別 | 一般利用者 | 管理者 | システム管理者 |
|---|---:|---:|---:|
| 自分の下書き作成 | 可 | 可 | 可 |
| アイデア正式登録 | 可 | 可 | 可 |
| ステージ変更 | 不可 | 可 | 可 |
| AI接続設定 | 不可 | 不可 | 可 |
| 監査ログ閲覧 | 不可 | 不可 | 可 |

## 5. ログ出力禁止項目

- APIキー本体
- 認証トークン
- 個人情報を含む原文
- AI送信前の未加工テキスト全文
- Cloudflare管理APIトークン
