# 追加実装機能バックログ（2026-09-05時点・ローカルPostgreSQL基盤 確定版）

> 本ドキュメントは、Construction-DX-Idea を「AI活用型 DX Idea-to-Value / Portfolio Governance
> Platform」へ進化させるための **追加実装すべき機能の完全リスト** である。
> 調査時点: main `b08a938`（#52〜#59 反映済み）、`npm run verify` PASS（test 107件）。
> 基盤: **DB = ローカル PostgreSQL（Neon は 2026-08-31 廃止済み）**、配信 = Cloudflare Tunnel →
> ローカル systemd（`dx-idea-api.service` / `dx-idea-mvp-api.service`）→ `127.0.0.1:5432`
> （本番 `dx_idea` / MVP `dx_idea_mvp`）。API コードは Worker 互換のまま
> `worker/index.ts` が単一ソース（ドライバ自動選択: `neon.tech` 以外は postgres.js TCP）。

## 0. 前提の更新（過去カタログとの差分）

過去に提示した「追加実装機能カタログ（553項目）」のうち、**下記は本調査時点で実装済み**
のため、追加実装の対象から除外する（ただし完全性のため §1 に記録する）。

- **P0 ① Gate1〜5統合WebUI ＋ 複数Authority共同承認 ＋ SoDチェック** → 実装済み
  （migration 008/009 + PR #54/#57/#58。Gate承認フローUI・申請/承認/差戻し/却下・
  Authority別必要承認・SoD 403 を実機確認）
- **P0 ④ 20フェーズ進捗管理** → 実装済み（migration 010 + PR #59。Phase 1〜20・
  stage→phase 後方互換初期化・前進/管理者後戻り・履歴・UI表示）
- 案件ID `DX-YYYY-NNNN`（migration 006 / PR #52）
- Authority（Business / Domain / Engineering）ロール（migration 007 / PR #53）
- **DB ローカル PostgreSQL 移行**（PR #34/#57。Neon 廃止・ドライバ自動選択・jsonb 直接バインド修正）
- 承認フロー・コメント・編集・履歴・検索・評価ボード・CSV/Excel/HTML 出力
- 監査 SHA-256 ハッシュチェーン＋verify・毎時/週次 cron・Slack 通知（新規登録/ステージ/承認/
  障害アラート/監査チェーン不正/週次ダイジェスト）
- ユーザー管理（app_users CRUD・ロール・有効/無効）・AI設定（Claude/DeepSeek・モデル許可リスト）
- PWA（manifest/sw）・オフライン下書きキュー（Idempotency-Key 対応）※ただし localStorage ベース

## 1. 実装済み機能（2026-09-05時点）＝ 追加実装の対象外

| 領域 | 実装済み内容 |
|---|---|
| 基盤 | migration 001〜010 適用済み（本番 `dx_idea` も 001-010 適用済み） |
| アイデア | 困りごと入力・入力検査・AI質問（最大3問）・AI構造化・手動フォールバック・下書き/正式登録（冪等）・編集・詳細・コメント |
| 案件ID | `DX-YYYY-NNNN` 自動採番 |
| Authority | Business / Domain / Engineering ＋ ロール判定（DBロール優先） |
| Gate | Gate1〜5 多段階承認バックエンド＋統合WebUI。Gate別必要Authority組合せ（`gateAuthorityPolicy`）・全Authority承認で通過・`evaluateGateSoD`（申請者≠承認者・提案者≠承認者） |
| Phase | 20フェーズ Idea-to-Value（`ideaValuePhases`、migration 010、API + WebUI） |
| 監査 | SHA-256 ハッシュチェーン・verify API・CSV/Excel/HTML エクスポート・毎時不正検知＋Slack通知 |
| 通知 | Slack（登録/ステージ変更/承認依頼/判定/毎時アラート/週次SUNレポート）・Outbox 再送（10分cron） |
| 管理 | app_users CRUD・AI設定（Claude/DeepSeek・モデル許可リスト・接続テスト）・利用制限・AI利用量 |
| UI | standalone HTML 正本 ＋ React ブリッジ（ダッシュボード/一覧/詳細/評価ボード/AI設定/監査/ユーザー管理/Gate/Phase） |
| PWA | manifest・Service Worker・オフライン下書き（localStorage） |
| セキュリティ | Cloudflare Access JWT・レート制限・CORS・Secretマスキング・入力検査・PII最小化・ボディ上限413 |
| インフラ | ローカルPostgreSQL（postgres.js）・systemd・Cloudflare Tunnel・毎時/毎時10分/週次 cron |

