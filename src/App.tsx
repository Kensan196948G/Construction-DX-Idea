import { useEffect, useRef } from "react";
import { ApiClientError, api } from "./lib/api";

const designPath = "/design/construction-dx-idea.html";

export function App() {
  const frameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      injectApiKeyField(frameRef.current);
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
          window.setTimeout(() => injectApiKeyField(frameRef.current), 500);
        }}
      />
    </main>
  );
}

function injectApiKeyField(frame: HTMLIFrameElement | null) {
  const doc = frame?.contentDocument;
  if (!doc || doc.getElementById("admin-api-key-bridge")) return;

  const screen = Array.from(doc.querySelectorAll<HTMLElement>("[data-screen-label]")).find(
    (element) => element.dataset.screenLabel === "AI設定" && isVisible(element),
  );
  if (!screen) return;

  const settingsCard = screen.firstElementChild;
  if (!(settingsCard instanceof HTMLElement)) return;

  const monthlyCapField = Array.from(settingsCard.querySelectorAll("label"))
    .find((label) => label.textContent?.includes("月間利用上限"))
    ?.parentElement;
  const connectionTestBlock = Array.from(settingsCard.querySelectorAll("button"))
    .find((button) => button.textContent?.includes("接続テスト"))
    ?.parentElement;

  const field = doc.createElement("div");
  field.id = "admin-api-key-bridge";
  field.style.cssText =
    "display:flex;flex-direction:column;gap:7px;padding:12px;border:1px solid #E3E8EF;border-radius:8px;background:#FAFBFC;";

  const label = doc.createElement("label");
  label.textContent = "Claude APIキー（接続テスト用）";
  label.style.cssText = "font-size:12px;font-weight:600;color:#5A6678;";

  const input = doc.createElement("input");
  input.type = "password";
  input.autocomplete = "off";
  input.spellcheck = false;
  input.placeholder = "sk-ant-... を入力";
  input.style.cssText =
    "font-size:13px;padding:8px 11px;border:1px solid #E3E8EF;border-radius:8px;background:#fff;color:#1A2433;width:100%;outline:none;box-sizing:border-box;";

  const help = doc.createElement("div");
  help.textContent =
    "入力値は保存・再表示しません。接続テスト時だけWorkerへ送信し、成功後は末尾4文字だけ確認します。";
  help.style.cssText = "font-size:11.5px;line-height:1.5;color:#8A97A8;";

  const actionRow = doc.createElement("div");
  actionRow.style.cssText = "display:flex;align-items:center;gap:8px;flex-wrap:wrap;";

  const testButton = doc.createElement("button");
  testButton.type = "button";
  testButton.textContent = "入力キーで接続テスト";
  testButton.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid #E08A2B;background:#E08A2B;color:#fff;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:600;";

  const clearButton = doc.createElement("button");
  clearButton.type = "button";
  clearButton.textContent = "クリア";
  clearButton.style.cssText =
    "display:inline-flex;align-items:center;gap:6px;cursor:pointer;border:1px solid #E3E8EF;background:#fff;color:#5A6678;padding:8px 14px;border-radius:8px;font-size:12.5px;font-weight:600;";

  const status = doc.createElement("div");
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  status.style.cssText = "display:none;margin-top:2px;padding:9px 11px;border-radius:8px;font-size:12.5px;font-weight:500;";

  testButton.addEventListener("click", () => {
    void testConnectionWithEnteredKey(doc, input, testButton, status);
  });
  clearButton.addEventListener("click", () => {
    input.value = "";
    showStatus(status, "", "neutral");
  });

  actionRow.append(testButton, clearButton);
  field.append(label, input, help, actionRow, status);

  settingsCard.insertBefore(field, monthlyCapField ?? connectionTestBlock ?? null);
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

  const model = doc.querySelector<HTMLSelectElement>('select, sc-raw-select')?.value;
  button.disabled = true;
  button.style.opacity = "0.62";
  button.style.cursor = "wait";
  showStatus(status, "接続確認中です。APIキーは画面に保存しません。", "neutral");

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
  status.style.display = message ? "block" : "none";
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

function isVisible(element: HTMLElement) {
  return element.offsetParent !== null || element.getClientRects().length > 0;
}

function toErrorMessage(error: unknown) {
  if (error instanceof ApiClientError && error.requestId) {
    return `${error.message}（request_id: ${error.requestId}）`;
  }
  return error instanceof Error ? error.message : "接続テストに失敗しました。";
}
