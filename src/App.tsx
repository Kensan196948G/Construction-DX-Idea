import {
  AlertTriangle,
  BarChart3,
  Bot,
  Building2,
  CheckCircle2,
  ClipboardList,
  Database,
  FileCheck2,
  Gauge,
  GitBranch,
  LockKeyhole,
  MessageSquare,
  Rocket,
  Send,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ApiClientError, api, isMockApi } from "./lib/api";
import {
  type AiQuestion,
  type AiSettings,
  type DashboardMetrics,
  type Idea,
  type IdeaStage,
  type IssueInput,
  type PrivacyFinding,
  type StructuredIdea,
  type UserProfile,
  ideaStages,
  stageLabels,
} from "./lib/shared";

const initialInput: IssueInput = {
  workType: "",
  affectedRole: "",
  currentWorkflow: "",
  desiredState: "",
  usedData: "",
  relatedSystems: "",
  confidentiality: "unknown",
};

type WizardStep = "input" | "privacy" | "questions" | "structure" | "complete";

export function App() {
  const [metrics, setMetrics] = useState<DashboardMetrics | null>(null);
  const [ideas, setIdeas] = useState<Idea[]>([]);
  const [settings, setSettings] = useState<AiSettings | null>(null);
  const [currentUser, setCurrentUser] = useState<UserProfile | null>(null);
  const [input, setInput] = useState<IssueInput>(initialInput);
  const [findings, setFindings] = useState<PrivacyFinding[]>([]);
  const [questions, setQuestions] = useState<AiQuestion[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [structured, setStructured] = useState<StructuredIdea | null>(null);
  const [step, setStep] = useState<WizardStep>("input");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isBusy, setIsBusy] = useState(false);
  const [message, setMessage] = useState<string>("");
  const [errorMessage, setErrorMessage] = useState<string>("");

  const refresh = useCallback(async () => {
    const nextUser = await api.getMe();
    const [nextMetrics, nextIdeas] = await Promise.all([api.getMetrics(), api.listIdeas()]);
    const nextSettings = nextUser.roles.includes("system_admin") ? await api.getAiSettings() : null;
    setCurrentUser(nextUser);
    setMetrics(nextMetrics);
    setIdeas(nextIdeas);
    setSettings(nextSettings);
    setSelectedId((current) => current ?? nextIdeas[0]?.id ?? null);
  }, []);

  useEffect(() => {
    void refresh().catch((error: unknown) => setErrorMessage(toErrorMessage(error)));
  }, [refresh]);

  const selectedIdea = useMemo(
    () => ideas.find((idea) => idea.id === selectedId) ?? ideas[0],
    [ideas, selectedId],
  );
  const isAdmin = currentUser?.roles.includes("admin") ?? false;
  const isSystemAdmin = currentUser?.roles.includes("system_admin") ?? false;

  async function handleInputSubmit(event: FormEvent) {
    event.preventDefault();
    setIsBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const nextFindings = await api.inspectInput(input);
      setFindings(nextFindings);
      setStep("privacy");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function continueToQuestions() {
    setIsBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const nextQuestions = await api.generateQuestions(input);
      setQuestions(nextQuestions);
      setStep("questions");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
      setQuestions([]);
    } finally {
      setIsBusy(false);
    }
  }

  async function buildStructure() {
    setIsBusy(true);
    setMessage("");
    setErrorMessage("");
    try {
      const nextStructured = await api.structureIdea(input, answers);
      setStructured(nextStructured);
      setStep("structure");
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  function buildManualStructure() {
    setStructured(createManualStructuredIdea(input, answers));
    setStep("structure");
    setMessage("AIを使わず、入力内容から確認用の下書きを作成しました。");
    setErrorMessage("");
  }

  async function saveStructured(stage: IdeaStage) {
    if (!structured) return;
    setIsBusy(true);
    setErrorMessage("");
    try {
      const saved = await api.saveIdea(structured, stage);
      await refresh();
      setSelectedId(saved.id);
      setStep("complete");
      setMessage(stage === "draft" ? "下書きとして保存しました。" : registrationMessage(saved.notificationStatus));
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  async function updateStage(id: string, stage: IdeaStage) {
    setIsBusy(true);
    setErrorMessage("");
    try {
      await api.updateStage(id, stage);
      await refresh();
      setMessage(`ステージを「${stageLabels[stage]}」へ更新しました。`);
    } catch (error) {
      setErrorMessage(toErrorMessage(error));
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <div className="appShell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brandMark">
            <Building2 size={24} />
          </div>
          <div>
            <strong>Construction-DX-Idea</strong>
            <span>AI活用型DXアイデア管理</span>
          </div>
        </div>
        <nav className="navList" aria-label="主要メニュー">
          <a href="#dashboard">
            <Gauge size={18} /> ダッシュボード
          </a>
          <a href="#wizard">
            <Sparkles size={18} /> 困りごと登録
          </a>
          <a href="#ideas">
            <ClipboardList size={18} /> アイデア一覧
          </a>
          <a href="#security">
            <ShieldCheck size={18} /> セキュリティ
          </a>
        </nav>
        <div className="sidePanel">
          <div className="sidePanelTitle">
            <Bot size={16} /> AI接続
          </div>
          <strong>{settings ? (settings.enabled ? "有効" : "MVP安全モード") : "管理者設定"}</strong>
          <span>{settings?.model ?? "管理者のみ表示"}</span>
          <span>{settings ? `日次上限 ${settings.dailyLimit} 回` : "手動登録は常時利用可"}</span>
        </div>
      </aside>

      <main className="main">
        <header className="topbar">
          <div>
            <p className="eyebrow">Monitor / Development / Verify / Improvement</p>
            <h1>現場の困りごとを、検証可能なDXアイデアへ</h1>
          </div>
          <div className="statusPills">
            <span>
              <LockKeyhole size={15} /> Access前提
            </span>
            <span>
              <Database size={15} /> Neon正本
            </span>
            <span>
              <MessageSquare size={15} /> Slack通知
            </span>
          </div>
        </header>

        {message && (
          <div className="notice" role="status">
            <CheckCircle2 size={18} /> {message}
          </div>
        )}

        {isMockApi && (
          <div className="mockNotice" role="status">
            <AlertTriangle size={18} /> モックAPIモードで動作中です。本番ではWorker API URLを設定してください。
          </div>
        )}

        {errorMessage && (
          <div className="errorNotice" role="alert">
            <AlertTriangle size={18} /> {errorMessage}
          </div>
        )}

        <section id="dashboard" className="metricsGrid">
          <Metric icon={<ClipboardList />} label="登録アイデア" value={metrics?.totalIdeas ?? 0} />
          <Metric icon={<GitBranch />} label="進行中" value={metrics?.activeIdeas ?? 0} />
          <Metric icon={<Rocket />} label="MVP" value={metrics?.mvpIdeas ?? 0} />
          <Metric icon={<AlertTriangle />} label="注意事項" value={metrics?.securityWarnings ?? 0} />
          <Metric icon={<BarChart3 />} label="本日AI利用" value={metrics?.aiCallsToday ?? 0} />
        </section>

        <section id="wizard" className="workspace">
          <div className="sectionHeader">
            <div>
              <p className="eyebrow">Wizard</p>
              <h2>困りごと入力</h2>
            </div>
            <StepIndicator step={step} />
          </div>

          {step === "input" && (
            <form className="wizardForm" onSubmit={handleInputSubmit}>
              <Field
                label="どのような仕事で困っていますか"
                value={input.workType}
                required
                onChange={(value) => setInput({ ...input, workType: value })}
              />
              <Field
                label="誰が困っていますか"
                value={input.affectedRole}
                onChange={(value) => setInput({ ...input, affectedRole: value })}
              />
              <Field
                label="現在どのように作業していますか"
                value={input.currentWorkflow}
                required
                onChange={(value) => setInput({ ...input, currentWorkflow: value })}
              />
              <Field
                label="どうなれば改善されますか"
                value={input.desiredState}
                required
                onChange={(value) => setInput({ ...input, desiredState: value })}
              />
              <div className="formRow">
                <Field
                  label="使用中のデータ"
                  value={input.usedData}
                  onChange={(value) => setInput({ ...input, usedData: value })}
                />
                <Field
                  label="関連する既存システム"
                  value={input.relatedSystems}
                  onChange={(value) => setInput({ ...input, relatedSystems: value })}
                />
              </div>
              <label className="selectLabel">
                個人情報や社外秘を含む可能性
                <select
                  value={input.confidentiality}
                  onChange={(event) =>
                    setInput({
                      ...input,
                      confidentiality: event.target.value as IssueInput["confidentiality"],
                    })
                  }
                >
                  <option value="none">なし</option>
                  <option value="possible">あり</option>
                  <option value="unknown">不明</option>
                </select>
              </label>
              <button className="primaryButton" disabled={isBusy}>
                <ShieldCheck size={18} /> 入力検査へ進む
              </button>
            </form>
          )}

          {step === "privacy" && (
            <div className="reviewPanel">
              <h3>入力検査・匿名化確認</h3>
              {findings.length === 0 ? (
                <p className="empty">機密情報候補は検出されませんでした。</p>
              ) : (
                <div className="findingList">
                  {findings.map((finding, index) => (
                    <div className={`finding ${finding.severity}`} key={`${finding.type}-${index}`}>
                      <AlertTriangle size={18} />
                      <div>
                        <strong>{finding.label}</strong>
                        <span>{finding.excerpt}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {findings.some((finding) => finding.severity === "blocker") && (
                <p className="errorText">ブロッカーがあるため、AIへ進む前に入力を修正してください。</p>
              )}
              <div className="actions">
                <button className="secondaryButton" onClick={() => setStep("input")}>
                  入力を修正
                </button>
                <button
                  className="primaryButton"
                  disabled={isBusy || findings.some((finding) => finding.severity === "blocker")}
                  onClick={continueToQuestions}
                >
                  <Bot size={18} /> AI壁打ちへ
                </button>
                <button
                  className="secondaryButton"
                  disabled={isBusy || findings.some((finding) => finding.severity === "blocker")}
                  onClick={buildManualStructure}
                >
                  AIを使わず確認へ
                </button>
              </div>
            </div>
          )}

          {step === "questions" && (
            <div className="reviewPanel">
              <h3>AIからの追加質問</h3>
              <div className="questionList">
                {questions.map((question) => (
                  <label key={question.id}>
                    <span>{question.question}</span>
                    <small>{question.purpose}</small>
                    <input
                      value={answers[question.id] ?? ""}
                      onChange={(event) =>
                        setAnswers({
                          ...answers,
                          [question.id]: event.target.value,
                        })
                      }
                      placeholder="回答を入力"
                    />
                  </label>
                ))}
              </div>
              <div className="actions">
                <button className="secondaryButton" onClick={() => setStep("privacy")}>
                  戻る
                </button>
                <button className="primaryButton" disabled={isBusy} onClick={buildStructure}>
                  <Sparkles size={18} /> 構造化する
                </button>
                <button className="secondaryButton" disabled={isBusy} onClick={buildManualStructure}>
                  AIを使わず確認へ
                </button>
              </div>
            </div>
          )}

          {step === "structure" && structured && (
            <div className="reviewPanel">
              <h3>AI構造化結果</h3>
              <StructuredEditor value={structured} onChange={setStructured} />
              <div className="actions">
                <button className="secondaryButton" onClick={() => setStep("questions")}>
                  AIと再検討
                </button>
                <button className="secondaryButton" disabled={isBusy} onClick={() => void saveStructured("draft")}>
                  下書き保存
                </button>
                <button
                  className="primaryButton"
                  disabled={isBusy}
                  onClick={() => void saveStructured("submitted")}
                >
                  <Send size={18} /> 正式登録
                </button>
              </div>
            </div>
          )}

          {step === "complete" && (
            <div className="reviewPanel completePanel">
              <FileCheck2 size={34} />
              <h3>登録フローが完了しました</h3>
              <p>登録内容は一覧と詳細画面に反映されています。</p>
              <button
                className="primaryButton"
                onClick={() => {
                  setInput(initialInput);
                  setFindings([]);
                  setQuestions([]);
                  setAnswers({});
                  setStructured(null);
                  setStep("input");
                }}
              >
                新しい困りごとを入力
              </button>
            </div>
          )}
        </section>

        <section id="ideas" className="ideasLayout">
          <div className="ideaListPanel">
            <div className="sectionHeader">
              <div>
                <p className="eyebrow">Portfolio</p>
                <h2>アイデア一覧</h2>
              </div>
            </div>
            <div className="ideaList">
              {ideas.map((idea) => (
                <button
                  className={`ideaRow ${selectedIdea?.id === idea.id ? "active" : ""}`}
                  key={idea.id}
                  onClick={() => setSelectedId(idea.id)}
                >
                  <span className={`stageBadge ${idea.stage}`}>{stageLabels[idea.stage]}</span>
                  <strong>{idea.title}</strong>
                  <small>{idea.targetBusiness}</small>
                </button>
              ))}
            </div>
          </div>

          {selectedIdea && (
            <article className="ideaDetail">
              <div className="detailHeader">
                <div>
                  <span className={`stageBadge ${selectedIdea.stage}`}>{stageLabels[selectedIdea.stage]}</span>
                  <h2>{selectedIdea.title}</h2>
                </div>
                {isAdmin ? (
                  <select
                    value={selectedIdea.stage}
                    onChange={(event) => void updateStage(selectedIdea.id, event.target.value as IdeaStage)}
                    disabled={isBusy}
                    aria-label="ステージ変更"
                  >
                    {ideaStages.map((stage) => (
                      <option key={stage} value={stage}>
                        {stageLabels[stage]}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="readonlyRole">閲覧のみ</span>
                )}
              </div>
              <DetailGrid idea={selectedIdea} />
            </article>
          )}
        </section>

        <section id="security" className="securityBand">
          <div>
            <p className="eyebrow">Security</p>
            <h2>AI利用とAPIキー管理の安全策</h2>
          </div>
          <div className="securityGrid">
            <SecurityItem icon={<LockKeyhole />} title="Secret分離" text="APIキー本体はWebUI、GitHub、Neonへ保存しません。" />
            <SecurityItem icon={<ShieldCheck />} title="送信前検査" text="メール、案件番号、金額、IPなどを検出して警告します。" />
            <SecurityItem icon={<BarChart3 />} title="利用制限" text="日次回数、文字数、月間予算、緊急停止を管理します。" />
            <SecurityItem icon={<FileCheck2 />} title="人間確認" text="AI結果は正式登録前に必ず利用者が確認・修正します。" />
          </div>
          {isSystemAdmin && settings && (
            <AiSettingsPanel
              settings={settings}
              isBusy={isBusy}
              onSaved={(nextSettings) => {
                setSettings(nextSettings);
                setMessage("AI接続設定を更新しました。");
              }}
              onError={setErrorMessage}
            />
          )}
        </section>
      </main>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <div className="metricCard">
      <div className="metricIcon">{icon}</div>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function StepIndicator({ step }: { step: WizardStep }) {
  const steps: Array<[WizardStep, string]> = [
    ["input", "入力"],
    ["privacy", "検査"],
    ["questions", "壁打ち"],
    ["structure", "確認"],
    ["complete", "完了"],
  ];
  const activeIndex = steps.findIndex(([key]) => key === step);

  return (
    <div className="stepIndicator">
      {steps.map(([key, label], index) => (
        <span className={index <= activeIndex ? "done" : ""} key={key}>
          {label}
        </span>
      ))}
    </div>
  );
}

function Field({
  label,
  value,
  required,
  onChange,
}: {
  label: string;
  value: string;
  required?: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label>
      <span>
        {label}
        {required && <b>必須</b>}
      </span>
      <textarea value={value} required={required} onChange={(event) => onChange(event.target.value)} />
    </label>
  );
}

function StructuredEditor({
  value,
  onChange,
}: {
  value: StructuredIdea;
  onChange: (value: StructuredIdea) => void;
}) {
  const textFields: Array<[keyof StructuredIdea, string]> = [
    ["title", "アイデア名"],
    ["currentIssue", "現在の課題"],
    ["targetBusiness", "対象業務"],
    ["targetUsers", "対象利用者"],
    ["currentWorkflow", "現行手順"],
    ["improvementIdea", "改善案"],
    ["expectedEffects", "期待効果"],
    ["mvpCandidate", "MVP候補"],
    ["mvpDoneDefinition", "MVPの終点"],
  ];

  return (
    <div className="structuredGrid">
      {textFields.map(([key, label]) => (
        <label key={key}>
          <span>{label}</span>
          <textarea
            value={String(value[key])}
            onChange={(event) => onChange({ ...value, [key]: event.target.value })}
          />
        </label>
      ))}
      <TagEditor label="必要なデータ" values={value.requiredData} onChange={(requiredData) => onChange({ ...value, requiredData })} />
      <TagEditor
        label="関連システム"
        values={value.relatedSystems}
        onChange={(relatedSystems) => onChange({ ...value, relatedSystems })}
      />
      <TagEditor
        label="実現方式候補"
        values={value.implementationOptions}
        onChange={(implementationOptions) => onChange({ ...value, implementationOptions })}
      />
      <TagEditor
        label="セキュリティ注意"
        values={value.securityNotes}
        onChange={(securityNotes) => onChange({ ...value, securityNotes })}
      />
      <TagEditor
        label="未確認事項"
        values={value.openQuestions}
        onChange={(openQuestions) => onChange({ ...value, openQuestions })}
      />
    </div>
  );
}

function TagEditor({
  label,
  values,
  onChange,
}: {
  label: string;
  values: string[];
  onChange: (values: string[]) => void;
}) {
  return (
    <label>
      <span>{label}</span>
      <textarea
        value={values.join("\n")}
        onChange={(event) =>
          onChange(
            event.target.value
              .split("\n")
              .map((item) => item.trim())
              .filter(Boolean),
          )
        }
      />
    </label>
  );
}

function DetailGrid({ idea }: { idea: Idea }) {
  const rows = [
    ["課題", idea.currentIssue],
    ["改善案", idea.improvementIdea],
    ["期待効果", idea.expectedEffects],
    ["MVP", idea.mvpCandidate],
    ["MVP終点", idea.mvpDoneDefinition],
    ["セキュリティ注意", idea.securityNotes.join("\n")],
    ["未確認事項", idea.openQuestions.join("\n")],
  ];

  return (
    <div className="detailGrid">
      {rows.map(([label, text]) => (
        <section key={label}>
          <h3>{label}</h3>
          <p>{text}</p>
        </section>
      ))}
    </div>
  );
}

function SecurityItem({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="securityItem">
      <div>{icon}</div>
      <strong>{title}</strong>
      <span>{text}</span>
    </div>
  );
}

function AiSettingsPanel({
  settings,
  isBusy,
  onSaved,
  onError,
}: {
  settings: AiSettings;
  isBusy: boolean;
  onSaved: (settings: AiSettings) => void;
  onError: (message: string) => void;
}) {
  const [model, setModel] = useState(settings.model);
  const [enabled, setEnabled] = useState(settings.enabled);
  const [dailyLimit, setDailyLimit] = useState(settings.dailyLimit);
  const [monthlyBudget, setMonthlyBudget] = useState(settings.monthlyBudget);
  const [apiKey, setApiKey] = useState("");
  const [testMessage, setTestMessage] = useState("");
  const [panelBusy, setPanelBusy] = useState(false);

  async function save() {
    setPanelBusy(true);
    onError("");
    try {
      const nextSettings = await api.updateAiSettings({
        model,
        enabled,
        dailyLimit,
        monthlyBudget,
      });
      onSaved(nextSettings);
    } catch (error) {
      onError(toErrorMessage(error));
    } finally {
      setPanelBusy(false);
    }
  }

  async function testConnection() {
    setPanelBusy(true);
    onError("");
    try {
      const result = await api.testAiSettings(apiKey || undefined, model);
      setApiKey("");
      setTestMessage(result.message);
    } catch (error) {
      onError(toErrorMessage(error));
    } finally {
      setPanelBusy(false);
    }
  }

  return (
    <div className="adminPanel">
      <div>
        <p className="eyebrow">Admin</p>
        <h3>AI接続設定</h3>
      </div>
      <div className="adminGrid">
        <label>
          <span>モデル</span>
          <input value={model} onChange={(event) => setModel(event.target.value)} />
        </label>
        <label>
          <span>日次上限</span>
          <input
            type="number"
            min={0}
            value={dailyLimit}
            onChange={(event) => setDailyLimit(Number(event.target.value))}
          />
        </label>
        <label>
          <span>月額予算</span>
          <input
            type="number"
            min={0}
            value={monthlyBudget}
            onChange={(event) => setMonthlyBudget(Number(event.target.value))}
          />
        </label>
        <label className="checkboxLabel">
          <input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} />
          <span>AI機能を有効にする</span>
        </label>
        <label>
          <span>接続テスト用APIキー</span>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="未入力時は保存済みSecretを使用"
          />
        </label>
      </div>
      {testMessage && <p className="empty">{testMessage}</p>}
      <div className="actions">
        <button className="secondaryButton" disabled={isBusy || panelBusy} onClick={testConnection}>
          接続テスト
        </button>
        <button className="primaryButton" disabled={isBusy || panelBusy} onClick={save}>
          設定保存
        </button>
      </div>
    </div>
  );
}

function createManualStructuredIdea(input: IssueInput, answers: Record<string, string>): StructuredIdea {
  const answerText = Object.values(answers).filter(Boolean).join("\n");
  return {
    title: `${input.workType.slice(0, 36) || "現場業務"}の改善`,
    currentIssue: input.workType,
    targetBusiness: input.workType,
    targetUsers: input.affectedRole || "未確認",
    currentWorkflow: input.currentWorkflow,
    improvementIdea: input.desiredState,
    expectedEffects: "利用者確認により効果仮説を追記する。",
    requiredData: [input.usedData || "未確認"],
    relatedSystems: [input.relatedSystems || "未確認"],
    implementationOptions: ["手動整理", "WebUI登録", "関係者レビュー"],
    securityNotes: ["AIを使わず作成。正式登録前に機密情報の有無を確認する。"],
    openQuestions: answerText ? [answerText] : ["頻度、作業時間、関係者、既存データを確認する。"],
    mvpCandidate: "対象業務を限定して手順整理から開始する。",
    mvpDoneDefinition: "利用者が現行手順、改善案、検証範囲を確認できること。",
  };
}

function registrationMessage(status?: "sent" | "skipped" | "failed"): string {
  if (status === "sent") return "正式登録し、Slack通知を送信しました。";
  if (status === "failed") return "正式登録しました。Slack通知は失敗したため再送対象に記録しました。";
  if (status === "skipped") return "正式登録しました。Slack通知先は未設定です。";
  return "正式登録しました。";
}

function toErrorMessage(error: unknown): string {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "処理に失敗しました。";
}
