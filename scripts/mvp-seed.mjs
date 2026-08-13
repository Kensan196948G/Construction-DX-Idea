#!/usr/bin/env node
/**
 * MVP/Prototype demo seed for Construction-DX-Idea.
 *
 * Seeds a dedicated (non-production) Neon branch/database with clearly
 * fictional dummy data so reviewers can operate every screen immediately:
 * users, ideas across all stages, comments, approvals, stage histories,
 * AI sessions, AI settings, usage limits/counters, notification outbox and a
 * hash-chained audit log.
 *
 * Usage:
 *   DATABASE_URL=<postgres://...> node scripts/mvp-seed.mjs           # upsert (idempotent)
 *   DATABASE_URL=<postgres://...> node scripts/mvp-seed.mjs --reset   # wipe then insert
 *
 * All people, emails, departments, projects and amounts below are fictional.
 * Emails use the reserved demo.example.com domain. No real PII is included.
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Refusing to run.");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  process.exit(1);
}

const reset = process.argv.includes("--reset");
const sql = neon(databaseUrl);

/** Fixed, stable IDs make the seed idempotent and re-runnable. */
const uid = (n) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const users = [
  {
    id: uid(1),
    email: "demo.admin@demo.example.com",
    name: "デモ 管理者",
    department: "DX推進室",
    role: "system_admin",
    status: "active",
  },
  {
    id: uid(2),
    email: "h.kaigi@demo.example.com",
    name: "デモ 花子",
    department: "技術本部",
    role: "admin",
    status: "active",
  },
  {
    id: uid(3),
    email: "t.genba@demo.example.com",
    name: "デモ 太郎",
    department: "土木工事部",
    role: "user",
    status: "active",
  },
  {
    id: uid(4),
    email: "j.gijutsu@demo.example.com",
    name: "デモ 次郎",
    department: "技術部",
    role: "user",
    status: "active",
  },
  {
    id: uid(5),
    email: "s.jimu@demo.example.com",
    name: "デモ 幸子",
    department: "総務部",
    role: "user",
    status: "active",
  },
  {
    id: uid(6),
    email: "k.kyuka@demo.example.com",
    name: "デモ 休暇中",
    department: "品質管理部",
    role: "user",
    status: "suspended",
  },
];

