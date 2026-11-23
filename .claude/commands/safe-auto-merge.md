# /safe-auto-merge

GitHub Token を利用して open PR を安全に処理するコマンドです。

このコマンドを選んだら、次の方針で進めてください。

- PR は `gh pr merge --auto --squash` で自動マージを予約する。マージの条件は Required Checks の全成功と merge conflict がないことだけとし、人間の Y/N・選択・Approve を待たない（default branch 宛も同じ）。`--admin` による迂回は禁止する。Release・本番デプロイ・秘密情報の変更・不可逆な削除は、コードのマージとは別に Human Gate とする。（正本: 中央ポリシー `GITHUB_POLICY.md` v2）
- `GITHUB_TOKEN` / `GH_TOKEN` は `gh` CLI にだけ使い、値を表示・保存しない。
- force push、history rewrite、直接 push はしない。

実行手順:

1. `gh auth status` と `gh repo view --json defaultBranchRef` を確認する。
2. `gh pr list --state open` で対象 PR を列挙する。
3. 各 PR の `baseRefName`, `isDraft`, `mergeable`, `mergeStateStatus`, `reviewDecision`, `statusCheckRollup`, `files` を確認する。
4. 次をすべて満たす PR に `gh pr merge <number> --auto --squash` で自動マージを予約する（base branch を問わない）。

自動マージ gate:

- `isDraft=false`
- `mergeable` が `CONFLICTING` ではない（merge conflict がない）
- status checks に失敗・取消がない（未完了の Required Checks は auto-merge が全成功を待つ）
- Critical / High 指摘が残っていない。判定元は、当該 PR の最新コミットに対して実行された `/codex:review` の結果、`/coderabbit:review` の結果、および `gh pr view <number> --json reviews,comments,statusCheckRollup` で取得できる GitHub 上のレビュー・コメント・ステータスチェックとする。これらの結果が未取得・未実行・または最新コミットに対するものでない（古い）場合は、指摘ゼロとはみなさず `skipped` に分類する

認証・認可、secrets、DB migration/schema、本番 deploy、`.github/workflows/`、branch protection、`.claude/`（Claude運用ガバナンス設定一式）、`state.json`（Claude状態管理ファイル）の変更を含む PR もマージ自体は上記 gate で自動化する。ただし、それらが伴う secret 変更・本番 deploy・不可逆な削除の**実行**は、マージとは別の Human Gate とし、報告で明示する。

判定に必要な情報（`mergeable` / `statusCheckRollup` / 変更ファイル一覧 / Critical・High 指摘の判定元）が取得できない・null・unknown の場合は、条件充足とみなさず予約しない（fail-closed）。`skipped` として理由を報告し、情報を再取得して再判定する。

`gh pr merge` がコンフリクトで失敗した場合は再試行せず、conflict を解消して再検証してから改めて予約する。

Required Checks の完了は GitHub 側の auto-merge が待つ。予約した PR は `auto-merge enabled`、予約時点ですでにマージされた場合は `merged`、gate を満たさない場合は `skipped` とする。

最後に `merged`, `auto-merge enabled`, `skipped`, `human-gate-after-merge` に分類して報告してください。