## 2. 追加で実装すべき機能（完全リスト）

凡例: 【P0】= 次に着手すべき最重要 / 【P1】= 主要機能 / 【P2】= 拡張・統合 / 【P3】= 後続
元カタログNo（#nn）は過去提示リストとの対応参照。

### 2.0 最優先（残る P0 群）

- 【P0】RAG・類似アイデア検索・重複判定（元#46〜65、GitHub Issue #13）
- 【P0】AI根拠・引用・信頼度表示（元#45/#63/#64）
- 【P0】AI品質 Eval・ゴールデンデータセット（元#373〜375、Issue #13）
- 【P0】DX案件ポートフォリオ（元#93〜122）
- 【P0】KPI・ROI・Benefit Realization（元#123〜148）
- 【P0】情報区分・公開制御（元#377〜381 ほか）
- 【P0】Gate 高度化の残り（条件付き承認・期限/Reminder/Escalation・代理承認、元#155〜181）

### 2.1 アイデア受付・入力支援（元#1〜20）

- 【P1】音声入力・音声→テキスト（現場）
- 【P1】スマホ写真添付・PDF/Excel/Word/画像添付（オブジェクトストレージ or DB bytea 方針の決定）
- 【P2】メール転送による登録・QRコード現場受付
- 【P2】匿名提案モード・代理登録
- 【P1】オフライン下書きの IndexedDB 化＋写真/音声キュー＋復帰同期（現状 localStorage のみ。Issue #11）
- 【P2】AIによる不足項目質問（既存の「最大3問」を項目別・職種別テンプレ化へ拡張）
- 【P2】現場/技術/営業/管理/IT 別入力テンプレート
- 【P2】類似アイデア入力時のリアルタイム警告（＝類似検索RAGと連動）
- 【P2】入力途中の既存システム候補提示・自動マスキング候補
- 【P1】困りごと原文の保持＋AI整理後との差分表示

### 2.2 AI壁打ち・Idea Agent（元#21〜45）

- 【P0】Idea Agent 化（Orchestrator＋専門Agent、元#225〜241 へ発展）
- 【P1】5W1H自動整理・As-Is/To-Be 案・真因分析・業務フロー推定・ボトルネック分析
- 【P1】解決方法候補生成（AI不要/Excel改善/既存システム活用/ノーコード/内製/SaaS の比較）
- 【P0】「そもそもシステム化不要」判定の明示
- 【P1】MVP案・PoC案生成・必要データ整理・関係部署/想定利用者候補
- 【P1】リスク候補・KPI候補・効果測定方法・概算工数/費用レンジ・実現難易度判定
- 【P0】AI回答の信頼度表示・根拠・引用（RAG と一体）

### 2.3 RAG・既存資産・重複排除（元#46〜65・Issue #13）※ローカルPostgreSQLで本格実装可能

- 【P0】過去アイデア/PoC/採用案件/却下案件＋却下理由の検索
- 【P0】既存社内システム・過去Decision Log・類似業務/部署/技術の検索
- 【P0】重複率算出・「統合候補」「既存案件へ追加」「新規案件」の判定
- 【P0】根拠文書リンク・引用表示・RAG検索履歴
- 【技術】pgvector（埋め込み類似）＋ pg_trgm（日本語部分一致）＋ tsvector（全文検索）を
  ローカルPGで利用。埋め込みAPI（Claude/DeepSeek エンベッディング or ローカルモデル）の選定が必要

### 2.4 AI評価・スコアリング（元#66〜92）

- 【P1】Business/Domain/Engineering Value Score・Feasibility・ROI 等の複合スコア体系
  （現状は evaluationScore（0-10）のみ）
- 【P1】AI推奨順位と人間評価（3 Authority＋Gate）との差異表示
- 【P1】スコア根拠の記録（どの入力から導いたか）

### 2.5 DX案件ポートフォリオ（元#93〜122）

- 【P0】案件ポートフォリオ一覧（部署/工種/地域/担当者別・Stage/Gate別件数）
- 【P0】Idea Funnel（アイデア→PoC→本番化の転換率）
- 【P0】Value×Effort・Risk×Return・Bubble Chart・年間/四半期ロードマップ
- 【P1】高ROI/Quick Win/Strategic/停滞/保留案件ビュー・開発キャパシティ表示
- 【P1】投資額/見込削減額/削減時間・Portfolio ROI・本番化率

