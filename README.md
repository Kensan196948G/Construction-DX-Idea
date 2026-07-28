# 🏗️ Construction-DX-Idea

## 🤖 AI活用型DXアイデア管理システム構想

![Status](https://img.shields.io/badge/status-Release%20Ready-brightgreen)
![Target](https://img.shields.io/badge/target-construction%20DX-green)
![AI](https://img.shields.io/badge/AI-Claude%20API-purple)
![Infra](https://img.shields.io/badge/infra-Cloudflare%20%2B%20Neon-orange)
![Docs](https://img.shields.io/badge/docs-ready-brightgreen)

`Construction-DX-Idea` は、土木建設の現場・技術・管理業務で出てくる「困りごと」を、AIとの壁打ちで整理し、DXアイデアとして登録・評価・進捗管理するためのWebシステム構想です。

> **基本方針:** 入力・AI整理・進捗管理は `Construction-DX-Idea`、周知・議論は Slack で行います。

---

## 🚦 現在の実装ステータス

| 領域 | 状態 | 実装内容 |
|---|---|---|
| 🖥️ WebUI | デザイン適用済み / 主要機能ブリッジ済み | `Construction DX Idea (standalone).html` を正本として100%表示。困りごと入力、入力検査、AI質問、構造化、下書き保存、正式登録、ステージ変更、AI設定をWorker APIへ接続 |
| ⚙️ Backend API | 実装済み | Cloudflare Workers + Hono API、Cloudflare Access JWT検証、AI利用制御、監査ログ、Slack通知・再送 |
| 🗄️ Database | 実装済み | Neon PostgreSQL向け初期SQLマイグレーション |
| 🤖 AI連携 | 実装済み | Claude API呼び出し、最大3問の質問生成、構造化、プロンプトバージョン記録 |
| 🔐 Security | 実装済み | Secret分離、Access JWT検証、AI接続テスト、入力検査、マスキング、利用上限、ログ秘匿、ローカルSecretスキャン |
| 🧪 Verify | 通過 | `npm run verify`、`npm run worker:deploy:dry-run`、CORS/ロール判定テスト、Secretスキャン |
| 🌐 Release | 🎉 **Production Ready — 本番フル稼働＋AI有効**（2026-07-28更新） | 本番URL: **https://dxidea.mirai-dx-platform.com**。Cloudflare Access認証（管理者メール+`mirai-const.co.jp`ドメイン許可）、Neon DB接続、管理者ロール判定まで全部動作。**AI機能有効化済み**（`AI_ENABLED=true`、`ANTHROPIC_API_KEY` Secret登録済み、モデル `claude-sonnet-5`、接続テスト成功）。保守フェーズ（`phase_mode=maintenance`） |
| 📌 GitHub Projects | 更新済み | [Construction-DX-Idea 開発司令盤](https://github.com/users/Kensan196948G/projects/42) |

```mermaid
flowchart TD
    M["Monitor<br/>DNS/設定チェック"] --> V["Verify<br/>verify + predeploy"]
    V --> G["Gate試行<br/>release:gate"]
    G --> S["Smoke試行<br/>release:smoke"]
    S --> I["改善<br/>インフラ接続待ち"]
    I --> M
```

## 📊 リリースゲート監視（最新）

| 日時 (JST) | 項目 | 結果 |
|---|---|---|
| 2026-07-14 | `npm run verify` | ✅ PASS（lint / test 24件 / build / build:production-api / security:scan） |
| 2026-07-14 | PR #9 Codex review | ✅ 指摘1件（環境変数伝播）修正済み |
| 2026-07-14 | PR #9 CodeRabbit review | ✅ 12件中11件対応済み（残り1件はセッション自動実行トリガーの設計判断で現状維持と確定） |
| 2026-07-14 | PR #9 → `main` | ✅ squash merge 完了（`53ca40b`） |
| 2026-07-14 | `npm run release:smoke` / `release:gate` | 🚫 BLOCKED（DNS解決不能: `dxidea.mirai-dx-platform.com` 未登録） |
| 2026-07-14 | PR #10 → `main` | ✅ squash merge 完了（`366091e`）。state.json/README.mdの状態同期のみ、コード変更なし |
| 2026-07-14 | main HEAD (`366091e`) 再検証 | ✅ `npm run verify` 全PASS・`npm run worker:deploy:dry-run` PASS |
| 2026-07-14 | **Release Ready 判断** | ✅ CTOが自律実行できる範囲（実装・テスト・CI・レビュー・runbook整備）は完了。残作業は人間による外部インフラ操作のみ（`docs/23_release_deploy_runbook.md` §12） |
| 2026-07-21 | wrangler認証 | ✅ 解消（`CLOUDFLARE_API_TOKEN` 設定済み、`release:monitor` の wrangler auth PASS） |
| 2026-07-21 | `npm run verify` / `worker:deploy:dry-run` | ✅ PASS（同一オリジン `[assets]` 構成で dist 7ファイル認識） |
| 2026-07-21 | `RELEASE_STAGE` 段階モード検証 | ✅ PASS（pre-access緩和 / full従来動作 / 不正値fail-fast / placeholder拒否） |
| 2026-07-21 | `RELEASE_STAGE=pre-access npm run release:monitor` | ✅ PASS 9チェック（DNS未解決は初回デプロイ前の想定内として許容） |
| 2026-07-21 | `wrangler dev` ローカル実動 | 🚫 BLOCKED（workerdが開発機sandboxで起動不可。dry-run＋デプロイ後smokeで代替） |
| 2026-07-21 | **Stage A本番デプロイ** | 🚀 完了。PR #18 merge（`2da4055`）→ tag `v0.1.0` → Neon作成+migration（11テーブル）→ `release:deploy`（Version `eb7807c5`、custom domain自動登録） |
| 2026-07-21 | デプロイ後smoke / `release:gate` | ✅ PASS（`GET /` HTML 200+識別子、`/api/health` 200、`/api/me` 401、境界401。gateフル通過） |
| 2026-07-21 | **Stage B完了（Production Ready）** | 🎉 Access有効化（PR #22）→ フロント404バグ修正（PR #24、Issue #23）→ `DATABASE_URL`投入 → 実ユーザーE2Eで全API 200・`wrangler tail`エラー0件 |
| 2026-07-28 | **AI利用設定の修正＋AI機能有効化** | 🚀 PR #29（接続テスト修正・リセットボタン・キー状態表示、Issue #28）→ `ANTHROPIC_API_KEY` Secret登録（人間実行）→ PR #31（モデルIDをClaude 5世代へ統一、Issue #30）。本番で接続テスト成功・保存成功を`wrangler tail`で確認（エラー0件） |
| 2026-07-28 | 保守サイクル（security/堅牢化） | ✅ Neon整合性確認（ideas 0件・ai_settings connected・通知失敗0件）。`release:monitor` 13/14 PASS（DATABASE_URLはSecret非保持設計のためローカル未設定=想定内）。`npm audit` 本番依存0件、eslint 10更新でdev含め0件達成 |

<details>
<summary>2026-07-13 詳細ログ（折りたたみ）</summary>

`npm run verify` / `predeploy:check`（疑似値）/ `worker:deploy:dry-run` は終日PASS。`release:smoke` / `release:gate` / `release:monitor` は終日一貫して同一原因（Cloudflare DNS未登録 `dxidea.mirai-dx-platform.com` + `wrangler` 未認証）でBLOCKED。`code-review --fix` はコマンド未導入のため未実施。詳細は `docs/24_autonomous_cto_execution_log.md` を参照。

</details>

> ✅ 上記のBLOCKED（2026-07-14時点の外部インフラ未設定）は、2026-07-21のStage A/Bデプロイで全て解消済みです（履歴として保持。経緯は [Issue #6](https://github.com/Kensan196948G/Construction-DX-Idea/issues/6)）。

## 4. 付随ゲート（補足）

`npm run -s test` はNode v25.2.1 + tsxの組み合わせで、既定のTMPDIR（長いセッションUUID付きパス）だとテストランナー間通信用Unix domain socketのパス長制限に抵触し `listen EPERM` で未完走になります。`TMPDIR=<短いパス、例: /tmp/cdx-verify> npm run -s test`（または `verify`）と短いTMPDIRを指定することで回避できます（上表 16:44 の実行例を参照）。`npm run -s lint` / `npm run security:scan` は既定設定のままPASSです。

```mermaid
flowchart LR
    M["Monitor"] --> D["Development"]
    D --> V["Verify"]
    V --> I["Improvement"]
    I --> M
    V --> G["Release Gate"]
```

## 🚀 ローカル起動

```bash
npm install
npm run dev
```

起動後、表示された `http://<IPアドレス>:<ポート番号>/` を開きます。ローカルWebUIは初期状態ではモックAPIで動作します。

### 検証コマンド

| コマンド | 内容 |
|---|---|
| `npm run lint` | TypeScript/React/Workerの静的検査 |
| `npm run test` | 入力検査・マスキングのテスト |
| `npm run build` | TypeScriptビルドとVite本番ビルド |
| `npm run build:production-api` | モックを無効化した本番API向けビルド |
| `npm run security:scan` | Secret混入の簡易検査 |
| `npm run verify` | lint、test、通常build、本番API build、security scanを一括実行 |
| `npm run worker:deploy:dry-run` | Cloudflare Workerのデプロイ直前dry-run |
| `npm run predeploy:check` | 本番環境値のplaceholder、モックAPI、Access設定漏れを検査 |
| `npm run release:monitor` | リリース監査（必須変数、wrangler auth、DNS到達性） |
| `npm run release:smoke` | 実環境URL向け API E2E スモーク確認 |
| `npm run release:gate` | `release:monitor` + `release:prepare` + `release:smoke`（本番環境前提の事前ゲート） |
| `npm run release:prepare` | 本番向けprepare（ビルド+predeploy+dry-run） |
| `npm run release:deploy` | デプロイ（monitor + prepare）→ `wrangler deploy`（Worker+SPA静的アセットを同一オリジンで反映）→ `release:smoke`。Stage A（Access未設定の外殻公開）は `RELEASE_STAGE=pre-access npm run release:deploy` で実行 |

---

## 👥 1. 非エンジニア向け

このシステムは、難しいDX用語を知らなくても使える「困りごと投稿・整理ツール」です。

利用者は、まず「何に困っているか」をWeb画面に入力します。AIが追加で質問し、内容を「課題」「対象業務」「改善案」「期待効果」「MVP案」などに整理します。最後は必ず人が確認してから登録します。

```mermaid
flowchart LR
    A["😟 困りごとを書く"] --> B["🤖 AIが質問する"]
    B --> C["📝 AIが整理する"]
    C --> D["👤 人が確認する"]
    D --> E["💡 DXアイデアとして登録"]
    E --> F["📣 Slackへ通知"]
```

---

## 👷 2. 土木建設現場管理者向け

現場で起きている「紙が多い」「Excel転記が多い」「写真整理が大変」「報告が二重入力になる」といった問題を、現場目線のまま登録できます。

登録時に求めるのは、完成した解決策ではありません。現場の事実です。

| 入力すること | 例 |
|---|---|
| どの仕事で困っているか | 出来形写真の整理、日報作成、協力会社への連絡 |
| 誰が困っているか | 現場代理人、主任技術者、測量担当、事務担当 |
| 今のやり方 | 紙、Excel、写真フォルダ、既存システム |
| 改善したい状態 | 転記を減らしたい、探す時間を短くしたい、共有漏れをなくしたい |

```mermaid
flowchart TD
    A["📱 WebUI"] --> B["現場の困りごと"]
    B --> C["AIによる聞き取り"]
    C --> D["確認・修正"]
    D --> E["登録"]
    E --> F["検討ステージ管理"]
```

---

## 🧑‍💼 3. 土木建設技術者向け

技術者は、登録されたアイデアを業務・データ・実現方式の観点から検討できます。

AIは、以下の整理を支援します。

- 対象業務の分類
- 現行手順の分解
- 使用データの整理
- 既存システムとの関係整理
- MVP候補と終点の提案
- セキュリティ上の注意点の抽出

```mermaid
flowchart LR
    A["課題"] --> B["対象業務"]
    B --> C["必要データ"]
    C --> D["既存システム"]
    D --> E["実現方式候補"]
    E --> F["MVP"]
```

---

## 🔬 4. 土木建設研究者向け

本システムは、建設DXの課題収集・分類・検証テーマ化にも利用できます。

蓄積されるデータは、単なる自由記述ではなく、AIと人間の確認を経た構造化データです。将来的には、業務領域別のDX課題分析、投資対効果の仮説検証、MVP成功条件の分析に活用できます。

```mermaid
flowchart TD
    A["自由記述"] --> B["AI構造化"]
    B --> C["人間による確認"]
    C --> D["分類済みDX課題"]
    D --> E["MVP検証"]
    E --> F["知見化・再利用"]
```

---

## 🏢 5. 会社経営層向け

経営層にとっての目的は、現場発のDXアイデアを「見える化」し、投資判断できる状態にすることです。

| 経営上の関心 | システムで見えること |
|---|---|
| どの業務に課題が多いか | 業務分類別の登録数 |
| 投資すべきテーマは何か | 効果見込み、対象人数、頻度 |
| MVPは進んでいるか | 企画、MVP、検証、本番化ステージ |
| リスクは管理されているか | セキュリティ注意、承認履歴、監査ログ |
| AI利用コストは制御できるか | 利用上限、使用量、停止スイッチ |

```mermaid
flowchart LR
    A["現場課題"] --> B["DX候補"]
    B --> C["MVP"]
    C --> D["検証"]
    D --> E["本番化判断"]
    E --> F["投資効果"]
```

---

## 🛡️ 6. 社内IT部門スタッフ向け

社内IT部門は、AI接続、認証、データ管理、セキュリティ、監査、コスト制御を担当します。

```mermaid
flowchart TD
    U["👤 利用者"] --> A["Cloudflare Access"]
    A --> W["Cloudflare Workers API"]
    W --> S["入力検査・匿名化"]
    S --> AI["Claude API"]
    AI --> R["AI整理結果"]
    R --> DB["Neon PostgreSQL"]
    DB --> N["Slack通知"]
    W --> L["監査ログ・利用量記録"]
```

### 🔐 APIキー管理原則

| 保管場所 | 方針 |
|---|---|
| WebUI JavaScript | 禁止 |
| HTML・設定ファイル | 禁止 |
| GitHub | 禁止 |
| Neon PostgreSQL | APIキー本体は禁止 |
| Cloudflare Worker Secret | MVPで推奨 |
| Cloudflare Secrets Store | 運用版で推奨 |

---

## 🧭 全体フロー

```mermaid
flowchart TD
    A["WebUIで困りごと入力"] --> B["入力内容の検査・匿名化"]
    B --> C["AIとの壁打ち"]
    C --> D["AIによる構造化"]
    D --> E["利用者が確認・修正"]
    E --> F["アイデア正式登録"]
    F --> G["Slackへ通知・議論"]
    G --> H["企画・MVP・検証管理"]
```

## 🧱 システム構成

```mermaid
flowchart TD
    A["利用者"] --> B["Construction-DX-Idea"]
    B --> C["Cloudflare Access"]
    C --> D["Cloudflare Workers<br/>SPA静的アセット + /api/* 同一オリジン"]
    D --> E["入力検査・匿名化"]
    E --> F["Claude API"]
    F --> G["AI整理結果"]
    G --> H["利用者による確認"]
    H --> I["Neon PostgreSQL"]
    I --> J["Slack通知"]
```

## 🧩 主要機能

| アイコン | 機能 | 内容 |
|---|---|---|
| 📝 | 困りごと入力 | 解決策ではなく現場の課題を入力 |
| 🤖 | AI壁打ち | 不足情報を最大3問ずつ質問 |
| 🧱 | 構造化 | 課題、対象業務、改善案、MVP案へ整理 |
| ✅ | 人間確認 | AI結果を修正・再検討・登録 |
| 📣 | Slack通知 | MVPでは新規登録通知と失敗時Outbox再送。承認依頼・週次共有はPhase 2 |
| 📊 | 進捗管理 | MVPではステージ管理。詳細な効果測定・承認ワークフローはPhase 2 |
| 🔐 | 機密管理 | APIキーをCloudflare Secretで管理 |
| 🧾 | 監査ログ | AI利用、承認、設定変更を記録 |
| ⚙️ | AI設定管理 | モデル、有効/無効、利用上限、APIキー接続テスト、設定保存を管理 |

## 🧪 現在のWebUI実装メモ

```mermaid
flowchart LR
    A["Standalone Design HTML"] --> B["Vite / React Shell"]
    B --> C["全画面表示"]
    C --> D["困りごと入力"]
    C --> E["AI利用設定カード"]
    D --> F["入力検査 / AI質問 / 構造化"]
    F --> G["下書き保存 / 正式登録 / Slack通知"]
    G --> H["ステージ変更"]
    E --> I["APIキー接続テスト / 設定保存"]
    F --> J["Worker API"]
    G --> J
    H --> J
    I --> J
```

| 画面領域 | 現在の状態 | 次の実装判断 |
|---|---|---|
| 🎨 全体UI | 提供されたstandaloneデザインを正本として表示 | デザイン差分が出ないよう維持 |
| ⚙️ AI利用設定 | APIキー入力、保存済みSecret接続テスト、設定保存をAPIへ接続 | Secret本体保存はMVP方針どおりCloudflare手動登録 |
| 📝 困りごと登録 | 入力検査、AI質問、構造化、手動フォールバックをAPIへ接続 | 本番E2EでClaude実接続確認が必要 |
| 📋 一覧・詳細 | `GET /api/ideas` の実データ表示へ接続 | API取得失敗時は警告し再試行 |
| 🗂️ ステージ管理 | `/api/ideas/:id/stage` へ接続 | 管理者ロール以外はUI操作時点で停止 |

## 📌 MVPの終点

> 複数の利用者がWebUIから困りごとを入力し、Claude APIによる整理結果を本人が確認・修正して正式登録できること。登録結果がSlackへ通知され、管理者がアイデアの検討ステージを管理できること。

## 📚 開発ドキュメント

詳細な要件・仕様・運用文書は [`docs/README.md`](docs/README.md) から参照できます。

主要文書:

- [`docs/01_requirements_definition.md`](docs/01_requirements_definition.md)
- [`docs/02_detailed_spec_webui_ai_wizard.md`](docs/02_detailed_spec_webui_ai_wizard.md)
- [`docs/03_detailed_spec_api_data_infra.md`](docs/03_detailed_spec_api_data_infra.md)
- [`docs/09_security_privacy.md`](docs/09_security_privacy.md)
- [`docs/11_test_strategy.md`](docs/11_test_strategy.md)
- [`docs/21_autonomous_cto_execution.md`](docs/21_autonomous_cto_execution.md)
- [`docs/22_current_implementation_status.md`](docs/22_current_implementation_status.md)
- [`docs/23_release_deploy_runbook.md`](docs/23_release_deploy_runbook.md)

## ✅ 結論

`Construction-DX-Idea` は、現場の困りごとを起点に、AIで整理し、人間が確認し、DXアイデアとして継続管理する仕組みです。

**WebUIで困りごと入力 → 入力検査・匿名化 → AIとの壁打ち・構造化 → 人間による確認 → アイデア登録 → Slackへ通知・議論 → 企画・MVP・検証管理**
