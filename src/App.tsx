import { FormEvent, useRef, useState } from "react";
import { ApiClientError, api } from "./lib/api";

const designPath = "/design/construction-dx-idea.html";

type TestStatus =
  | { tone: "idle"; message: "" }
  | { tone: "neutral" | "success" | "error"; message: string };

export function App() {
  const apiKeyRef = useRef<HTMLInputElement>(null);
  const modelRef = useRef<HTMLSelectElement>(null);
  const [isTesting, setIsTesting] = useState(false);
  const [status, setStatus] = useState<TestStatus>({ tone: "idle", message: "" });

  async function handleConnectionTest(event: FormEvent) {
    event.preventDefault();
    const input = apiKeyRef.current;
    const apiKey = input?.value.trim() ?? "";

    if (!apiKey) {
      setStatus({ tone: "error", message: "APIキーを入力してください。" });
      return;
    }

    setIsTesting(true);
    setStatus({ tone: "neutral", message: "接続確認中です。APIキーは保存しません。" });

    try {
      const result = await api.testAiSettings(apiKey, modelRef.current?.value);
      const keyLast4 = result.keyLast4 ?? apiKey.slice(-4);
      setStatus({
        tone: result.ok ? "success" : "error",
        message: result.ok
          ? `接続成功: ${result.message} キー末尾 ${keyLast4}`
          : `接続失敗: ${result.message}`,
      });
    } catch (error) {
      setStatus({ tone: "error", message: toErrorMessage(error) });
    } finally {
      if (input) input.value = "";
      setIsTesting(false);
    }
  }

  function clearApiKey() {
    if (apiKeyRef.current) apiKeyRef.current.value = "";
    setStatus({ tone: "idle", message: "" });
  }

  return (
    <main className="standaloneDesignShell" aria-label="Construction DX Idea">
      <iframe className="standaloneDesignFrame" title="Construction DX Idea" src={designPath} />

      <section className="aiKeyPanel" aria-label="AI接続設定">
        <div className="aiKeyPanelHeader">
          <div>
            <span>AI設定</span>
            <h2>Claude APIキー</h2>
          </div>
          <strong>接続テスト用</strong>
        </div>

        <form className="aiKeyForm" onSubmit={handleConnectionTest}>
          <label>
            モデル
            <select ref={modelRef} defaultValue="claude-sonnet-4.5">
              <option value="claude-sonnet-4.5">Claude Sonnet 4.5</option>
              <option value="claude-opus-4.1">Claude Opus 4.1</option>
              <option value="claude-haiku-4.5">Claude Haiku 4.5</option>
            </select>
          </label>

          <label>
            Claude APIキー
            <input
              ref={apiKeyRef}
              type="password"
              autoComplete="off"
              spellCheck={false}
              placeholder="sk-ant-... を入力"
            />
          </label>

          <p>
            入力値は保存・再表示しません。接続テスト時だけWorkerへ送信し、完了後に入力欄をクリアします。
          </p>

          <div className="aiKeyActions">
            <button type="submit" className="aiKeyPrimary" disabled={isTesting}>
              {isTesting ? "接続確認中..." : "入力キーで接続テスト"}
            </button>
            <button type="button" className="aiKeySecondary" onClick={clearApiKey} disabled={isTesting}>
              クリア
            </button>
          </div>
        </form>

        {status.message && (
          <div className={`aiKeyStatus ${status.tone}`} role="status" aria-live="polite">
            {status.message}
          </div>
        )}
      </section>
    </main>
  );
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "接続テストに失敗しました。";
}