### 2.6 KPI・ROI・Benefit Realization（元#123〜148）

- 【P0】Baseline登録（現状工数/コスト/件数/品質）→ 目標値 → 本番後実績 → Before/After
- 【P0】ROI・Payback Period・定量/定性効果・利用率・満足度
- 【P1】未達理由・改善Action・継続/改善/停止判定
- 【P1】3/6/12か月レビュー（リマインダー含む）

### 2.7 Gate 高度化（元#149〜181）※基本フロー+第1弾は実装済み（migration 014・2026-09-05）

- 【実装済】条件付き承認（approve時の conditionNote/conditionMet 記録と詳細・滞留分析での表示。充足追跡の手動更新は残）
- 【実装済】承認期限（dueAt・既定5日後・過去日時400）・Reminder（期限2日以内）/Escalation（期限超過・期限未設定7日超滞留）・代理承認（delegateTo）。※不在設定は残
- 【実装済】Gate Dashboard（滞留・期限・リマインダー/エスカレーション実績の一覧画面「Gate滞留分析」+手動実行API `POST /api/admin/gates/reminders/run`）
- 【P1】承認順序（直列/並列/全員/過半数）・Gate Owner
- 【P1】Gate Checklist・必須文書確認・Evidence添付・条件充足の確認フロー
- 【P1】承認者への個別通知先（Slack DM/メール）と不在設定（Delegate Calendar）

### 2.8 SoD・Authority・組織統制（元#182〜204）※SoD自己承認禁止は実装済み

- 【P1】Security Reviewer / Data Owner / System Owner / QA / Release Approver 等のロール拡張と
  Gate別必要ロール設定の柔軟化
- 【P1】権限期限・一時権限・部署変更/人事異動時の権限見直し・Owner引継ぎ
- 【P2】代理承認記録・Authority競合検知の拡充

### 2.9 20フェーズの運用拡張（元#205〜224）※基本は実装済み

- 【P1】フェーズ別「次の必要Action」の自動提示（現在はメモ欄。テンプレート化へ）
- 【P1】フェーズ別必須成果物・チェックリスト
- 【P2】Blocker（承認待ち/情報待ち）の明示と一覧化

### 2.10 AI Agent 組織（元#225〜241）

- 【P1】AI Orchestrator ＋ Idea/Planning/BA/Domain/Requirement/Architecture/Security/
  Privacy/Data Governance/Coding/QA/Release/Operations/KPI/Knowledge/Risk/Compliance Agent の
  ルーティング（UI は「AIアシスタント」1つに見せる）
- 【P2】Agentごとのモデル/プロンプト管理（§2.14 と一体）

### 2.11 企画・要件・設計文書の自動生成（元#243〜269）

- 【P1】1ページ企画概要・DX企画書・As-Is/To-Be・Business Case・ROI試算・KPI定義
- 【P1】PoC/MVP計画書・要件/要求仕様・非機能/データ/セキュリティ要件
- 【P1】Architecture概要・詳細設計・テスト/UAT計画・Release計画
- 【P2】運用設計・Runbook・利用者マニュアル・Gate審査資料・完了/効果測定報告・Lessons Learned
- 【P1】文書ライフサイクル: AI生成 → 人間レビュー → Approved版固定（版管理・署名）

### 2.12 GitHub Engineering 連携（元#270〜291）

- 【P1】案件→Repo作成/紐付け・Issue自動生成（Requirement/Risk→Issue）・Milestone
- 【P1】PR/レビュー/CI/Security Scan/Dependabot/Release 状態の案件画面への統合
- 【P1】Commit/PR/Release → 案件ID（`DX-YYYY-NNNN`）紐付け・Evidence自動収集
- 【P2】GitHub Project 連携

### 2.13 AppSuite / desknet's NEO Workflow 連携（元#292〜306）

- 【P1】AppSuite 案件登録・双方向同期（案件ID/Owner/Phase/KPI/Gate）
- 【P1】Workflow 申請生成・結果取得・承認者同期・差戻し同期・Evidence保存
- 【P2】同期失敗キュー・再送・差分監視

### 2.14 AI Governance（元#347〜376）※一部実装済み（プロバイダ切替/モデル許可/利用制限/レート制限）

