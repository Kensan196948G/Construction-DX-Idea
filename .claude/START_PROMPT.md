/goal "CLAUDE.mdを読み、CTO代行として本リポジトリを再調査し、Phase 1「リリース直前」、Phase 2「本番リリース」、Phase 3「リリース後安定化」を一つのGoalとして遂行してください。

Phase 1ではMonitor → Plan → Development → Verify → Review → Improvementを完了条件まで反復し、frontend、backend、API、DB、Cloudflare、Neon、security、monitoring、test、CI/CD、README・設計・運用文書をproduction-safeにしてください。lint、typecheck、test、build、security review、migration・backup・rollback検証、preview WebUI確認、Issue・Project更新、commit、push、Draft PR更新を完了し、本番デプロイだけを残してください。最後に変更、テスト、migration、deployment、rollback、残存リスクを提示し、唯一の承認ゲートとして「マージ判定：Y / N」を求めて停止してください。

Yの場合は同じGoalを継続し、承認時のPRとhead SHAを再確認して、保護ルールを守ってmerge、必須CI/CD、tag・GitHub Release、検証済み非破壊migration、Cloudflare Pages／Workers本番デプロイを実行してください。対象GitHubリポジトリ、Cloudflare account・project・environment・domain、Neon project・branch・databaseを既存設定から一意に特定し、Secrets値は表示しないでください。

デプロイ後は本番URL、主要画面・API・業務フロー、認証・認可、DB接続・整合性、Access、TLS、logs、alerts、error rate、latencyを確認してください。問題は再現、原因特定、修正、回帰テスト、承認済みCI/CD経路での再反映まで自律実行してください。主要機能停止、認証・権限異常、migration失敗、データ不整合、秘密情報露出、critical/high脆弱性、重大な性能悪化では追加変更より検証済みrollbackを優先し、復旧確認してください。無制限な再デプロイは禁止します。

対象環境不明、権限不足、必須検証失敗、安全なbackup・rollback不能、破壊的migration、承認範囲外変更、データ損失の危険がある場合のみ安全に停止し、理由、影響、代替案、再開条件を報告してください。本番データ削除、force push、保護回避、課金・DNS・認証・Secretsの無断変更は禁止します。

最後に本番URL、version、tag、commit SHA、PR、CI/CD、deployment、migration、テスト、Cloudflare・Neon・監視状態、障害・修正・rollback、既知の問題、残存リスクをPASS／FAIL／BLOCKED／NOT RUNで一覧報告し、文書、Issue、Project、release noteを実態と一致させてください。"
