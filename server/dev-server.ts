/**
 * ローカル実行サーバー（Node 直実行、開発専用）。
 * Workers 用 export default { fetch, scheduled } を Node の http server から呼び出す。
 * 本番は Cloudflare Workers ではなくこのサーバーを systemd で常駐させる想定。
 */
import { createServer } from 'node:http';
import worker from '../worker/index.ts';
import type { Env } from '../worker/index.ts';

try {
  // ローカル実行時は .env を自動読込（無ければ環境変数のみで動作）。
  process.loadEnvFile?.('.env');
} catch {
  // .env が無い場合はスキップ（systemd 等の環境変数注入を想定）。
}

const PORT = Number(process.env.PORT ?? 8791);
const HOST = process.env.HOST ?? "127.0.0.1";
// 受信ボディ上限（APIの入力長制約に対して十分大きい値。chunked送信のメモリ枯渇対策）。
const MAX_BODY_BYTES = Number(process.env.MAX_BODY_BYTES ?? 1024 * 1024);

const env: Env = {
  DATABASE_URL: process.env.DATABASE_URL,
  ANTHROPIC_API_KEY: process.env.ANTHROPIC_API_KEY,
  DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
  SLACK_WEBHOOK_URL: process.env.SLACK_WEBHOOK_URL,
  AI_PROVIDER: process.env.AI_PROVIDER ?? 'claude',
  AI_MODEL: process.env.AI_MODEL ?? 'claude-sonnet-5',
  AI_ENABLED: process.env.AI_ENABLED ?? 'false',
  DAILY_AI_LIMIT: process.env.DAILY_AI_LIMIT ?? '10',
  MAX_INPUT_CHARS: process.env.MAX_INPUT_CHARS ?? '2000',
  APP_BASE_URL: process.env.APP_BASE_URL ?? `http://127.0.0.1:${PORT}`,
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  ADMIN_EMAILS: process.env.ADMIN_EMAILS,
  SYSTEM_ADMIN_EMAILS: process.env.SYSTEM_ADMIN_EMAILS,
  ALLOW_LOCAL_AUTH_BYPASS: process.env.ALLOW_LOCAL_AUTH_BYPASS,
  CF_ACCESS_CERTS_URL: process.env.CF_ACCESS_CERTS_URL,
  CF_ACCESS_AUD: process.env.CF_ACCESS_AUD,
  CF_ACCESS_ISSUER: process.env.CF_ACCESS_ISSUER,
  AI_INPUT_COST_PER_1K_TOKENS: process.env.AI_INPUT_COST_PER_1K_TOKENS,
  AI_OUTPUT_COST_PER_1K_TOKENS: process.env.AI_OUTPUT_COST_PER_1K_TOKENS,
};

const ctx = {
  passThroughOnException() {},
  props: {},
  waitUntil(p: Promise<unknown>) {
    p.catch((e) => console.error('waitUntil_error', e));
  },
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);
  const contentLength = Number(req.headers['content-length'] ?? 0);
  if (contentLength > MAX_BODY_BYTES) {
    res.writeHead(413, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'payload_too_large' }));
    return;
  }
  const chunks: Buffer[] = [];
  let received = 0;
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    for await (const chunk of req) {
      received += chunk.length;
      if (received > MAX_BODY_BYTES) {
        res.writeHead(413, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'payload_too_large' }));
        req.destroy();
        return;
      }
      chunks.push(chunk as Buffer);
    }
  }
  const request = new Request(url, {
    method: req.method,
    // ローカル認証バイパス時のレート制限で使う実IPをサーバー側から設定する。
    // クライアントが送った x-real-ip は常に上書きする。
    headers: {
      ...(req.headers as Record<string, string>),
      'x-real-ip': req.socket.remoteAddress ?? 'unknown',
    },
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
  try {
    const response = await worker.fetch(request, env, ctx);
    res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
    if (response.body) {
      const reader = response.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    }
    res.end();
  } catch (err) {
    console.error('dev_server_error', err);
    if (!res.headersSent) res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'internal_error' }));
  }
});

if (typeof worker.scheduled === 'function') {
  const TEN_MIN = 10 * 60 * 1000;
  const ONE_HOUR = 60 * 60 * 1000;
  setInterval(() => {
    worker.scheduled({ cron: '*/10 * * * *' }, env, ctx);
  }, TEN_MIN);
  setInterval(() => {
    worker.scheduled({ cron: '0 * * * *' }, env, ctx);
  }, ONE_HOUR);
}

server.listen(PORT, HOST, () => {
  console.log(`Construction-DX-Idea MVP API: http://${HOST}:${PORT}/`);
});
