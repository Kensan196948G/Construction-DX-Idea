import { execSync } from "node:child_process";
import dns from "node:dns/promises";

const required = [
  "APP_BASE_URL",
  "ALLOWED_ORIGINS",
  "ADMIN_EMAILS",
  "SYSTEM_ADMIN_EMAILS",
  "CF_ACCESS_CERTS_URL",
  "CF_ACCESS_AUD",
  "CF_ACCESS_ISSUER",
  "DATABASE_URL",
  "ANTHROPIC_API_KEY",
  "VITE_API_BASE_URL",
  "SMOKE_API_BASE_URL",
];

const forbiddenPatterns = [/(?:localhost|127\.0\.0\.1|example\.invalid)/i, /\bexample\.com\b/i];
const requiredEnv = {
  SMOKE_API_BASE_URL: process.env.SMOKE_API_BASE_URL,
};
const isDeployRun = process.env.RELEASE_DEPLOY_CHECK === "1";

const checks = [];
const failures = [];

function push(name, ok, detail = "") {
  checks.push({ name, ok, detail });
  if (!ok) failures.push(name);
}

function hasForbidden(value) {
  return forbiddenPatterns.some((pattern) => pattern.test(value));
}

for (const key of required) {
  const value = process.env[key];
  const present = typeof value === "string" && value.trim().length > 0;
  push(`${key} required`, present, present ? "OK" : "not set");
  if (present && hasForbidden(value)) {
    push(`${key} safety`, false, "placeholder/local reference detected");
  }
}

if (process.env.ALLOW_LOCAL_AUTH_BYPASS !== "false") {
  push("ALLOW_LOCAL_AUTH_BYPASS", false, "must be false for production-like run");
}

if (process.env.VITE_USE_MOCK_API !== "false") {
  push("VITE_USE_MOCK_API", false, "must be false for production-like run");
}

if (isDeployRun) {
  push("CLOUDFLARE_PAGES_PROJECT", !!process.env.CLOUDFLARE_PAGES_PROJECT, process.env.CLOUDFLARE_PAGES_PROJECT ? "set" : "not set");
}

async function dnsLookupWithTimeout(host, timeoutMs = 5000) {
  let timer;
  try {
    return await Promise.race([
      dns.lookup(host),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error("DNS lookup timed out")), timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

if (requiredEnv.SMOKE_API_BASE_URL) {
  const target = requiredEnv.SMOKE_API_BASE_URL;
  const isValidUrl = (() => {
    try {
      return ["http:", "https:"].includes(new URL(target).protocol);
    } catch {
      return false;
    }
  })();
  push("SMOKE_API_BASE_URL format", isValidUrl, isValidUrl ? "OK" : "invalid URL (must be http/https)");

  if (isValidUrl) {
    const host = new URL(target).hostname;
    try {
      await dnsLookupWithTimeout(host);
      push(`DNS resolve ${host}`, true, "OK");
    } catch {
      push(`DNS resolve ${host}`, false, "lookup failed or timed out");
    }
  }
}

function parseWranglerWhoami(rawOutput) {
  try {
    return JSON.parse(rawOutput.trim());
  } catch {
    return null;
  }
}

try {
  const output = execSync("wrangler whoami --json", { stdio: "pipe", encoding: "utf8", timeout: 15000 });
  const parsed = parseWranglerWhoami(output);
  const authenticated = parsed?.loggedIn === true;
  push("wrangler auth", authenticated, authenticated ? "authenticated" : "unexpected wrangler output");
} catch (error) {
  const stdout = error.stdout?.toString() || "";
  const parsed = parseWranglerWhoami(stdout);
  const detail = parsed?.loggedIn === false ? "not authenticated" : "command failed";
  push("wrangler auth", false, detail);
}

for (const check of checks) {
  console.log(`- ${check.ok ? "PASS" : "FAIL"} ${check.name}${check.detail ? ` (${check.detail})` : ""}`);
}

if (failures.length > 0) {
  console.error(`\nReadiness monitor FAILED: ${failures.length} issue(s)`);
  process.exit(1);
}

console.log(`\nReadiness monitor PASSED: ${checks.length} checks`);
