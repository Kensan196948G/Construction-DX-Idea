# 自律CTO実行プロセス

この文書は、`Construction-DX-Idea` を自律的に実装・検証・リリースするための開発プロセスを定義する。要件、仕様、セキュリティ、テスト、運用の正本は既存ドキュメントを優先し、本書は実行順序、確認観点、GitHub Projects更新、監視と検証のループを管理する。

## 1. 実行原則

- 実装判断は `docs/01_requirements_definition.md`、`docs/02_detailed_spec_webui_ai_wizard.md`、`docs/03_detailed_spec_api_data_infra.md` を優先する。
- MVP範囲は `docs/12_mvp_scope_and_roadmap.md` と `docs/20_acceptance_criteria.md` を正とする。
- セキュリティ判断は `docs/09_security_privacy.md` と `docs/18_risk_register.md` を必ず確認する。
- 仕様差分を見つけた場合は、実装だけで解決せず、関連ドキュメントとIssueを更新する。
- AI、Secret、認証、監査ログ、Slack通知、利用上限に関わる変更は、人間レビューをリリース条件に含める。

## 2. AgentTeams想定ロール

AgentTeamsまたは同等の分担で進める場合は、以下のロールに分けてレビュー観点を固定する。

| ロール | 主責務 | 参照文書 |
|---|---|---|
| 自律CTO | 優先順位、リリース判断、リスク判断 | 本書、`12_mvp_scope_and_roadmap.md`、`18_risk_register.md` |
| PM | Issue分解、GitHub Projects更新、受入基準管理 | `17_issue_and_pr_workflow.md`、`20_acceptance_criteria.md` |
| Tech Lead | API、DB、Cloudflare、Neon、実装整合性 | `03_detailed_spec_api_data_infra.md`、`04_system_architecture.md`、`06_api_design.md`、`07_database_design.md` |
| WebUI Lead | 画面遷移、入力体験、確認フロー | `02_detailed_spec_webui_ai_wizard.md`、`05_screen_transition_and_ui.md` |
| AI Lead | プロンプト、AI送信範囲、出力品質 | `08_ai_prompt_and_workflow.md`、`09_security_privacy.md` |
| Security Reviewer | Secret、認証認可、ログ、機密情報送信防止 | `09_security_privacy.md`、`15_cost_and_rate_limit.md` |
| QA/Ops | テスト、受入、運用、監視、障害時手順 | `10_operations_runbook.md`、`11_test_strategy.md`、`20_acceptance_criteria.md` |

## 3. 実装バックログ

| 優先 | Epic | 主要Issue候補 | 完了条件 |
|---:|---|---|---|
| P0 | リポジトリ基盤 | アプリ構成、環境変数テンプレート、CI、lint/testコマンド | 開発者がローカルで起動し、CIで基本検証できる |
| P0 | 認証・ロール | Cloudflare Access連携、一般利用者/管理者判定、管理画面保護 | AC-001、AC-010、AC-012、セキュリティ受入基準を満たす |
| P0 | 困りごと入力 | 入力フォーム、バリデーション、下書き保存 | AC-002、AC-007を満たす |
| P0 | 入力検査・匿名化 | 禁止情報候補検出、警告、マスキング、送信前確認 | AC-003、セキュリティ受入基準を満たす |
| P0 | AI質問生成 | Claude API接続、最大3問、エラー時の手動継続 | AC-004、T-003、T-008を満たす |
| P0 | AI構造化 | 指定項目への構造化、利用者修正、プロンプトバージョン記録 | AC-005、AC-006、AC-011を満たす |
| P0 | 正式登録 | Neon保存、ステータス管理、詳細表示 | AC-008、T-006を満たす |
| P0 | Slack通知 | 新規登録通知、失敗ログ、登録成功との分離 | AC-009、運用受入基準を満たす |
| P1 | 管理機能 | ステージ変更、AI有効/無効、利用上限確認 | AC-010、AC-013、AC-014を満たす |
| P1 | 監査・利用量 | 重要操作ログ、AI利用量、モデル/文字数/成否記録 | AC-011、AC-015を満たす |
| P1 | 運用Runbook実装 | AI障害、Slack失敗、上限到達、Secret更新の操作確認 | `10_operations_runbook.md` の手順を実行できる |
| P2 | 検証版強化 | 評価フロー、管理ダッシュボード、通知再送、複数管理者 | Phase 2の検証要件をIssue化し、MVP外として管理する |

## 4. Issue分解ルール

各Issueには以下を必ず記載する。

- 背景と目的
- 対象範囲と対象外
- 関連ドキュメント
- 対応する受入基準IDまたはテストID
- セキュリティ影響の有無
- ログ、Secret、AI送信範囲、Slack通知への影響
- 完了条件と確認コマンド

1つのIssueで、UI、API、DB、Securityをまとめて変更しない。横断変更が必要な場合はEpicを作り、実装Issueを分割する。

## 5. GitHub Projects更新計画

GitHub Projectsは、実装進捗とリリース判断の正本として使う。

### 5.1 推奨フィールド

| フィールド | 値 |
|---|---|
| Status | Inbox、Ready、In progress、In review、Blocked、Done |
| Priority | P0、P1、P2 |
| Area | WebUI、API、DB、AI、Security、Ops、Docs |
| Phase | Phase 0、Phase 1 MVP、Phase 2、Phase 3、Phase 4 |
| Acceptance | AC IDまたは該当なし |
| Risk | R IDまたは該当なし |
| Release | v0.1 MVP、v0.2 検証版など |
| Owner Role | PM、Tech Lead、WebUI Lead、AI Lead、Security、QA/Ops |

### 5.2 ビュー

