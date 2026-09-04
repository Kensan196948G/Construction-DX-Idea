# Issue・PR運用ガイド

## 1. GitHubの役割

GitHubはソースコード、設計書、Issue、実装進捗の正本とする。

## 2. Issue種別

| 種別 | 用途 |
|---|---|
| requirement | 要件追加・変更 |
| design | 設計変更 |
| feature | 機能実装 |
| bug | 不具合 |
| security | セキュリティ対応 |
| docs | 文書更新 |
| ops | 運用作業 |

## 3. Issue記載項目

- 背景
- 目的
- 対象範囲
- 受入基準
- 関連ドキュメント
- セキュリティ影響
- テスト観点
- 案件ID（`DX-YYYY-NNNN`。全社Idea-to-Valueプロセス上の案件と対応する場合のみ記載。`docs/New/ai-dx-dev-process.md`参照。対応する全社案件がないGitHub固有の作業（依存更新・CI整備等）は空欄でよい）

## 4. PRルール

- 1つのPRは1つの目的に絞る。
- 仕様変更がある場合はdocsも更新する。
- APIキーや実値のSecretを含めない。
- テスト結果をPRに記載する。
- セキュリティ影響がある場合は明示する。

## 5. ブランチ命名

例:

- `feature/idea-wizard`
- `feature/ai-structure`
- `fix/slack-notification`
- `docs/requirements`
- `security/secret-handling`
