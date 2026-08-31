#!/usr/bin/env node
/**
 * ローカル PostgreSQL 向け migration 適用スクリプト。
 *
 * migrations/*.sql をファイル名順に実行する。各 migration は
 * `create table if not exists` / `add column if not exists` / DO ブロック等の
 * 冪等構文で構成されているため、再実行しても安全である。
 *
 * Usage:
 *   node scripts/migrate-local.mjs
 *   （DATABASE_URL は環境変数またはルート .env から読み込む）
 */
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
try {
  // 実行CWDがどこでもリポジトリルートの .env を読む。
  process.loadEnvFile?.(path.join(root, ".env"));
} catch {
  // .env が無い場合は環境変数のみで動作する。
}

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Refusing to run.");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  process.exit(1);
}

const migrationsDir = path.join(root, "migrations");
const files = (await readdir(migrationsDir))
  .filter((file) => file.endsWith(".sql"))
  .sort();

// 冪等SQLの NOTICE（already exists 等）は正常動作なので出力を抑制する。
const sql = postgres(databaseUrl, { max: 1, onnotice: () => {} });
try {
  for (const file of files) {
    const content = await readFile(path.join(migrationsDir, file), "utf8");
    process.stdout.write(`applying ${file} ... `);
    await sql.unsafe(content);
    console.log("ok");
  }
  console.log(`Done. ${files.length} migration(s) applied (idempotent).`);
} finally {
  await sql.end();
}
