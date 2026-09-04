# Construction-DX-Idea 開発ドキュメント

このフォルダは、`Construction-DX-Idea` の要件、設計、開発、テスト、運用、セキュリティに関する正本ドキュメントを管理します。

## 文書一覧

| No | 文書 | 目的 |
|---:|---|---|
| 01 | [要件定義書](01_requirements_definition.md) | システムが満たすべき業務・機能・非機能要件 |
| 02 | [詳細仕様設計書 WebUI・AIウィザード編](02_detailed_spec_webui_ai_wizard.md) | 利用者画面、AI壁打ち、登録フロー |
| 03 | [詳細仕様設計書 API・データ・基盤編](03_detailed_spec_api_data_infra.md) | API、DB、Cloudflare、Neon、Slack連携 |
| 04 | [システムアーキテクチャ設計書](04_system_architecture.md) | 全体構成、責務分離、配置方針 |
| 05 | [画面遷移・UI仕様書](05_screen_transition_and_ui.md) | 画面一覧、遷移、UI項目 |
| 06 | [API設計書](06_api_design.md) | エンドポイント、リクエスト、レスポンス |
| 07 | [データベース設計書](07_database_design.md) | テーブル、主キー、主要カラム |
| 08 | [AIプロンプト・処理設計書](08_ai_prompt_and_workflow.md) | AI処理種別、プロンプト管理、制約 |
| 09 | [セキュリティ・プライバシー設計書](09_security_privacy.md) | APIキー、情報漏えい、権限、監査 |
| 10 | [運用Runbook](10_operations_runbook.md) | 障害対応、日次確認、設定変更 |
| 11 | [テスト戦略書](11_test_strategy.md) | 単体、結合、E2E、受入、セキュリティテスト |
| 12 | [MVPスコープ・ロードマップ](12_mvp_scope_and_roadmap.md) | MVP範囲、段階導入、将来計画 |
| 13 | [Slack連携仕様書](13_slack_integration.md) | 通知種別、メッセージ、議論反映 |
| 14 | [Cloudflare・Neonセットアップ手順](14_cloudflare_neon_setup.md) | 初期構築と環境変数 |
| 15 | [コスト・レート制限設計書](15_cost_and_rate_limit.md) | AI利用制限、予算管理、停止条件 |
| 16 | [意思決定記録テンプレート](16_decision_log_template.md) | ADRと業務判断の記録形式 |
| 17 | [Issue・PR運用ガイド](17_issue_and_pr_workflow.md) | GitHub運用ルール |
| 18 | [リスク管理表](18_risk_register.md) | 主要リスク、影響、対策 |
| 19 | [用語集](19_glossary.md) | 業務・技術用語の定義 |
| 20 | [受入基準一覧](20_acceptance_criteria.md) | MVP完了条件と検収観点 |
| 21 | [自律CTO実行プロセス](21_autonomous_cto_execution.md) | 実装バックログ、リリース判定、GitHub Projects更新、レビュー・監視ループ |
| 22 | [現在の実装・検証ステータス](22_current_implementation_status.md) | 実装済み範囲、検証結果、起動手順、残ゲート |
| 23 | [リリース・デプロイRunbook](23_release_deploy_runbook.md) | 本番直前チェック、環境値、デプロイ、スモークテスト、ロールバック |
| 24 | [自動化CTO実行ログ](24_autonomous_cto_execution_log.md) | 監視・開発サイクル結果、次アクション |
| 25 | [ベースライン評価](25_baseline_evaluation.md) | 18カテゴリの統合評価（改善前） |
| 26 | [改善台帳](26_improvement_ledger.md) | 改善項目と対応記録 |
| 27 | [改善評価レポート](27_improvement_evaluation_report.md) | 改善後の再評価結果 |
| 28 | [MVP/Prototypeデモ手順書](28_mvp_prototype_demo.md) | MVP環境URL・ダミーデータ構成・デモ手順・既知制約 |
| — | [2026-08-13総合アセスメント](audit/2026-08-13-assessment.md) | 精査結果・P0〜P3・MVP実装記録 |

## 全社Idea-to-Valueプロセスにおける位置付け

全社の「Idea to Value」プロセス（`docs/New/ai-dx-dev-process.md`、Gate1〜5・3 Authority・案件ID`DX-YYYY-NNNN`を規定）において、本リポジトリ（`Construction-DX-Idea`）はPhase 10〜17（開発案件化〜Production Deploy）を担う「Engineering SoR（System of Record）」の一実装である。全社Gate1〜5承認や案件ID体系そのものは`docs/New`配下の文書を正本とし、本docsはその範囲内でのシステム要件・設計・実装・運用を扱う。

## 文書の優先順位

1. 要件定義書
2. 詳細仕様設計書2本
3. セキュリティ・プライバシー設計書
4. API・DB・AI・UI仕様
5. テスト・運用・ロードマップ
6. 自律CTO実行プロセス
7. 現在の実装・検証ステータス

## 更新ルール

- 仕様変更は関連する設計書と受入基準を同時に更新する。
- セキュリティ、AI送信範囲、APIキー管理の変更は必ず記録する。
- 実装と文書が異なる場合は、差分をIssue化し、どちらを正とするか決定する。