/** Dummy construction-DX ideas spanning every lifecycle stage. */
const ideas = [
  {
    id: uid(101),
    title: "出来形写真の撮影・整理をスマートフォンで半自動化したい",
    currentIssue:
      "出来形写真の撮影後に、写真の選別・黒板情報との照合・帳票への差し込みを手作業で行っており、夜間残業の主因になっている。",
    targetBusiness: "出来形管理",
    targetUsers: "現場代理人・主任技術者・工事写真担当",
    currentWorkflow:
      "カメラで撮影 → PCへ取込 → フォルダ整理 → 黒板情報を目視照合 → Excel帳票へ手入力。",
    improvementIdea:
      "スマートフォン撮影時に位置・時刻・施工段階を自動記録し、撮影順に管理番号を付与。帳票への差し込みまで自動化する。",
    expectedEffects:
      "写真整理作業を1工区あたり週3時間削減。検査資料の作成ミス・写真抜けを減らす。",
    requiredData: ["撮影写真", "工事名・工区", "黒板情報", "撮影位置・時刻", "施工段階"],
    relatedSystems: ["既存の工事写真管理フォルダ", "Excel検査帳票"],
    implementationOptions: [
      "スマホアプリ＋クラウド同期",
      "既存カメラ＋後処理デスクトップツール",
      "汎用フォーム＋OCR",
    ],
    securityNotes: ["写真に写り込む人物・車両ナンバーの扱い", "クラウド保管時のアクセス制御"],
    openQuestions: ["通信環境が不安定な現場での同期方法"],
    mvpCandidate: "スマホ撮影→自動タグ付け→帳票CSV出力までを1工区で試行",
    mvpDoneDefinition: "写真100枚の整理時間が従来比50%以下になること",
    stage: "production",
    approvalStatus: "approved",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-07-20T01:00:00.000Z",
    approvalActedAt: "2026-07-21T02:00:00.000Z",
    approvalReason: "現場負荷の削減効果が明確で、他工区への横展開が見込める",
    createdBy: "t.genba@demo.example.com",
    ownerId: uid(3),
    department: "土木工事部",
    submitterName: "デモ 太郎",
    submitterEmail: "t.genba@demo.example.com",
    coordinationNeeded: "IT担当と写真管理ルールの調整が必要",
    idempotencyKey: "seed-idea-101-production",
    createdAt: "2026-07-15T01:00:00.000Z",
    updatedAt: "2026-08-10T01:00:00.000Z",
  },
  {
    id: uid(102),
    title: "日報の二重入力をなくす入力フォームと集計の自動化",
    currentIssue:
      "作業員ごとの日報を紙で回収し、事務担当がExcelへ転記して社内システムへ再度入力しており、二重・三重の転記が発生している。",
    targetBusiness: "日報・作業実績管理",
    targetUsers: "現場代理人・事務担当・協力会社職長",
    currentWorkflow: "紙日報 → 事務担当がExcel転記 → 社内システムへ再入力 → 週次集計。",
    improvementIdea:
      "現場でタブレットに入力する日報フォームを導入し、入力データをそのまま集計・システム連携する。",
    expectedEffects: "転記時間を月20時間削減し、集計の締め切り遅れを解消する。",
    requiredData: ["作業員名", "作業内容", "就業時間", "使用重機", "出来高数量"],
    relatedSystems: ["社内勤怠システム", "Excel集計表"],
    implementationOptions: ["Webフォーム", "タブレットアプリ", "既存勤怠システムの拡張"],
    securityNotes: ["個人の就業情報の取り扱い", "協力会社との共有範囲"],
    openQuestions: ["オフライン環境での入力方法"],
    mvpCandidate: "1工区でWebフォーム入力と自動集計を試行",
    mvpDoneDefinition: "事務担当の転記作業が0になり、週次集計が自動出力できること",
    stage: "verification",
    approvalStatus: "approved",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-07-25T01:00:00.000Z",
    approvalActedAt: "2026-07-26T03:00:00.000Z",
    approvalReason: "二重入力の解消は全工事共通の課題で優先度が高い",
    createdBy: "s.jimu@demo.example.com",
    ownerId: uid(5),
    department: "総務部",
    submitterName: "デモ 幸子",
    submitterEmail: "s.jimu@demo.example.com",
    coordinationNeeded: "勤怠システム部門との連携設計",
    idempotencyKey: "seed-idea-102-verification",
    createdAt: "2026-07-18T01:00:00.000Z",
    updatedAt: "2026-08-08T01:00:00.000Z",
  },
  {
    id: uid(103),
    title: "協力会社への作業指示の共有漏れを防ぐ掲示板",
    currentIssue:
      "口頭や個別メールで伝えた作業指示が共有されず、手戻りや待ち時間が発生している。",
    targetBusiness: "協力会社との情報共有",
    targetUsers: "現場代理人・職長・協力会社現場責任者",
    currentWorkflow: "朝礼で口頭伝達 → 個別にメールや電話で補足 → 掲示板に紙を掲示。",
    improvementIdea:
      "作業指示を日時・対象・承認状態付きで共有できる現場掲示板を導入する。",
    expectedEffects: "指示の共有漏れによる手戻りを減らし、朝礼時間を短縮する。",
    requiredData: ["作業指示内容", "対象工種", "実施日", "承認者", "対応状況"],
    relatedSystems: ["グループウェア", "メール"],
    implementationOptions: ["グループウェアの拡張", "専用Web掲示板", "チャットツール"],
    securityNotes: ["社外関係者への公開範囲の制御"],
    openQuestions: ["協力会社のデバイス・アカウント運用"],
    mvpCandidate: "1工区でWeb掲示板を試行し、確認済みチェックを運用",
    mvpDoneDefinition: "指示の未確認件数が週0件になること",
    stage: "mvp",
    approvalStatus: "approved",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-08-01T01:00:00.000Z",
    approvalActedAt: "2026-08-02T01:00:00.000Z",
    approvalReason: "現場の基本業務であり効果測定が容易",
    createdBy: "t.genba@demo.example.com",
    ownerId: uid(3),
    department: "土木工事部",
    submitterName: "デモ 太郎",
    submitterEmail: "t.genba@demo.example.com",
    coordinationNeeded: "協力会社への導入説明が必要",
    idempotencyKey: "seed-idea-103-mvp",
    createdAt: "2026-07-22T01:00:00.000Z",
    updatedAt: "2026-08-05T01:00:00.000Z",
  },
  {
    id: uid(104),
    title: "安全書類の電子化と提出期限のリマインド",
    currentIssue:
      "作業員名簿や資格証の写しなどの安全書類を紙で管理しており、更新漏れや提出遅れが発生している。",
    targetBusiness: "安全管理",
    targetUsers: "安全担当・現場代理人・協力会社",
    currentWorkflow: "紙の書類を回収 → ファイル保管 → 期限管理は担当者の記憶頼み。",
    improvementIdea:
      "安全書類を電子化し、有効期限・提出期限を自動通知する。",
    expectedEffects: "提出遅れ・更新漏れを防ぎ、監査対応の手間を削減する。",
    requiredData: ["資格情報", "有効期限", "作業員名簿", "教育記録"],
    relatedSystems: ["既存の安全書類ファイル"],
    implementationOptions: ["クラウドストレージ＋リマインド", "専用安全書類システム"],
    securityNotes: ["個人の資格情報の取り扱い", "保管期間の遵守"],
    openQuestions: ["紙原本との整合ルール"],
    mvpCandidate: "1工区で資格証の電子提出と期限通知を試行",
    mvpDoneDefinition: "提出期限超過が0件になること",
    stage: "production_candidate",
    approvalStatus: "approved",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-08-05T01:00:00.000Z",
    approvalActedAt: "2026-08-06T02:00:00.000Z",
    approvalReason: "コンプライアンス上の効果が大きく本番化を検討",
    createdBy: "j.gijutsu@demo.example.com",
    ownerId: uid(4),
    department: "技術部",
    submitterName: "デモ 次郎",
    submitterEmail: "j.gijutsu@demo.example.com",
    coordinationNeeded: "安全統括部門との運用ルール調整",
    idempotencyKey: "seed-idea-104-production-candidate",
    createdAt: "2026-07-26T01:00:00.000Z",
    updatedAt: "2026-08-09T01:00:00.000Z",
  },
  {
    id: uid(105),
    title: "測量データの自動取込と出来形管理の連動",
    currentIssue:
      "測量機器のデータを手動でPCへ移し、設計値との差分計算をExcelで行っている。",
    targetBusiness: "測量・出来形管理",
    targetUsers: "測量担当・主任技術者",
    currentWorkflow: "測量 → CSV取込 → Excelで差分計算 → 帳票作成。",
    improvementIdea:
      "測量データを自動取込し、設計値との差分を地図上に表示する。",
    expectedEffects: "差分計算のミスを減らし、検査対応を迅速化する。",
    requiredData: ["測量データ", "設計値", "測点情報", "図面"],
    relatedSystems: ["CAD", "測量ソフト"],
    implementationOptions: ["測量ソフトのAPI連携", "CSV自動取込ツール", "専用アプリ"],
    securityNotes: ["位置情報の取り扱い"],
    openQuestions: ["機器メーカーごとのデータ形式差異"],
    mvpCandidate: "CSV自動取込と差分一覧表示までを試行",
    mvpDoneDefinition: "差分計算の所要時間が従来比30%以下になること",
    stage: "planning",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "j.gijutsu@demo.example.com",
    ownerId: uid(4),
    department: "技術部",
    submitterName: "デモ 次郎",
    submitterEmail: "j.gijutsu@demo.example.com",
    coordinationNeeded: "CAD担当とのデータ連携",
    idempotencyKey: "seed-idea-105-planning",
    createdAt: "2026-08-01T01:00:00.000Z",
    updatedAt: "2026-08-07T01:00:00.000Z",
  },
  {
    id: uid(106),
    title: "コンクリート打設記録のIoTセンサーによる自動記録",
    currentIssue:
      "コンクリートの打設時刻・気温・スランプ値などを手書きで記録し、後から帳票へ清書している。",
    targetBusiness: "品質管理",
    targetUsers: "品質管理担当・現場代理人",
    currentWorkflow: "現場で手書き記録 → 内業で帳票へ清書 → 検査資料として保管。",
    improvementIdea:
      "センサーで打設状況を自動記録し、帳票を自動生成する。",
    expectedEffects: "記録漏れを防ぎ、品質記録の信頼性を高める。",
    requiredData: ["打設時刻", "気温", "コンクリート温度", "打設量", "位置情報"],
    relatedSystems: ["既存の品質記録帳票"],
    implementationOptions: ["IoTセンサー＋クラウド", "スマホ入力＋自動帳票", "生コン車両の記録連携"],
    securityNotes: ["現場ネットワークへの機器接続"],
    openQuestions: ["センサーの耐久性とコスト"],
    mvpCandidate: "スマホ入力＋帳票自動生成で1打設を試行",
    mvpDoneDefinition: "打設記録の清書作業が0になること",
    stage: "submitted",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "k.kyuka@demo.example.com",
    ownerId: uid(6),
    department: "品質管理部",
    submitterName: "デモ 休暇中",
    submitterEmail: "k.kyuka@demo.example.com",
    coordinationNeeded: "品質管理部門の帳票フォーマット確認",
    idempotencyKey: "seed-idea-106-submitted",
    createdAt: "2026-08-04T01:00:00.000Z",
    updatedAt: "2026-08-04T01:00:00.000Z",
  },
  {
    id: uid(107),
    title: "360度カメラによる現場巡視記録と位置連携",
    currentIssue:
      "現場巡視の記録が文章と静止画のみで、後から状況を正確に把握しにくい。",
    targetBusiness: "現場巡視・進捗管理",
    targetUsers: "現場代理人・監督員",
    currentWorkflow: "巡視 → 写真撮影 → 文章で記録 → 週報へ転記。",
    improvementIdea:
      "360度カメラで巡視記録を残し、図面上の位置と紐付けて振り返れるようにする。",
    expectedEffects: "遠隔からの状況把握が容易になり、報告時間を削減する。",
    requiredData: ["360度画像", "撮影位置", "撮影日時", "図面データ"],
    relatedSystems: ["既存の週報", "図面管理"],
    implementationOptions: ["360度カメラ＋クラウドビューア", "定点カメラ＋タイムラプス"],
    securityNotes: ["写り込む人物・情報の取り扱い"],
    openQuestions: ["画像容量と通信コスト"],
    mvpCandidate: "週1回の巡視で360度記録を試行",
    mvpDoneDefinition: "巡視報告の作成時間が半減すること",
    stage: "submitted",
    approvalStatus: "requested",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-08-11T01:00:00.000Z",
    approvalActedAt: null,
    approvalReason: "現場の遠隔把握に有効なため承認を依頼",
    createdBy: "t.genba@demo.example.com",
    ownerId: uid(3),
    department: "土木工事部",
    submitterName: "デモ 太郎",
    submitterEmail: "t.genba@demo.example.com",
    coordinationNeeded: "発注者との巡視記録ルール確認",
    idempotencyKey: "seed-idea-107-submitted-approval-requested",
    createdAt: "2026-08-06T01:00:00.000Z",
    updatedAt: "2026-08-11T01:00:00.000Z",
  },
  {
    id: uid(108),
    title: "重機の稼働状況をIoTで見える化し稼働率を改善",
    currentIssue:
      "重機の稼働状況が日報の手入力に依存しており、稼働率や待機時間の実態が把握できていない。",
    targetBusiness: "機械・重機管理",
    targetUsers: "機械担当・現場代理人",
    currentWorkflow: "日報の稼働時間を集計 → 月次の稼働率を手計算。",
    improvementIdea:
      "重機にGPS・稼働センサーを設置し、稼働率・待機時間を自動集計する。",
    expectedEffects: "重機の配置最適化とコスト削減につなげる。",
    requiredData: ["稼働時間", "待機時間", "位置情報", "燃料使用量"],
    relatedSystems: ["機械管理台帳"],
    implementationOptions: ["GPS端末のレンタル", "既存車載器の活用", "日報アプリ連携"],
    securityNotes: ["位置情報の取り扱い"],
    openQuestions: ["通信費用の負担方法"],
    mvpCandidate: "稼働率の高い3台にセンサーを設置して1か月試行",
    mvpDoneDefinition: "稼働率が5ポイント以上改善すること",
    stage: "planning",
    approvalStatus: "returned",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-08-08T01:00:00.000Z",
    approvalActedAt: "2026-08-10T03:00:00.000Z",
    approvalReason: "効果測定の基準と対象重機の選定理由を明確にして再提出",
    createdBy: "j.gijutsu@demo.example.com",
    ownerId: uid(4),
    department: "技術部",
    submitterName: "デモ 次郎",
    submitterEmail: "j.gijutsu@demo.example.com",
    coordinationNeeded: "機械担当との対象重機調整",
    idempotencyKey: "seed-idea-108-planning-returned",
    createdAt: "2026-08-03T01:00:00.000Z",
    updatedAt: "2026-08-10T03:00:00.000Z",
  },
  {
    id: uid(109),
    title: "検査官との書類受け渡しをクラウドで電子化",
    currentIssue:
      "発注者・検査官への検査資料の受け渡しを紙とUSBで行っており、差し替え時の版管理が煩雑。",
    targetBusiness: "検査・成果品管理",
    targetUsers: "主任技術者・検査担当・発注者担当者",
    currentWorkflow: "資料印刷 → 検査時に紙で提示 → 指摘後に差し替えて再提出。",
    improvementIdea:
      "検査資料をクラウドで共有し、版管理と指摘事項の対応記録を一元化する。",
    expectedEffects: "印刷・運搬を減らし、指摘対応の見える化を図る。",
    requiredData: ["検査資料", "指摘事項", "対応状況", "版情報"],
    relatedSystems: ["既存の成果品管理"],
    implementationOptions: ["クラウドストレージ共有", "専用検査支援ツール"],
    securityNotes: ["発注者との共有範囲と権限設定"],
    openQuestions: ["発注者側の利用可否"],
    mvpCandidate: "1検査でクラウド共有を試行",
    mvpDoneDefinition: "資料の版間違いが0件になること",
    stage: "verification",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "h.kaigi@demo.example.com",
    ownerId: uid(2),
    department: "技術本部",
    submitterName: "デモ 花子",
    submitterEmail: "h.kaigi@demo.example.com",
    coordinationNeeded: "発注者との運用合意が必要",
    idempotencyKey: "seed-idea-109-verification",
    createdAt: "2026-07-30T01:00:00.000Z",
    updatedAt: "2026-08-06T01:00:00.000Z",
  },
  {
    id: uid(110),
    title: "材料検収と数量管理をペーパーレス化",
    currentIssue:
      "材料の検収票が紙で回覧され、数量の集計に時間がかかっている。",
    targetBusiness: "購買・資材管理",
    targetUsers: "資材担当・現場代理人",
    currentWorkflow: "紙の検収票 → 承認印 → 資材担当がExcel集計。",
    improvementIdea:
      "検収をタブレットで行い、承認と数量集計を自動化する。",
    expectedEffects: "検収処理時間を短縮し、納入数量の誤りを早期発見する。",
    requiredData: ["発注情報", "納入数量", "検収者", "承認者", "納品書画像"],
    relatedSystems: ["購買システム", "会計システム"],
    implementationOptions: ["ワークフローシステム", "専用検収アプリ"],
    securityNotes: ["取引金額の取り扱い"],
    openQuestions: ["会計システムとの連携範囲"],
    mvpCandidate: "1現場で検収の電子承認を試行",
    mvpDoneDefinition: "検収から集計までの期間が半減すること",
    stage: "draft",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "s.jimu@demo.example.com",
    ownerId: uid(5),
    department: "総務部",
    submitterName: "デモ 幸子",
    submitterEmail: "s.jimu@demo.example.com",
    coordinationNeeded: "会計部門との承認ルール確認",
    idempotencyKey: "seed-idea-110-draft",
    createdAt: "2026-08-10T01:00:00.000Z",
    updatedAt: "2026-08-10T01:00:00.000Z",
  },
  {
    id: uid(111),
    title: "天候リスクを工程表と連動させて中止判断を支援",
    currentIssue:
      "天候による作業中止の判断が経験に依存しており、工程への影響把握が遅れる。",
    targetBusiness: "工程管理",
    targetUsers: "現場代理人・工程担当",
    currentWorkflow: "天気予報を確認 → 経験で判断 → 工程表を手修正。",
    improvementIdea:
      "気象データと工程表を連動させ、中止判断と工程への影響を提示する。",
    expectedEffects: "手戻りと待機時間を減らし、工程管理の精度を高める。",
    requiredData: ["気象データ", "工程表", "作業種別ごとの実施条件"],
    relatedSystems: ["工程管理ソフト"],
    implementationOptions: ["気象API連携", "工程ソフトの拡張"],
    securityNotes: [],
    openQuestions: ["予報精度と閾値の決め方"],
    mvpCandidate: "中止基準を表にした簡易判定シートで試行",
    mvpDoneDefinition: "中止判断の根拠を全員が共有できること",
    stage: "submitted",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "t.genba@demo.example.com",
    ownerId: uid(3),
    department: "土木工事部",
    submitterName: "デモ 太郎",
    submitterEmail: "t.genba@demo.example.com",
    coordinationNeeded: "工程管理部門との連携",
    idempotencyKey: "seed-idea-111-submitted",
    createdAt: "2026-08-09T01:00:00.000Z",
    updatedAt: "2026-08-09T01:00:00.000Z",
  },
  {
    id: uid(112),
    title: "品質記録をAIで要約して検査帳票を自動生成",
    currentIssue:
      "品質記録から検査帳票を作る作業が多く、担当者の文章表現もばらついている。",
    targetBusiness: "品質記録・帳票作成",
    targetUsers: "品質管理担当・主任技術者",
    currentWorkflow: "記録を読み返して帳票へ転記 → 表現を統一するため校正。",
    improvementIdea:
      "品質記録をAIで要約し、標準表現の帳票を下書き生成する。",
    expectedEffects: "帳票作成時間を削減し、表現のばらつきを解消する。",
    requiredData: ["品質記録", "検査項目", "判定基準"],
    relatedSystems: ["既存の品質帳票"],
    implementationOptions: ["AI要約APIの利用", "テンプレート＋自動入力"],
    securityNotes: ["AIへ送信する記録の範囲", "機密情報の排除"],
    openQuestions: ["AI要約の精度確認方法"],
    mvpCandidate: "帳票1種類を対象にAI下書きを試行",
    mvpDoneDefinition: "帳票作成時間が半減し、校正指摘が減ること",
    stage: "planning",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "j.gijutsu@demo.example.com",
    ownerId: uid(4),
    department: "技術部",
    submitterName: "デモ 次郎",
    submitterEmail: "j.gijutsu@demo.example.com",
    coordinationNeeded: "AI利用規程の確認",
    idempotencyKey: "seed-idea-112-planning",
    createdAt: "2026-08-07T01:00:00.000Z",
    updatedAt: "2026-08-07T01:00:00.000Z",
  },
  {
    id: uid(113),
    title: "現場巡視の音声メモを帳票へ自動変換",
    currentIssue:
      "巡視中の気づきを後で思い出しながら帳票化しており、記録漏れが発生する。",
    targetBusiness: "現場巡視",
    targetUsers: "現場代理人・監督員",
    currentWorkflow: "巡視 → メモ → 内業で帳票化。",
    improvementIdea:
      "巡視中の音声メモを文字起こしし、帳票の下書きを自動生成する。",
    expectedEffects: "記録漏れを減らし、帳票作成時間を削減する。",
    requiredData: ["音声データ", "巡視日時", "巡視場所"],
    relatedSystems: ["既存の巡視記録"],
    implementationOptions: ["音声認識API", "スマホ録音アプリ＋文字起こし"],
    securityNotes: ["音声に含まれる人名・会話の取り扱い"],
    openQuestions: ["現場の騒音下での認識精度"],
    mvpCandidate: "スマホ録音＋文字起こしで1週間試行",
    mvpDoneDefinition: "帳票作成時間が30%削減できること",
    stage: "rejected",
    approvalStatus: "rejected",
    approverEmail: "h.kaigi@demo.example.com",
    approvalRequestedAt: "2026-07-28T01:00:00.000Z",
    approvalActedAt: "2026-07-30T02:00:00.000Z",
    approvalReason: "騒音下の認識精度と導入コストの見合いが取れないため見送り",
    createdBy: "t.genba@demo.example.com",
    ownerId: uid(3),
    department: "土木工事部",
    submitterName: "デモ 太郎",
    submitterEmail: "t.genba@demo.example.com",
    coordinationNeeded: "",
    idempotencyKey: "seed-idea-113-rejected",
    createdAt: "2026-07-24T01:00:00.000Z",
    updatedAt: "2026-07-30T02:00:00.000Z",
  },
  {
    id: uid(114),
    title: "週報作成を半自動化して現場情報を経営層へ迅速共有",
    currentIssue:
      "週報作成に現場の貴重な時間を使い、経営層への共有も遅れがち。",
    targetBusiness: "報告・情報共有",
    targetUsers: "現場代理人・経営層",
    currentWorkflow: "週末に各担当の報告を集約 → Excelで作成 → メール送付。",
    improvementIdea:
      "日々の記録から週報を自動生成し、進捗とリスクをダッシュボード表示する。",
    expectedEffects: "週報作成時間を削減し、経営層の意思決定を迅速化する。",
    requiredData: ["日報", "工程表", "進捗写真", "リスク情報"],
    relatedSystems: ["日報システム", "工程管理ソフト"],
    implementationOptions: ["ダッシュボードツール", "既存BIの活用", "テンプレート自動生成"],
    securityNotes: ["経営情報のアクセス制御"],
    openQuestions: ["共有する指標の選定"],
    mvpCandidate: "週報テンプレートの自動生成で1か月試行",
    mvpDoneDefinition: "週報作成時間が半減すること",
    stage: "archived",
    approvalStatus: "none",
    approverEmail: "",
    approvalRequestedAt: null,
    approvalActedAt: null,
    approvalReason: "",
    createdBy: "s.jimu@demo.example.com",
    ownerId: uid(5),
    department: "総務部",
    submitterName: "デモ 幸子",
    submitterEmail: "s.jimu@demo.example.com",
    coordinationNeeded: "",
    idempotencyKey: "seed-idea-114-archived",
    createdAt: "2026-06-20T01:00:00.000Z",
    updatedAt: "2026-07-12T01:00:00.000Z",
  },
];

