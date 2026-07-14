# /safe-auto-merge

GitHub Token を利用して open PR を安全に処理するコマンドです。

このコマンドを選んだら、次の方針で進めてください。

- `defaultBranchRef.name`（手順1で取得するリポジトリの default branch 名。多くの場合 `main`）宛 PR は、必ず人間へ「マージしますか？ [y/N]」を確認する。
- default branch 以外の branch 宛 PR は、CI・review・mergeability・危険ファイル gate をすべて通過した場合のみ自動マージする。
- `GITHUB_TOKEN` / `GH_TOKEN` は `gh` CLI にだけ使い、値を表示・保存しない。
- force push、history rewrite、直接 push はしない。

実行手順:

1. `gh auth status` と `gh repo view --json defaultBranchRef` を確認し、`defaultBranchRef.name` を以降の判定基準として保持する。
2. `gh pr list --state open` で対象 PR を列挙する。
3. 各 PR の `baseRefName`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `statusCheckRollup`, `files` を確認する。
4. `baseRefName` が手順1の `defaultBranchRef.name` と一致する PR は要約を提示して人間確認を待つ（`main` 固定判定はしない。default branch が `main` 以外の名前でも同じ扱いとする）。
5. `baseRefName` が `defaultBranchRef.name` と異なる PR のみ、次をすべて満たす場合に限り `gh pr merge <number> --squash --delete-branch` を実行する。

自動マージ gate:

- `isDraft=false`
- `mergeable=MERGEABLE`
- `mergeStateStatus=CLEAN`
- `reviewDecision` が `REVIEW_REQUIRED` / `CHANGES_REQUESTED` ではない
- status checks に失敗・未完了・取消がない
- Critical / High 指摘が残っていない。判定元は、当該 PR の最新コミットに対して実行された `/codex:review` の結果、`/coderabbit:review` の結果、および `gh pr view <number> --json reviews,comments,statusCheckRollup` で取得できる GitHub 上のレビュー・コメント・ステータスチェックとする。これらの結果が未取得・未実行・または最新コミットに対するものでない（古い）場合は、指摘ゼロとはみなさず `needs-human` に分類する
- 認証・認可、secrets、DB migration/schema、本番 deploy、`.github/workflows/`、branch protection、`.claude/`（Claude運用ガバナンス設定一式）、`state.json`（Claude状態管理ファイル）の変更を含まない

判定に必要な情報（`mergeable` / `mergeStateStatus` / `reviewDecision` / `statusCheckRollup` / 変更ファイル一覧 / Critical・High 指摘の判定元）が取得できない・null・pending・unknown の場合は、条件充足とみなさず `needs-human` に分類する（fail-closed）。

手順3の確認と手順5の `gh pr merge` 実行の間に他の作業を挟まない。実行直前に状態が変化している可能性があるため、`gh pr merge` がコンフリクトやチェック未達で失敗した場合は再試行せず `needs-human` として報告する。

status checks が実行中（未完了）で、それ以外の自動マージ gate をすべて満たす PR は、即時マージせず `gh pr merge <number> --squash --delete-branch --auto` を実行して GitHub 側の auto-merge を有効化し、`auto-merge enabled` として分類する（CI 完了後に GitHub が自動でマージする）。それ以外で即時マージした場合は `merged`、gate を満たさない場合は `skipped`、判定不能または default branch 宛の場合は `needs-human` とする。

最後に `merged`, `auto-merge enabled`, `skipped`, `needs-human` に分類して報告してください。
