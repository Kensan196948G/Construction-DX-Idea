# MVP/Prototype デモ手順書

## 1. 公開URL

| 用途 | URL | 状態 |
|---|---|---|
| 本番（既存・変更なし） | https://dxidea.mirai-dx-platform.com | 稼働中（Cloudflare Access認証） |
| **MVP/Prototype（レビュー用）** | **https://dxidea-mvp.mirai-dx-platform.com** | 稼働中（認証なし・ダミーデータ投入済み） |

MVP環境は誰でも開いてすぐ全機能を操作できます。右上に「MVPデモ環境（ダミーデータ）」のバッジが表示されます。

## 2. 環境分離

| 項目 | 本番 | MVP |
|---|---|---|
| Worker | `construction-dx-idea-api` | `construction-dx-idea-api-mvp`（wrangler `env.mvp`） |
| DB | Neon `main` | Neon branch `mvp`（本番データと完全分離） |
| 認証 | Cloudflare Access | `ALLOW_LOCAL_AUTH_BYPASS=true` |
| AI | Claude実API | `demo`プロバイダー（決定的ローカル応答・課金なし・外部送信なし） |
| Slack | webhook接続 | 未接続（通知はoutboxに記録されskipped） |

## 3. ダミーデータ構成（すべて架空）

人物・部署・案件・金額は架空で、メールは予約済みドメイン `demo.example.com` を使用。
実在の個人情報・会社情報・位置情報・電話番号は含まれません。

| テーブル | 件数 | 内容 |
|---|---:|---|
| app_users | 6 | system_admin / admin / user（一般4＋休止1） |
| ideas | 14 | draft〜productionまで全9ステージを網羅（出来形写真、日報、安全書類、測量、重機、検査、資材、天候など） |
| idea_stage_histories | 36 | 各アイデアの正当なステージ遷移履歴 |
| idea_decisions | 7 | approve / reject / return の判定履歴 |
| idea_comments | 6 | 詳細画面のコメント |
| idea_ai_sessions | 4 | AI利用履歴（成功3・失敗1） |
| audit_logs | 26+ | SHA-256ハッシュチェーン付き（verify APIで valid:true） |
| notification_outbox | 2 | sent / failed の例 |
| ai_settings / usage_limits / counters | 各1〜3 | demoプロバイダー設定・利用上限 |

再生成: `DATABASE_URL=<mvp接続URL> node scripts/mvp-seed.mjs --reset`
（`--reset` なしなら冪等upsert。固定UUIDのため何度実行しても重複しない）

## 4. デモ手順（画面）

1. **ダッシュボード**: 総数14件・アクティブ12件・ステージ分布・セキュリティ警告を確認。
2. **困りごと入力**: 例「現場の紙書類の転記に時間がかかる」→ 入力検査 →「AIに壁打ちする」。
   デモAIが3問を生成（purposeに `[デモAI]` 表示）→ 構造化確認画面へ。
3. **下書き保存 → 正式登録**: 提出者メールを入れても保存できる（PRIVACY_BLOCKED不具合の修正済み確認）。
4. **一覧・検索**: 「写真」「日報」でサーバーサイド検索。
5. **詳細**: コメント追加、編集、履歴（ステージ＋判定）を確認。
6. **承認フロー**: 承認依頼 → 承認者で approve / reject / return。理由必須とステージ遷移ガードを確認。
7. **ステージ管理**: 管理者操作でステージ変更（却下・保管は理由必須）。
8. **評価ボード**: 優先度スコア0〜10順の一覧とスコア理由。
9. **CSV / Excel出力**: 一覧・評価ボードのダウンロードボタン。
10. **AI設定**: システム管理者画面で demoプロバイダー・接続テスト（外部呼び出しなし）。
11. **ユーザー管理**: 追加・編集・ロール変更・休止・削除（自分自身の変更は拒否）。
12. **監査ログ**: 一覧・CSV/Excel/HTMLエクスポート・ハッシュチェーン検証（valid:true）。

## 5. 運用コマンド

```bash
# ローカル起動（モックAPI）
npm run dev

# 検証一式（lint / test / build×2 / security scan）
mkdir -p /tmp/cdx-verify && TMPDIR=/tmp/cdx-verify npm run verify

# MVPビルド・dry-run・デプロイ
npm run mvp:dry-run
npm run mvp:deploy

# MVPダミーデータ投入（DATABASE_URLはMVPブランチ接続URL。秘密として扱う）
DATABASE_URL="<postgres://...>" npm run mvp:seed

# デプロイ済みMVPのスモーク（読み取り専用・冪等）
SMOKE_API_BASE_URL=https://dxidea-mvp.mirai-dx-platform.com/api npm run mvp:smoke
```

## 6. 既知の制約

- **レート制限**: `ALLOW_LOCAL_AUTH_BYPASS` 時の書き込み制限（60回/分/IP）はWorkerプロセスの
  per-isolateカウンタのため、複数isolateへ分散すると閾値未満で制限がかからないことがある。
  公開MVPの保護は「ダミーデータのみ・Secretなし・AI課金なし」という設計で担保し、
  本格的な公開にはWAFレート制限/認証の導入を推奨する。
- **CSP**: standaloneデザインが `new Function` を使用するため、厳格なCSPは未適用
  （`X-Frame-Options: SAMEORIGIN`、nosniff等のヘッダーは適用済み）。
- **AI**: MVPのAI応答はデモ用の決定的ローカル生成であり、実Claude/DeepSeekの品質を示すものではない。
- **Slack通知**: MVPではwebhook未接続のため通知はskipped。outbox/再送ロジックは本番と同一コード。
- **監査チェーン**: 追記は同一isolate内で直列化。複数isolateにまたがる同時追記は競合し得るが、
  verify APIが検出する（`/api/admin/audit-logs/verify`）。本番はWebSocketドライバ＋advisory lock化を推奨。

## 7. 完了条件との対応

- P0: 0件（本サイクルで発見した重大バグ3件は修正・検証済み）
- 主要P1: 環境分離・ダミーデータ・demo AI・登録フロー・冪等同期を解決。ライセンスのみユーザー判断として報告
- 主要ユースケース実動作: 上記デモ手順のとおりAPI/UIで確認
- UI/API/DB整合: seedデータと評価ボード・検索・監査verifyで確認
- テスト・CI: `npm run verify`（test 68件）PASS、CIにauditとmvp:dry-runを追加