const comments = [
  { id: uid(201), idea_id: uid(101), author: "h.kaigi@demo.example.com", body: "写真の黒板情報との照合はOCRを使う想定ですか。", created_at: "2026-07-16T02:00:00.000Z" },
  { id: uid(202), idea_id: uid(101), author: "t.genba@demo.example.com", body: "まずは手動タグで試し、OCRは第2段階で検証したいです。", created_at: "2026-07-17T01:00:00.000Z" },
  { id: uid(203), idea_id: uid(102), author: "demo.admin@demo.example.com", body: "勤怠システム連携はセキュリティ部門と相談してください。", created_at: "2026-07-19T03:00:00.000Z" },
  { id: uid(204), idea_id: uid(103), author: "j.gijutsu@demo.example.com", body: "協力会社のアカウント発行方法を先に決めましょう。", created_at: "2026-07-23T02:00:00.000Z" },
  { id: uid(205), idea_id: uid(107), author: "h.kaigi@demo.example.com", body: "360度カメラの調達候補を共有してください。", created_at: "2026-08-07T03:00:00.000Z" },
  { id: uid(206), idea_id: uid(108), author: "demo.admin@demo.example.com", body: "効果測定の基準をKPI化してから再提出を。", created_at: "2026-08-09T02:00:00.000Z" },
];

