# セキュリティ・プライバシー設計書

## 1. 基本原則

APIキーをソースコード、GitHub、WebUI、ブラウザ保存領域、アプリケーションDBへ保存してはならない。APIキーはCloudflareの機密情報管理機能に保存する。

## 2. 認証・認可

- Cloudflare Accessで利用者を認証する。
- 管理画面は管理者ロールに限定する。
- AI接続設定はシステム管理者のみ利用できる。
- 重要操作は監査ログへ記録する。
- Worker APIは `CF-Access-Jwt-Assertion` を検証し、`CF-Access-Authenticated-User-Email` とJWT内メールアドレスが一致する場合だけ利用者として扱う。
- Cloudflare Access JWT検証には `CF_ACCESS_CERTS_URL`、`CF_ACCESS_AUD`、`CF_ACCESS_ISSUER` を設定する。
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
8. API payloadはstrict schemaで検証し、未知フィールド、過長文字列、巨大配列を拒否する。

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

Workerの障害ログでは、Anthropic APIキー、Slack Webhook、Slack token、DATABASE_URL、Bearer token、`api_key`、`token`、`secret`、`password` 形式の値をマスクする。

## 8. MVP制限

MVPでは、会社情報や個人情報を含まないアイデアに利用範囲を限定する。

## 9. 本番API公開前チェック

- Cloudflare Accessの対象URLがWorker API全体を保護している。
- `ALLOWED_ORIGINS` が本番WebUIのURLだけを含んでいる。
- `ADMIN_EMAILS` と `SYSTEM_ADMIN_EMAILS` が実在の管理者メールだけを含んでいる。
- `ALLOW_LOCAL_AUTH_BYPASS` が `false` である。
- Access JWTがない、署名が不正、issuerが不一致、audienceが不一致、期限切れのリクエストは `UNAUTHENTICATED` で拒否される。

## 10. プロンプトインジェクション対策（2026-08-12追加）

- AI呼び出しはsystemメッセージとuserメッセージを分離し、入力データを
  `【入力データ】<<< ... >>>` で区切る。入力中の命令は「処理対象のデータ」として扱う。
- 出力はzodスキーマで検証し、機密情報候補が含まれる場合は保存・登録を停止する。
- プロンプトバージョンは `questions_v2` / `structure_v2` としてAI利用履歴へ記録する。

## 11. ランタイムサプライチェーン（2026-08-12追加）

- React/ReactDOMは `public/design/vendor/` に同梱し、同一オリジンから配信する（SRI一致確認済み）。
- Babelはデザインが `x-import` を使用していないためCDN参照のまま（将来利用時は同様に同梱すること）。

## 12. PII最小化（2026-08-12追加）

- 一覧・評価ボードAPIは、管理者と提出者本人以外へ `submitter_email` を返さない。
- CSVエクスポートは管理者限定のまま、部署・提出者名・調整要否を追加（メールは含めない）。
