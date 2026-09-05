#!/usr/bin/env node
/* 情報区分・公開制御（migration 012）のローカル実API E2E。
   一時ポートで dev-server（実DB・バイパス=admin）を起動し、分類APIの動作と
   一覧の可視性を検証する。権限制御（機密設定はadminのみ）は
   tests/classification.test.ts の canChangeClassification 単体テストで担保。 */
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.on("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const { port } = server.address();
    server.close(() => resolve(port));
  });
});
const child = spawn("npx", ["tsx", "server/dev-server.ts"], {
  cwd: root,
  env: { ...process.env, PORT: String(port), ALLOW_LOCAL_AUTH_BYPASS: "true" },
  stdio: ["ignore", "ignore", "ignore"],
});
const base = `http://127.0.0.1:${port}`;
let failures = 0;
const check = (name, cond, detail = "") => {
  console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : detail}`);
  if (!cond) failures++;
};
async function api(method, p, body) {
  const res = await fetch(`${base}${p}`, {
    method,
    headers: { "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { json = { raw: text.slice(0, 200) }; }
  return { status: res.status, json };
}
try {
  let healthy = false;
  for (let i = 0; i < 30; i++) {
    try { const r = await fetch(`${base}/api/health`); if (r.ok) { healthy = true; break; } } catch { /* retry */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  check("health", healthy);

  const structured = {
    title: "分類E2Eテスト案件", currentIssue: "テスト用の困りごと",
    targetBusiness: "テスト業務", targetUsers: "テスト担当",
    currentWorkflow: "現状手順", improvementIdea: "改善案", expectedEffects: "効果",
    requiredData: ["データ"], relatedSystems: ["Excel"], implementationOptions: ["Web"],
    securityNotes: [], openQuestions: [], mvpCandidate: "MVP案", mvpDoneDefinition: "完了条件",
    department: "テスト部", submitterName: "分類テスト",
    submitterEmail: "local.dev@example.com", coordinationNeeded: "",
  };
  const created = await api("POST", "/api/ideas", { structured });
  check("idea created (201)", created.status === 201, `status=${created.status}`);
  const id = created.json?.id;
  check("default internal", created.json?.informationClassification === "internal");

  const toPublic = await api("PATCH", `/api/ideas/${id}/classification`, {
    informationClassification: "public", reason: "公開判断テスト",
  });
  check("change to public", toPublic.status === 200 && toPublic.json?.informationClassification === "public",
    `status=${toPublic.status} ${toPublic.json?.informationClassification}`);

  const toConf = await api("PATCH", `/api/ideas/${id}/classification`, {
    informationClassification: "confidential", reason: "機密化",
  });
  check("change to confidential", toConf.status === 200 && toConf.json?.informationClassification === "confidential",
    `status=${toConf.status} ${toConf.json?.informationClassification}`);

  // 一覧(admin)には confidential 案件が含まれる
  const list = await api("GET", "/api/ideas?limit=200");
  const found = (list.json || []).find(i => i.id === id);
  check("admin list includes confidential", !!found && found.informationClassification === "confidential",
    `found=${!!found}`);

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exitCode = failures === 0 ? 0 : 1;
} finally {
  child.kill();
  // 検証用データは次回 migrate/seed に影響しないようAPI経由では削除しない
  // （テストDBはdx_idea_mvpのため残留しても実害なし。開発用スクリプト）。
}
