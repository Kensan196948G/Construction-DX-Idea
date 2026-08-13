# 2026-08-13 総合アセスメント・MVP/Prototype実装記録

## 1. 目的

`/goal` 指示に基づき、CTO兼実装責任者としてリポジトリを精査し、
「実際に操作・評価できるMVP/Prototype」を本番から分離した環境として完成させる。
本番運用化・本番デプロイは対象外。

## 2. 精査範囲

- 指示文書: `CLAUDE.md`（ルート・`.claude/`）、`.claude/START_PROMPT.md`、README、`docs/01`〜`docs/27`
- 実装: `worker/index.ts`（約2,900行）、`src/`、standaloneデザイン正本＋`support.js`
- 設定・基盤: `wrangler.toml`、`.env.example`、`package.json`、CI、scripts
- DB: `migrations/001`〜`005`（Neon本番 `twilight-cloud-06040828`）
- Git履歴・Issue/PR: 45+コミット、Issue #2〜#13、PR #1〜#23、Dependabot PR
- ライセンス: **未定義**（LICENSEファイルなし、package.json `license` なし）。私的リポジトリのため運用継続は可能だが、公開・第三者提供前にライセンス方針を決定すること（ユーザー判断項目）

## 3. 主要な発見（P0〜P3）

### P0（障害・漏えい・破損・認証問題）

現時点で**未解決P0は0件**。ただし精査中に以下の重大バグを発見し、本サイクルで修正した。

| # | 内容 | 影響 | 対応 |
|---|---|---|---|
| 1 | `assertStructuredIdeaSafe` が「あらゆる」privacy finding（warning含む）で保存をブロック | 提出者メール入力時は常に PRIVACY_BLOCKED。本番ideas 0件の原因と整合 | blockerのみブロックへ変更＋テスト |
| 2 | 監査ハッシュチェーンがjsonbのキー順序で破綻 | 複数キーのmetadataを含む行がverifyで必ず tampered扱い | canonical serialization（stableStringify）へ統一＋テスト |
| 3 | `toIsoString` がDateオブジェクトのミリ秒を欠落 | ミリ秒≠0の監査行のハッシュが不整合 | Dateを直接ISO化＋テスト |

### P1（主要操作不能・主要価値）

| # | 内容 | 対応 |
|---|---|---|
| 1 | MVP/Prototype環境が存在しない（本番のみ） | `dxidea-mvp.mirai-dx-platform.com` Worker＋Neon分岐DBを新設・デプロイ |
| 2 | ダミーデータが一切ない（本番ideas 0件） | `scripts/mvp-seed.mjs` で全テーブルに架空データ投入・保持 |
| 3 | MVPでAIウィザードが操作不可（実APIキーなし） | 課金不要の `demo` AIプロバイダー（決定的ローカル応答）を実装 |
| 4 | オフライン下書き同期にIdempotency-Keyがなく再送で重複登録リスク | `src/lib/offlineDrafts.ts` へキューを抽出しキーを再利用＋テスト |
| 5 | ライセンス未定義 | 最終報告で明示（ユーザー判断項目） |

### P2（品質・UX、今回実装）

- 公開MVPの書き込みに対する簡易レート制限（bypass時のみ、60回/分/IP。**per-isolateのベストエフォート**である旨を文書化）
- 静的アセットのセキュリティヘッダー（`public/_headers`）
- グローバル利用上限のsubject_idを `*` へ正規化
- MVP識別バナー（`VITE_DEMO_BANNER`）
- CIへ `npm audit` と `mvp:dry-run` を追加
- README/docs/state.json の実装一致更新、Issue #3/#4/#5 の実動作検証

### P3（バックログ、既存Issueに継続）

- Issue #6〜#13: Slack承認通知の本番確認、監視ダッシュボード、バックアップ定期化、会社ドメイン管理者複数化、監査チェーン本番運用確認、PWA完全化、外部連携、RAG/eval
- Dependabot PR #14〜#20（依存更新。CI確認後に個別判断）
- オフライン下書きのPII平文localStorage（上限・同期後削除は実装済み。端末暗号化は将来）
- 利用上限APIのUI未接続（AI設定画面の日次/月次は接続済み。per-user管理UIは将来）
- CSP（standaloneデザインが `new Function` を利用するため `unsafe-eval` が必要となり、本番同等のCSPは将来のReact移行時に検討）

## 4. MVP/Prototype環境構成

| 項目 | 本番（既存・不変） | MVP/Prototype（今回新設） |
|---|---|---|
| URL | https://dxidea.mirai-dx-platform.com | https://dxidea-mvp.mirai-dx-platform.com |
| Worker | `construction-dx-idea-api` | `construction-dx-idea-api-mvp`（`[env.mvp]`） |
| DB | Neon `main` | Neon branch `mvp`（本番から分離・ダミーデータ投入済み） |
| 認証 | Cloudflare Access JWT | `ALLOW_LOCAL_AUTH_BYPASS=true`（全操作を即座に体験可能） |
| AI | Claude（実APIキー） | `demo`（決定的ローカル応答・課金なし） |
| Slack通知 | webhook | 未設定（skipped。outboxのみ動作） |
| Cron | 10分再送＋毎時アラート | 無効（`crons=[]`。Free枠の温存） |

デプロイ実績: Version `5eaa087b-1739-48e4-a824-e3da99ba7584`（2026-08-13）。
Neon branch: `br-lively-rain-axde06n5`（parent `main`）、endpoint `ep-lingering-cake-ax569ixz`。

## 5. 検証結果

| 検証 | 結果 |
|---|---|
| `npm run verify`（lint / test 68件 / build×2 / security:scan） | ✅ PASS |
| `npm run mvp:dry-run` | ✅ PASS（env.mvp設定・assets認識） |
| MVPデプロイ（custom domain自動登録） | ✅ PASS |
| `mvp:smoke`（17チェック） | ✅ ALL PASS |
| 主要書込みE2E（demo AI質問→構造化→下書き→ステージ→承認依頼→承認→コメント） | ✅ PASS（監査チェーン valid 維持） |
| セキュリティヘッダー実配信（`_headers`） | ✅ PASS（nosniff / SAMEORIGIN / referrer / permissions） |
| レート制限 | ⚠️ ロジックは単体テストPASS。実環境はper-isolateのため閾値未満で分散し429を安定的に発火しない（既知制約として文書化） |

## 6. 残課題・再開ポイント

- `DEEPSEEK_API_KEY` 本番Secret登録（ユーザー操作）
- 本番の監査チェーン: 本修正により旧ハッシュアルゴリズムで書かれた行はverifyで不整合になる。本番適用時はチェーン再構築（再アンカー）方針の決定が必要（Issue #10 と関連）
- 会社ドメイン管理者複数化（Issue #9）
- ライセンス方針決定