const stageHistories = [
  { id: uid(301), idea_id: uid(101), from_stage: null, to_stage: "submitted", changed_by: "t.genba@demo.example.com", reason: "正式登録", changed_at: "2026-07-15T01:30:00.000Z" },
  { id: uid(302), idea_id: uid(101), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-16T02:00:00.000Z" },
  { id: uid(303), idea_id: uid(101), from_stage: "planning", to_stage: "mvp", changed_by: "h.kaigi@demo.example.com", reason: "MVP試行を承認", changed_at: "2026-07-22T02:00:00.000Z" },
  { id: uid(304), idea_id: uid(101), from_stage: "mvp", to_stage: "verification", changed_by: "h.kaigi@demo.example.com", reason: "効果検証へ移行", changed_at: "2026-07-30T02:00:00.000Z" },
  { id: uid(305), idea_id: uid(101), from_stage: "verification", to_stage: "production_candidate", changed_by: "h.kaigi@demo.example.com", reason: "検証結果が基準を満たした", changed_at: "2026-08-05T02:00:00.000Z" },
  { id: uid(306), idea_id: uid(101), from_stage: "production_candidate", to_stage: "production", changed_by: "demo.admin@demo.example.com", reason: "本番運用を開始", changed_at: "2026-08-10T02:00:00.000Z" },
  { id: uid(307), idea_id: uid(102), from_stage: null, to_stage: "submitted", changed_by: "s.jimu@demo.example.com", reason: "正式登録", changed_at: "2026-07-18T01:30:00.000Z" },
  { id: uid(308), idea_id: uid(102), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-20T02:00:00.000Z" },
  { id: uid(309), idea_id: uid(102), from_stage: "planning", to_stage: "mvp", changed_by: "h.kaigi@demo.example.com", reason: "MVP試行を承認", changed_at: "2026-07-27T02:00:00.000Z" },
  { id: uid(310), idea_id: uid(102), from_stage: "mvp", to_stage: "verification", changed_by: "h.kaigi@demo.example.com", reason: "効果検証へ移行", changed_at: "2026-08-08T02:00:00.000Z" },
  { id: uid(311), idea_id: uid(103), from_stage: null, to_stage: "submitted", changed_by: "t.genba@demo.example.com", reason: "正式登録", changed_at: "2026-07-22T01:30:00.000Z" },
  { id: uid(312), idea_id: uid(103), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-24T02:00:00.000Z" },
  { id: uid(313), idea_id: uid(103), from_stage: "planning", to_stage: "mvp", changed_by: "h.kaigi@demo.example.com", reason: "MVP試行を承認", changed_at: "2026-08-03T02:00:00.000Z" },
  { id: uid(314), idea_id: uid(104), from_stage: null, to_stage: "submitted", changed_by: "j.gijutsu@demo.example.com", reason: "正式登録", changed_at: "2026-07-26T01:30:00.000Z" },
  { id: uid(315), idea_id: uid(104), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-28T02:00:00.000Z" },
  { id: uid(316), idea_id: uid(104), from_stage: "planning", to_stage: "mvp", changed_by: "h.kaigi@demo.example.com", reason: "MVP試行を承認", changed_at: "2026-08-04T02:00:00.000Z" },
  { id: uid(317), idea_id: uid(104), from_stage: "mvp", to_stage: "verification", changed_by: "h.kaigi@demo.example.com", reason: "効果検証へ移行", changed_at: "2026-08-09T02:00:00.000Z" },
  { id: uid(318), idea_id: uid(104), from_stage: "verification", to_stage: "production_candidate", changed_by: "h.kaigi@demo.example.com", reason: "本番化候補へ", changed_at: "2026-08-11T02:00:00.000Z" },
  { id: uid(319), idea_id: uid(105), from_stage: null, to_stage: "submitted", changed_by: "j.gijutsu@demo.example.com", reason: "正式登録", changed_at: "2026-08-01T01:30:00.000Z" },
  { id: uid(320), idea_id: uid(105), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-08-04T02:00:00.000Z" },
  { id: uid(321), idea_id: uid(106), from_stage: null, to_stage: "submitted", changed_by: "k.kyuka@demo.example.com", reason: "正式登録", changed_at: "2026-08-04T01:30:00.000Z" },
  { id: uid(322), idea_id: uid(107), from_stage: null, to_stage: "submitted", changed_by: "t.genba@demo.example.com", reason: "正式登録", changed_at: "2026-08-06T01:30:00.000Z" },
  { id: uid(323), idea_id: uid(108), from_stage: null, to_stage: "submitted", changed_by: "j.gijutsu@demo.example.com", reason: "正式登録", changed_at: "2026-08-03T01:30:00.000Z" },
  { id: uid(324), idea_id: uid(108), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-08-05T02:00:00.000Z" },
  { id: uid(325), idea_id: uid(109), from_stage: null, to_stage: "submitted", changed_by: "h.kaigi@demo.example.com", reason: "正式登録", changed_at: "2026-07-30T01:30:00.000Z" },
  { id: uid(326), idea_id: uid(109), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-31T02:00:00.000Z" },
  { id: uid(327), idea_id: uid(109), from_stage: "planning", to_stage: "mvp", changed_by: "h.kaigi@demo.example.com", reason: "MVP試行を承認", changed_at: "2026-08-02T02:00:00.000Z" },
  { id: uid(328), idea_id: uid(109), from_stage: "mvp", to_stage: "verification", changed_by: "h.kaigi@demo.example.com", reason: "効果検証へ移行", changed_at: "2026-08-06T02:00:00.000Z" },
  { id: uid(329), idea_id: uid(111), from_stage: null, to_stage: "submitted", changed_by: "t.genba@demo.example.com", reason: "正式登録", changed_at: "2026-08-09T01:30:00.000Z" },
  { id: uid(330), idea_id: uid(112), from_stage: null, to_stage: "submitted", changed_by: "j.gijutsu@demo.example.com", reason: "正式登録", changed_at: "2026-08-07T01:30:00.000Z" },
  { id: uid(331), idea_id: uid(112), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-08-08T02:00:00.000Z" },
  { id: uid(332), idea_id: uid(113), from_stage: null, to_stage: "submitted", changed_by: "t.genba@demo.example.com", reason: "正式登録", changed_at: "2026-07-24T01:30:00.000Z" },
  { id: uid(333), idea_id: uid(113), from_stage: "submitted", to_stage: "planning", changed_by: "h.kaigi@demo.example.com", reason: "企画検討を開始", changed_at: "2026-07-26T02:00:00.000Z" },
  { id: uid(334), idea_id: uid(113), from_stage: "planning", to_stage: "rejected", changed_by: "h.kaigi@demo.example.com", reason: "導入コストと効果の見合いが取れない", changed_at: "2026-07-30T02:00:00.000Z" },
  { id: uid(335), idea_id: uid(114), from_stage: null, to_stage: "submitted", changed_by: "s.jimu@demo.example.com", reason: "正式登録", changed_at: "2026-06-20T01:30:00.000Z" },
  { id: uid(336), idea_id: uid(114), from_stage: "submitted", to_stage: "archived", changed_by: "demo.admin@demo.example.com", reason: "経営ダッシュボード計画へ統合して保管", changed_at: "2026-07-12T02:00:00.000Z" },
];

const decisions = [
  { id: uid(401), idea_id: uid(101), decision: "approve", reason: "現場負荷の削減効果が明確", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-07-22T02:00:00.000Z" },
  { id: uid(402), idea_id: uid(102), decision: "approve", reason: "全工事共通の課題で優先度が高い", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-07-27T02:00:00.000Z" },
  { id: uid(403), idea_id: uid(103), decision: "approve", reason: "効果測定が容易", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-08-03T02:00:00.000Z" },
  { id: uid(404), idea_id: uid(104), decision: "approve", reason: "コンプライアンス上の効果が大きい", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-08-04T02:00:00.000Z" },
  { id: uid(405), idea_id: uid(101), decision: "approve", reason: "本番運用を開始", decided_by: "demo.admin@demo.example.com", decided_at: "2026-08-10T02:00:00.000Z" },
  { id: uid(406), idea_id: uid(113), decision: "reject", reason: "導入コストと効果の見合いが取れない", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-07-30T02:00:00.000Z" },
  { id: uid(407), idea_id: uid(108), decision: "return", reason: "効果測定の基準を明確化", decided_by: "h.kaigi@demo.example.com", decided_at: "2026-08-10T03:00:00.000Z" },
];

const aiSessions = [
  {
    id: uid(501),
    idea_id: uid(102),
    executed_by: "s.jimu@demo.example.com",
    process_type: "questions",
    model: "claude-sonnet-5",
    input_chars: 482,
    output_chars: 612,
    result: "success",
    usage_cost_estimate: "0.0014",
    prompt_version: "questions_v2",
    input_hash: createHash("sha256").update("seed-ai-questions-1").digest("hex"),
    created_at: "2026-07-18T01:20:00.000Z",
  },
  {
    id: uid(502),
    idea_id: uid(102),
    executed_by: "s.jimu@demo.example.com",
    process_type: "structure",
    model: "claude-sonnet-5",
    input_chars: 1094,
    output_chars: 1803,
    result: "success",
    usage_cost_estimate: "0.0033",
    prompt_version: "structure_v2",
    input_hash: createHash("sha256").update("seed-ai-structure-1").digest("hex"),
    created_at: "2026-07-18T01:25:00.000Z",
  },
  {
    id: uid(503),
    idea_id: uid(105),
    executed_by: "j.gijutsu@demo.example.com",
    process_type: "questions",
    model: "deepseek-chat",
    input_chars: 356,
    output_chars: 498,
    result: "success",
    usage_cost_estimate: "0.0002",
    prompt_version: "questions_v2",
    input_hash: createHash("sha256").update("seed-ai-questions-2").digest("hex"),
    created_at: "2026-08-01T01:10:00.000Z",
  },
  {
    id: uid(504),
    idea_id: null,
    executed_by: "t.genba@demo.example.com",
    process_type: "questions",
    model: "claude-sonnet-5",
    input_chars: 120,
    output_chars: 0,
    result: "failed",
    usage_cost_estimate: "0",
    prompt_version: "questions_v2",
    input_hash: createHash("sha256").update("seed-ai-questions-failed").digest("hex"),
    created_at: "2026-08-02T05:00:00.000Z",
  },
];

const outbox = [
  {
    id: uid(601),
    event_type: "idea.created",
    resource_type: "idea",
    resource_id: uid(107),
    idempotency_key: "seed-outbox-sent",
    payload: { title: "360度カメラによる現場巡視記録と位置連携" },
    status: "sent",
    attempts: 1,
    next_attempt_at: null,
    last_error: "",
    created_at: "2026-08-06T01:30:00.000Z",
    updated_at: "2026-08-06T01:30:05.000Z",
  },
  {
    id: uid(602),
    event_type: "approval.requested",
    resource_type: "idea",
    resource_id: uid(108),
    idempotency_key: "seed-outbox-failed",
    payload: { title: "重機の稼働状況をIoTで見える化し稼働率を改善" },
    status: "failed",
    attempts: 3,
    next_attempt_at: "2026-08-10T04:00:00.000Z",
    last_error: "demo webhook 500 (fictional)",
    created_at: "2026-08-08T01:00:00.000Z",
    updated_at: "2026-08-10T03:30:00.000Z",
  },
];

/**
 * Audit-log entries with a valid SHA-256 hash chain. Mirrors the Worker's
 * audit()/computeAuditEntryHash() algorithm so /api/admin/audit-logs/verify
 * reports the chain as valid.
 */
function buildAuditLogs() {
  const rows = [
    { actor: "t.genba@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(101), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-07-15T01:30:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(101), result: "success", metadata: { stage: "planning", reason: "企画検討を開始" }, createdAt: "2026-07-16T02:00:00.000Z" },
    { actor: "s.jimu@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(102), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-07-18T01:30:00.000Z" },
    { actor: "s.jimu@demo.example.com", action: "ai.questions", resourceType: "ai_session", resourceId: uid(501), result: "success", metadata: { model: "claude-sonnet-5", promptVersion: "questions_v2" }, createdAt: "2026-07-18T01:20:00.000Z" },
    { actor: "s.jimu@demo.example.com", action: "ai.structure", resourceType: "ai_session", resourceId: uid(502), result: "success", metadata: { model: "claude-sonnet-5", promptVersion: "structure_v2" }, createdAt: "2026-07-18T01:25:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(102), result: "success", metadata: { stage: "planning", reason: "企画検討を開始" }, createdAt: "2026-07-20T02:00:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.approval.decided", resourceType: "idea", resourceId: uid(101), result: "success", metadata: { decision: "approve" }, createdAt: "2026-07-21T02:00:00.000Z" },
    { actor: "t.genba@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(103), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-07-22T01:30:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(101), result: "success", metadata: { stage: "mvp", reason: "MVP試行を承認" }, createdAt: "2026-07-22T02:00:00.000Z" },
    { actor: "t.genba@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(113), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-07-24T01:30:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.approval.decided", resourceType: "idea", resourceId: uid(102), result: "success", metadata: { decision: "approve" }, createdAt: "2026-07-26T03:00:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(102), result: "success", metadata: { stage: "mvp", reason: "MVP試行を承認" }, createdAt: "2026-07-27T02:00:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(113), result: "success", metadata: { stage: "rejected", reason: "導入コストと効果の見合いが取れない" }, createdAt: "2026-07-30T02:00:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(109), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-07-30T01:30:00.000Z" },
    { actor: "j.gijutsu@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(105), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-08-01T01:30:00.000Z" },
    { actor: "t.genba@demo.example.com", action: "ai.questions.failed", resourceType: "ai_session", resourceId: uid(504), result: "success", metadata: { model: "claude-sonnet-5" }, createdAt: "2026-08-02T05:00:00.000Z" },
    { actor: "j.gijutsu@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(108), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-08-03T01:30:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.approval.decided", resourceType: "idea", resourceId: uid(103), result: "success", metadata: { decision: "approve" }, createdAt: "2026-08-02T01:00:00.000Z" },
    { actor: "k.kyuka@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(106), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-08-04T01:30:00.000Z" },
    { actor: "t.genba@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(107), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-08-06T01:30:00.000Z" },
    { actor: "j.gijutsu@demo.example.com", action: "idea.created", resourceType: "idea", resourceId: uid(112), result: "success", metadata: { stage: "submitted" }, createdAt: "2026-08-07T01:30:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.approval.requested", resourceType: "idea", resourceId: uid(108), result: "success", metadata: { approverEmail: "h.kaigi@demo.example.com" }, createdAt: "2026-08-08T01:00:00.000Z" },
    { actor: "h.kaigi@demo.example.com", action: "idea.approval.decided", resourceType: "idea", resourceId: uid(108), result: "success", metadata: { decision: "return" }, createdAt: "2026-08-10T03:00:00.000Z" },
    { actor: "demo.admin@demo.example.com", action: "stage.update", resourceType: "idea", resourceId: uid(101), result: "success", metadata: { stage: "production", reason: "本番運用を開始" }, createdAt: "2026-08-10T02:00:00.000Z" },
    { actor: "demo.admin@demo.example.com", action: "user.created", resourceType: "app_user", resourceId: uid(5), result: "success", metadata: { role: "user" }, createdAt: "2026-08-11T01:00:00.000Z" },
    { actor: "demo.admin@demo.example.com", action: "audit_logs.verify", resourceType: "audit_logs", resourceId: "chain", result: "success", metadata: { checked: 24, legacyRows: 0, valid: true }, createdAt: "2026-08-11T02:00:00.000Z" },
  ];
  // Sort by (createdAt, id) like the verify endpoint and chain the hashes.
  const ordered = rows
    .map((row, index) => ({ ...row, id: uid(701 + index) }))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
  let prevHash = "genesis";
  const entries = [];
  for (const row of ordered) {
    const entryHash = computeAuditEntryHash(prevHash, row);
    entries.push({
      id: row.id,
      actor: row.actor,
      action: row.action,
      resourceType: row.resourceType,
      resourceId: row.resourceId,
      result: row.result,
      metadata: row.metadata,
      createdAt: row.createdAt,
      prevHash,
      entryHash,
    });
    prevHash = entryHash;
  }
  return entries;
}

function computeAuditEntryHash(prevHash, fields) {
  const payload = [
    prevHash,
    fields.actor,
    fields.action,
    fields.resourceType,
    fields.resourceId ?? "",
    fields.result,
    stableStringify(fields.metadata ?? {}),
    fields.createdAt,
  ].join("\n");
  return createHash("sha256").update(payload).digest("hex");
}

/**
 * Mirrors worker/index.ts stableStringify: jsonb does not preserve key order,
 * so both the write path and the verify path must hash a canonical form.
 */
function stableStringify(value) {
  if (value === null) return "null";
  if (typeof value === "string") return JSON.stringify(value);
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value)
      .filter(([, entryValue]) => entryValue !== undefined)
      .sort(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0));
    return `{${entries
      .map(([key, entryValue]) => `${JSON.stringify(key)}:${stableStringify(entryValue)}`)
      .join(",")}}`;
  }
  return "null";
}

async function resetTables() {
  await sql`
    truncate table notification_outbox, ai_monthly_usage_counters,
      ai_usage_counters, usage_limits, audit_logs, ai_settings,
      idea_ai_sessions, idea_comments, idea_decisions, idea_stage_histories,
      ideas, app_users
    restart identity
  `;
  console.log("Truncated seeded tables (restart identity).");
}

async function upsertUsers() {
  for (const user of users) {
    await sql`
      insert into app_users (id, email, name, department, role, status, created_by, created_at, updated_at)
      values (${user.id}, ${user.email}, ${user.name}, ${user.department}, ${user.role}, ${user.status}, 'demo.admin@demo.example.com', now(), now())
      on conflict (id) do update set
        email = excluded.email, name = excluded.name, department = excluded.department,
        role = excluded.role, status = excluded.status, updated_at = now()
    `;
  }
  return users.length;
}

async function upsertIdeas() {
  for (const idea of ideas) {
    await sql`
      insert into ideas (
        id, title, current_issue, target_business, target_users, current_workflow,
        improvement_idea, expected_effects, required_data, related_systems,
        implementation_options, security_notes, open_questions, mvp_candidate,
        mvp_done_definition, stage, created_by, owner_id, department, submitter_name,
        submitter_email, coordination_needed, idempotency_key,
        approval_status, approver_email, approval_requested_at, approval_acted_at,
        approval_reason, created_at, updated_at
      )
      values (
        ${idea.id}, ${idea.title}, ${idea.currentIssue}, ${idea.targetBusiness},
        ${idea.targetUsers}, ${idea.currentWorkflow}, ${idea.improvementIdea},
        ${idea.expectedEffects}, ${JSON.stringify(idea.requiredData)}::jsonb,
        ${JSON.stringify(idea.relatedSystems)}::jsonb,
        ${JSON.stringify(idea.implementationOptions)}::jsonb,
        ${JSON.stringify(idea.securityNotes)}::jsonb,
        ${JSON.stringify(idea.openQuestions)}::jsonb,
        ${idea.mvpCandidate}, ${idea.mvpDoneDefinition}, ${idea.stage},
        ${idea.createdBy}, ${idea.ownerId}, ${idea.department}, ${idea.submitterName},
        ${idea.submitterEmail}, ${idea.coordinationNeeded}, ${idea.idempotencyKey},
        ${idea.approvalStatus}, ${idea.approverEmail || ""},
        ${idea.approvalRequestedAt}, ${idea.approvalActedAt},
        ${idea.approvalReason}, ${idea.createdAt}, ${idea.updatedAt}
      )
      on conflict (id) do update set
        title = excluded.title, current_issue = excluded.current_issue,
        target_business = excluded.target_business, target_users = excluded.target_users,
        current_workflow = excluded.current_workflow,
        improvement_idea = excluded.improvement_idea,
        expected_effects = excluded.expected_effects,
        required_data = excluded.required_data, related_systems = excluded.related_systems,
        implementation_options = excluded.implementation_options,
        security_notes = excluded.security_notes, open_questions = excluded.open_questions,
        mvp_candidate = excluded.mvp_candidate,
        mvp_done_definition = excluded.mvp_done_definition,
        stage = excluded.stage, created_by = excluded.created_by,
        owner_id = excluded.owner_id, department = excluded.department,
        submitter_name = excluded.submitter_name,
        submitter_email = excluded.submitter_email,
        coordination_needed = excluded.coordination_needed,
        approval_status = excluded.approval_status,
        approver_email = excluded.approver_email,
        approval_requested_at = excluded.approval_requested_at,
        approval_acted_at = excluded.approval_acted_at,
        approval_reason = excluded.approval_reason,
        created_at = excluded.created_at, updated_at = excluded.updated_at
    `;
  }
  return ideas.length;
}

async function upsertSimple(table, rows, columns, conflict = "id") {
  for (const row of rows) {
    const placeholders = columns.map((_, index) => `$${index + 1}`).join(", ");
    const values = columns.map((column) => {
      const value = row[column];
      return typeof value === "object" && value !== null
      ? JSON.stringify(value)
      : value === undefined
        ? null
        : value;
    });
    await sql.query(
      `insert into ${table} (${columns.join(", ")})
       values (${placeholders})
       on conflict (${conflict}) do nothing`,
      values,
    );
  }
  return rows.length;
}

async function seedAuditLogs() {
  const entries = buildAuditLogs();
  for (const entry of entries) {
    await sql`
      insert into audit_logs (
        id, actor, action, resource_type, resource_id, result, metadata,
        prev_hash, entry_hash, created_at
      )
      values (
        ${entry.id}, ${entry.actor}, ${entry.action}, ${entry.resourceType},
        ${entry.resourceId}, ${entry.result}, ${JSON.stringify(entry.metadata)}::jsonb,
        ${entry.prevHash}, ${entry.entryHash}, ${entry.createdAt}
      )
      on conflict (id) do nothing
    `;
  }
  return entries.length;
}

async function seedMisc() {
  await sql`
    insert into ai_settings (
      provider, model, secret_name, key_last4, status, enabled,
      daily_limit, monthly_budget, updated_by
    )
    values ('demo', 'demo-local', 'demo', null,
            'connected', true, 10, 20, 'demo.admin@demo.example.com')
    on conflict do nothing
  `;
  await sql`
    insert into usage_limits (subject_type, subject_id, daily_ai_limit, monthly_budget, enabled, updated_by)
    values ('global', '*', 10, 20, true, 'demo.admin@demo.example.com')
    on conflict (subject_type, subject_id) do nothing
  `;
  await sql`
    insert into ai_usage_counters (subject_type, subject_id, usage_date, used_count, limit_count)
    values ('global', '*', current_date, 3, 10),
           ('user', 's.jimu@demo.example.com', current_date, 2, 10),
           ('global', '*', current_date - 1, 4, 10)
    on conflict (subject_type, subject_id, usage_date) do nothing
  `;
  await sql`
    insert into ai_monthly_usage_counters (subject_type, subject_id, usage_month, used_cost_estimate, budget)
    values ('global', '*', date_trunc('month', now())::date, 0.0051, 20)
    on conflict (subject_type, subject_id, usage_month) do nothing
  `;
}

async function main() {
  console.log(`MVP seed: ${reset ? "reset" : "upsert"} mode → ${databaseUrl.replace(/:[^:@/]+@/, ":***@")}`);
  if (reset) await resetTables();
  const counts = {
    users: await upsertUsers(),
    ideas: await upsertIdeas(),
    comments: await upsertSimple(
      "idea_comments",
      comments,
      ["id", "idea_id", "author", "body", "created_at"],
    ),
    histories: await upsertSimple(
      "idea_stage_histories",
      stageHistories,
      ["id", "idea_id", "from_stage", "to_stage", "changed_by", "reason", "changed_at"],
    ),
    decisions: await upsertSimple(
      "idea_decisions",
      decisions,
      ["id", "idea_id", "decision", "reason", "decided_by", "decided_at"],
    ),
    aiSessions: await upsertSimple(
      "idea_ai_sessions",
      aiSessions,
      ["id", "idea_id", "executed_by", "process_type", "model", "input_chars", "output_chars", "result", "usage_cost_estimate", "prompt_version", "input_hash", "created_at"],
    ),
    outbox: await upsertSimple(
      "notification_outbox",
      outbox,
      ["id", "event_type", "resource_type", "resource_id", "idempotency_key", "payload", "status", "attempts", "next_attempt_at", "last_error", "created_at", "updated_at"],
      "idempotency_key",
    ),
    auditLogs: await seedAuditLogs(),
  };
  await seedMisc();

  const stages = await sql`select stage, count(*)::int as n from ideas group by stage order by stage`;
  console.log("Seed summary:");
  console.log(JSON.stringify(counts, null, 2));
  console.log("Stages:", stages.map((row) => `${row.stage}=${row.n}`).join(", "));
  console.log("Done. Dummy data is kept in place for the MVP demo.");
}

main().catch((error) => {
  console.error("MVP seed failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