| ビュー | 目的 |
|---|---|
| MVP Board | Phase 1 MVPの実装順とBlockedを確認する |
| Security Review | SecurityまたはRiskが付いたIssue/PRを確認する |
| Release Readiness | Release別に未完了Issue、レビュー、テスト結果を確認する |
| Ops Verification | 監査、利用量、Runbook、障害時確認を追跡する |

### 5.3 更新タイミング

- 作業開始時: Issueを `In progress` にし、Owner RoleとAcceptanceを設定する。
- PR作成時: Issueを `In review` にし、PR本文へテスト結果とセキュリティ影響を記載する。
- レビュー差戻し時: 指摘内容をIssueまたはPRチェックリストに反映する。
- マージ時: Issueを `Done` にし、関連Acceptanceの状態を更新する。
- リリース判定前: `Release Readiness` ビューで未完了P0、Blocked、Security未レビューをゼロにする。

## 6. PRレビュー・セキュリティチェックリスト

PR本文またはレビューで以下を確認する。

### 6.1 共通レビュー

- 関連Issue、関連ドキュメント、受入基準IDが記載されている。
- 変更範囲がIssueの目的に収まっている。
- 仕様変更がある場合、該当docsが同時更新されている。
- テスト結果、未実施テスト、残リスクが明記されている。
- エラー時の利用者表示と再試行方針が確認されている。

### 6.2 セキュリティレビュー

- APIキー、認証トークン、Secret実値がコード、ログ、レスポンス、DB、ドキュメントに含まれていない。
- 保存済みAPIキーは再表示せず、表示する場合は末尾4文字のみである。
- AIへ送信しない情報が送信前に検査される。
- AI処理ログに未加工テキスト全文を残していない。
- 一般利用者が管理者APIやAI設定へアクセスできない。
- 重要操作が監査ログへ記録される。
- 利用上限到達時にAI実行が停止する。
- Slack通知失敗時も登録データの整合性が保たれる。

### 6.3 リリースブロッカー

以下のいずれかがある場合はリリースしない。

- P0 Issueが未完了またはBlockedのまま残っている。
- AC-001からAC-015のいずれかが未確認である。
- Secret漏えい、権限不備、AIへの禁止情報送信の疑いがある。
- E2E、セキュリティ、運用テストの失敗が未解決である。
- Runbookにない復旧手順が必要な障害が残っている。

## 7. リリースチェックリスト

### 7.1 リリース前

- `docs/20_acceptance_criteria.md` のMVP受入基準を確認した。
- `docs/11_test_strategy.md` の重要テストケースT-001からT-012を実行した。
- AI接続テスト、Slack通知テスト、上限到達テスト、AI無効化テストを実行した。
- Cloudflare Access、管理者ロール、一般利用者ロールの動作を確認した。
- Secret実値がGitHub、配信物、ログ、DBに含まれないことを確認した。
- 監査ログとAI利用量が記録されることを確認した。
- リリース対象IssueとPRがGitHub Projectsで `Done` または明示的に対象外になっている。

### 7.2 リリース作業

1. リリース対象コミット、環境、設定差分を記録する。
2. DBマイグレーションがある場合はバックアップとロールバック方針を確認する。
3. Cloudflare Workerと関連設定をデプロイする。
4. 接続確認を実行する。
5. 代表ユーザーでE2Eの短縮シナリオを実行する。
6. Slack通知、監査ログ、AI利用量を確認する。
7. GitHub ReleaseまたはリリースIssueに結果を記録する。

### 7.3 リリース後

- 30分以内にエラーレート、AI失敗率、Slack通知失敗、監査ログ異常を確認する。
- 24時間以内に利用量、上限接近、ユーザー問い合わせ、機密情報警告件数を確認する。
- 発見した問題は `bug`、`security`、`ops` のいずれかでIssue化する。

## 8. 監視・検証ループ

### 8.1 日次

- AI接続状態、AI利用量、上限接近を確認する。
- Slack通知失敗と未再送を確認する。
- 監査ログに異常な管理操作がないか確認する。
- エラーレート、タイムアウト、登録失敗を確認する。
- 機密情報警告の件数と傾向を確認する。

### 8.2 週次

- GitHub ProjectsのP0/P1進捗、Blocked、レビュー滞留を確認する。
- リスク管理表のR-001からR-010に新規兆候がないか確認する。
- 受入基準に対する未検証項目を確認する。
- Slack議論から意思決定記録へ反映すべき内容を確認する。
- コストとレート制限の設定値が利用実績に合っているか確認する。

### 8.3 リリースごと

- 受入基準、テスト戦略、Runbook、リスク管理表の差分を確認する。
- リリース後の監視結果をリリースIssueへ追記する。
- 未解決の障害、ユーザー問い合わせ、セキュリティ懸念を次リリースのBacklogへ入れる。

### 8.4 インシデント時

1. 影響範囲、発生時刻、検知方法を記録する。
2. AI、Slack、登録、管理画面、認証のどこで起きたか分類する。
3. 情報漏えい、異常課金、権限不備の可能性がある場合はAI機能を緊急停止する。
4. `docs/10_operations_runbook.md` の該当手順を実行する。
5. 復旧後、再発防止策をIssue化し、必要なら `docs/18_risk_register.md` を更新する。

## 9. 完了判定

MVPリリースは、以下をすべて満たした時点で完了とする。

- Phase 1 MVPのP0バックログが完了している。
- AC-001からAC-015が確認済みである。
- T-001からT-012が成功、または残課題がリリース対象外として承認されている。
- セキュリティレビューでリリースブロッカーがない。
- Runbookに沿ってAI障害、Slack通知失敗、上限到達、緊急停止を確認済みである。
- GitHub ProjectsのRelease Readinessビューに未完了P0、Blocked、Security未レビューがない。