- 【P1】Provider/Model Registry・用途別モデル選択・Prompt Registry（version/承認）
- 【P1】Token Budget（案件別/部署別）・コスト実績・Fallback・Circuit Breaker・障害時Human Mode
- 【P1】AI Decision Log・Groundedness/Citation/スキーマ/Bias/Injection/PII Eval
- 【P0】Regression Eval・Golden Dataset・モデル変更前後比較（Issue #13 と一体）

### 2.15 通知拡張（元#307〜325）※Slack 基本・週次は実装済み

- 【P1】案件別 Slack Channel・Gate申請/結果通知（Gate は API 実装済み・通知が残）
- 【P2】Mention・期限/遅延通知・KPIレビュー通知・Monthly Portfolio Digest
- 【P1】Outlook/Gmail 通知・通知 Preference（即時/日次/週次・抑制）

### 2.16 Knowledge Management（元#326〜346）

- 【P1】Knowledge Candidate 自動抽出（Decision/Problem-Solution/Lessons/ADR/Best Practice/Runbook/FAQ）
- 【P1】Review Queue・Human Approval・Notion 昇格連携
- 【P2】Knowledge Owner・有効期限・Superseded/Archived・重複統合・品質Score・再利用回数

### 2.17 セキュリティ・情報区分・公開制御（元#377〜400・Issue #12 と一部重複）

- 【P0】案件単位のデータ分類（Public / Internal / Confidential / Restricted）と
  表示・エクスポート・通知への伝播（access control）
- 【P1】個人情報/機密タグ・添付Virus Scan・ファイル形式制限・DLPチェック
- 【P1】AI送信前マスキング（入力検査は実装済み。保存データへの適用を拡張）・Provider送信可否Policy
- 【P2】Retention Policy・自動削除・Legal Hold・Export/Download/IP制御・権限棚卸
- 【P1】監査ログの CSV/Excel/HTML は実装済み → Audit Timeline UI・ログイン履歴・Evidence Package（元#401〜419）

### 2.18 現場モバイル・PWA 完成（元#420〜435・Issue #11）

- 【P1】IndexedDB キュー・写真撮影・音声入力・通信/同期状態表示・再同期ボタン
- 【P2】現場位置情報・QR案件呼出し・大型ボタンUI・添付圧縮・写真AI説明

### 2.19 PoC・MVP・UAT 管理（元#436〜453）

- 【P1】PoC Hypothesis・Success Criteria・MVP Scope（In/Out）・Test User/Scenario
- 【P1】Feedback収集（5段階+Free Comment）・Defect/Improvement Request・UAT Checklist・Acceptance Result
- 【P1】AI Feedback要約・Go/No-Go提案・Gate3資料自動生成

### 2.20 本番・運用管理（元#454〜472）

- 【P1】Production Status・System/Service Owner・URL・Version・Release Date
- 【P1】SLA/SLO・Error Rate・Availability・AI Cost・Active User・Adoption Rate
- 【P2】Incident/Problem/Change リンク・Maintenance/EOL・廃止フロー

### 2.21 Observability（元#473〜490・Issue #7）

- 【P1】System Health Dashboard（API/DB/AI/Slack/キュー深度/Token/コスト）としきい値設定UI
- 【P2】Alert Rule 管理・Weekly Ops Report・Monthly Trend

### 2.22 BCP・バックアップ（元#491〜502・Issue #8）※移行後ローカルPG前提で再設計が必要

- 【P1】pg_dump/pg_restore による定期バックアップ・RPO/RTO の定義と記録
- 【P1】Restore Test・Restore Smoke・Quarterly Drill・Drill Evidence・Backup Alert
- 【P2】Failover Procedure・Recovery Runbook（systemd＋Tunnel 構成向け）

### 2.23 検索・分析拡張（元#503〜523）

- 【P1】Semantic Search（pgvector）・案件ID/タグ/部署/担当/Owner/Authority/Stage/Gate/
  Status/Score/Risk/Date/ROI/Technology による複合フィルタ
- 【P2】Saved Filter・My View・Shared View

### 2.24 ダッシュボード群（元#524〜537）

- 【P1】Manager/Business/Domain/Engineering/Executive 向けロール別ダッシュボード
- 【P1】Portfolio・Gate・KPI・AI Usage ダッシュボード（§2.5/2.6/2.21 の表示面）

### 2.25 ユーザー・組織管理（元#538〜553）

