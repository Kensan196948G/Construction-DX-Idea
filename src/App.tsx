import { useEffect, useRef } from "react";
import { ApiClientError, api } from "./lib/api";

const designPath = "/design/construction-dx-idea.html";

export function App() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      bindIntegratedAiKeyControls(frameRef.current);
    }, 700);

    return () => window.clearInterval(intervalId);
  }, []);

  return (
    <main className="standaloneDesignShell" aria-label="Construction DX Idea">
      <iframe
        ref={frameRef}
        className="standaloneDesignFrame"
        title="Construction DX Idea"
        src={designPath}
        onLoad={() => {
          window.setTimeout(() => bindIntegratedAiKeyControls(frameRef.current), 500);
        }}
      />
    </main>
  );
}

function bindIntegratedAiKeyControls(frame: HTMLIFrameElement | null) {
  const doc = frame?.contentDocument;
  if (!doc) return;

  const input = doc.getElementById("admin-api-key-input") as HTMLInputElement | null;
  const testButton = doc.getElementById("admin-api-key-test-button") as HTMLButtonElement | null;
  const clearButton = doc.getElementById("admin-api-key-clear-button") as HTMLButtonElement | null;
  const status = doc.getElementById("admin-api-key-status") as HTMLElement | null;
  if (!input || !testButton || !clearButton || !status || testButton.dataset.bridgeBound === "true") {
    return;
  }

  testButton.dataset.bridgeBound = "true";
  clearButton.dataset.bridgeBound = "true";

  testButton.addEventListener("click", () => {
    void testConnectionWithEnteredKey(doc, input, testButton, status);
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    showStatus(status, "", "neutral");
  });
}

async function testConnectionWithEnteredKey(
  doc: Document,
  input: HTMLInputElement,
  button: HTMLButtonElement,
  status: HTMLElement,
) {
  const apiKey = input.value.trim();
  if (!apiKey) {
    showStatus(status, "APIキーを入力してください。", "error");
    return;
  }

  const model = doc.querySelector<HTMLSelectElement>("select")?.value;
  button.disabled = true;
  button.style.opacity = "0.62";
  button.style.cursor = "wait";
  showStatus(status, "接続確認中です。APIキーは保存しません。", "neutral");

  try {
    const result = await api.testAiSettings(apiKey, model);
    const keyLast4 = result.keyLast4 ?? apiKey.slice(-4);
    showStatus(
      status,
      result.ok
        ? `接続成功: ${result.message} キー末尾 ${keyLast4}`
        : `接続失敗: ${result.message}`,
      result.ok ? "success" : "error",
    );
  } catch (error) {
    showStatus(status, toErrorMessage(error), "error");
  } finally {
    input.value = "";
    button.disabled = false;
    button.style.opacity = "1";
    button.style.cursor = "pointer";
  }
}

function showStatus(status: HTMLElement, message: string, tone: "success" | "error" | "neutral") {
  status.textContent = message;
  const styles = {
    success: "background:#E4F3EC;color:#1F8255;border:1px solid #CBE8DA;",
    error: "background:#FCE9E7;color:#C5392F;border:1px solid #F4C7C2;",
    neutral: "background:#F2F4F8;color:#5A6678;border:1px solid #E3E8EF;",
  };
  status.style.cssText =
    "display:" +
    (message ? "block" : "none") +
    ";margin-top:2px;padding:9px 11px;border-radius:8px;font-size:12.5px;font-weight:500;" +
    styles[tone];
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "接続テストに失敗しました。";
}
