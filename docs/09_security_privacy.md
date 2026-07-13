# セキュリティ・プライバシー設計書

## 1. 基本原則

APIキーをソースコード、GitHub、WebUI、ブラウザ保存領域、アプリケーションDBへ保存してはならない。APIキーはCloudflareの機密情報管理機能に保存する。

## 2. 認証・認可

- Cloudflare Accessで利用者を認証する。
- 管理画面は管理者ロールに限定する。
- AI接続設定はシステム管理者のみ利用できる。
- 重要操作は監査ログへ記録する。
- Worker APIは `CF-Access-Jwt-Assertion` を検証し、`CF-Access-Authenticated-User-Email` とJWT内メールアドレスが一致する場合だけ利用者として扱う。
- Cloudflare Access JWT検証には `CF_ACCESS_CERTS_URL` と `CF_ACCESS_AUD` を設定する。
- 管理者は `ADMIN_EMAILS`、システム管理者は `SYSTEM_ADMIN_EMAILS` に明示設定したメールアドレスだけを許可する。
- ローカル開発用の認証バイパスは `ALLOW_LOCAL_AUTH_BYPASS=true` の場合だけ有効とし、本番では必ず `false` にする。
- CORSは `ALLOWED_ORIGINS` と `APP_BASE_URL` に一致するOriginだけを許可する。

## 3. AIへ送信しない情報

- 個人名
- 社員番号
- メールアドレス
- 顧客名
- 案件番号
- 工事名
- 発注者固有情報
- 契約金額
- 認証情報
- IPアドレス
- 未公開事故情報
- 公共工事の非公開情報
- 添付ファイルの原文

## 4. 入力検査

Workerで送信前に以下を行う。

1. 禁止文字列や特定形式を検出する。
2. 個人名・案件番号などの候補を警告する。
3. 必要に応じてマスキングする。
4. AIへ送信した内容のハッシュを保存する。
5. 実行者、モデル、日時、処理種別を記録する。
6. 原文全文をAI処理ログへ残さない。
7. AI応答にも機密情報がないか確認する。

## 5. APIキー管理

| 保管場所 | 判定 | 理由 |
|---|---:|---|
| WebUI JavaScript | 禁止 | ブラウザから確認できる |
| HTML・設定ファイル | 禁止 | 配信物に含まれる |
| GitHub | 禁止 | 誤公開や履歴残存の危険 |
| `.env.example` | キー名のみ可 | 実値は記載しない |
| Neon PostgreSQL | APIキー本体は禁止 | 業務データと機密情報を分離 |
| Cloudflare Worker Secret | 推奨 | Workerだけが参照できる |
| Cloudflare Secrets Store | 運用版で推奨 | 複数サービスや更新管理に適する |

## 6. 管理画面の表示制約

- 保存済みAPIキーは再表示しない。
- 末尾4文字のみ表示する。
- 更新時は新しいキーで置換する。
- 削除時はSecret本体も削除する。
- 接続テスト失敗時は保存しない。

## 7. ログ方針

ログに出してよいもの:

- 実行者
- 処理種別
- 成否
- モデル名
- 文字数
- プロンプトバージョン
- 入力ハッシュ

ログに出してはいけないもの:

- APIキー本体
- 認証トークン
- 個人情報を含む原文
- AIへ送った未加工テキスト全文

## 8. MVP制限

MVPでは、会社情報や個人情報を含まないアイデアに利用範囲を限定する。

## 9. 本番API公開前チェック

- Cloudflare Accessの対象URLがWorker API全体を保護している。
- `ALLOWED_ORIGINS` が本番WebUIのURLだけを含んでいる。
- `ADMIN_EMAILS` と `SYSTEM_ADMIN_EMAILS` が実在の管理者メールだけを含んでいる。
- `ALLOW_LOCAL_AUTH_BYPASS` が `false` である。
- Access JWTがない、署名が不正、audienceが不一致、期限切れのリクエストは `UNAUTHENTICATED` で拒否される。