- 【P1】組織/部署/支店マスタ・Group/Team・Project Member
- 【P1】Delegate・Effective/Expiration Date・Inactive User・Owner Transfer・Bulk Import
- 【P2】Entra ID 連携（将来）
- 【P1】運用: 管理者メールの会社ドメイン複数化（Issue #9）

## 3. ローカルPostgreSQL移行で新たに可能/推奨になる技術事項（元カタログ外）

- **pgvector**: 類似アイデア検索・Semantic Search・RAG を DB 内で完結（外部ベクトルDB不要）
- **pg_trgm / tsvector**: 日本語のあいまい検索・全文検索の高速化（現状は LIKE ベースの q 検索のみ）
- **pg_cron**: バックアップ・集計・通知の定期処理を DB 側でも実行可能に
- **監査ログのパーティショニング**: 監査・履歴テーブルの肥大対策
- **バックアップ設計の刷新**: Neon ブランチ依存の廃止 → pg_dump/pg_restore・PITR 設定（RPO/RTO）
- **テスト分離**: `dx_idea_test` 等を使ったローカル統合テスト拡充（現在は E2E スクリプトが主体）
- **接続管理**: postgres.js プール設定・PgBouncer 導入是非の検討（本格運用時）
- **@neondatabase/serverless 依存の撤去**: ローカルPG一本化後のクリーンアップ候補（動作は postgres.js に切替済み）
- **スキーマ管理ツールの見直し**: 現行は生SQL+migrate-local スクリプト。フェーズ/権限/評価の
  テーブル追加が増えるため、マイグレーション管理の強化（バージョン表・ロールバック方針）を検討

## 4. 推奨実装順序

### Phase A（直近: P0 残り・「会社として使える」を完成）
1. **RAG・類似アイデア検索・重複判定**（pgvector/pg_trgm 基盤、Issue #13）
2. **AI根拠・引用・信頼度表示**（RAG の結果表示と一体）
3. **AI品質 Eval・Golden Dataset・回帰試験**（Issue #13）
4. **情報区分・公開制御**（データ分類とアクセス伝播。セキュリティ面で早めに）

### Phase B（価値管理）
5. **DX案件ポートフォリオ**（Funnel・Value×Effort・Risk×Return・ロードマップ）
6. **KPI・ROI・Benefit Realization**（Baseline→実績→判定→レビュー）

### Phase C（開発・本番接続）
7. **Gate 高度化**（期限/Reminder/代理/条件付き/Evidence）
8. **GitHub 連携**（案件ID紐付け・状態可視化・Evidence自動収集）
9. **PoC/MVP/UAT 管理**・**自動文書生成**（Gate3資料等）

### Phase D（循環・統制）
10. **Knowledge Management**（AI抽出→人間レビュー→Notion 昇格→RAG へ再利用）
11. **AI Governance・AI Agent 組織**
12. **通知拡張・AppSuite/Workflow 連携・Observability・BCP・現場モバイル完成**

## 5. 対応する GitHub Issue（2026-09-05時点 Open）

| Issue | 内容 | 本バックログとの関係 |
|---|---|---|
| #13 | RAG・類似アイデア検出・AI評価(eval) | §2.3/§2.4/§2.14（P0） |
| #11 | モバイル/PWA/オフライン対応 | §2.1/§2.18（IndexedDB・写真・音声） |
| #12 | 外部連携（SharePoint/Teams/Excelインポート） | §2.13/§2.17（Excelインポートは未） |
| #7 | 障害アラートと監視ダッシュボード | §2.21（しきい値UI・Health Dashboard） |
| #8 | バックアップ/復旧演習の定期実施 | §2.22（ローカルPG向け再設計） |
| #6/#10 | Slack通知本番確認・監査チェーン本番適用 | 運用確認タスク |
| #9 | 管理者メールの会社ドメイン複数化 | §2.25 |

## 6. 補足: 現行UIの構造（追加実装の実装先）

- 画面は `Construction DX Idea (standalone).html` を正本とし、`src/App.tsx` がブリッジ。
  詳細ビューには既に「🚪 Gate1〜5 承認フロー」カード・「🧭 Idea-to-Value 進捗」カードがある。
- 新機能のUIは「standalone HTML にカード/画面追加 → App.tsx ブリッジ → api.ts/mockApi.ts/
  standaloneBridge.ts 同期」のパターンで追加する（#58/#59 と同方式）。
- テーブル追加は `migrations/` へ連番 SQL（001〜010 まで適用済み。次は 011）。
