#!/usr/bin/env node
/**
 * ローカルPostgreSQL（dx_idea / dx_idea_mvp）の定期バックアップ（docs/29 §2.22・Issue #8）。
 *
 * DATABASE_URL（環境変数またはルート .env）が指すDBを pg_dump（custom形式・-Fc）で
 * バックアップし、backups/<dbname>/ 配下へタイムスタンプ付きで保存する。
 * 古いバックアップは既定14世代を超えた分を自動削除する（ローテーション）。
 *
 * pg_dump / pg_restore はサーバーのメジャーバージョンと完全一致している必要がある
 * （不一致だと「ファイルヘッダのバージョンはサポートされていません」で失敗する。
 * 2026-09-06実測: サーバー16.14に対しPATH上のpg_dumpが17系だと復元不可能なダンプが
 * 作られてしまう）。サーバーのバージョンを問い合わせ、
 * /usr/lib/postgresql/<major>/bin/pg_dump を優先的に使用する。
 *
 * Usage:
 *   node scripts/backup-postgres.mjs [--keep N]
 *   （DATABASE_URL は環境変数またはルート .env から読み込む）
 */
import { execFile } from "node:child_process";
import { mkdir, readdir, rm, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { findMatchingPgBinary } from "./pg-binary-version.mjs";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Refusing to run.");
  process.exit(1);
}
if (!/^postgres(ql)?:\/\//i.test(databaseUrl)) {
  console.error("DATABASE_URL must be a postgres:// or postgresql:// URL.");
  process.exit(1);
}

const dbName = new URL(databaseUrl).pathname.replace(/^\//, "");
if (!dbName) {
  console.error("DATABASE_URL must include a database name.");
  process.exit(1);
}

const keepArgIdx = process.argv.indexOf("--keep");
const keep = keepArgIdx >= 0 ? Number(process.argv[keepArgIdx + 1]) : 14;
if (!Number.isInteger(keep) || keep < 1) {
  console.error("--keep must be a positive integer.");
  process.exit(1);
}

async function main() {
  const { bin, major } = await findMatchingPgBinary(databaseUrl, "pg_dump");
  console.log(`server major version: ${major} / using pg_dump: ${bin}`);

  const backupDir = path.join(root, "backups", dbName);
  await mkdir(backupDir, { recursive: true });

  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const finalPath = path.join(backupDir, `${dbName}-${stamp}.dump`);
  const tmpPath = `${finalPath}.tmp`;

  const startedAt = Date.now();
  await execFileAsync(bin, ["-Fc", "-f", tmpPath, databaseUrl], { maxBuffer: 1024 * 1024 * 64 });
  const { rename } = await import("node:fs/promises");
  await rename(tmpPath, finalPath);
  const durationMs = Date.now() - startedAt;
  const { size } = await stat(finalPath);

  console.log(`backup written: ${finalPath} (${(size / 1024).toFixed(1)} KiB, ${durationMs}ms)`);

  // ローテーション: 同一DB名の既存バックアップのうち古いものを削除する。
  const files = (await readdir(backupDir))
    .filter((f) => f.startsWith(`${dbName}-`) && f.endsWith(".dump"))
    .sort();
  const excess = files.length - keep;
  if (excess > 0) {
    for (const file of files.slice(0, excess)) {
      await rm(path.join(backupDir, file));
      console.log(`rotated out: ${file}`);
    }
  }
  console.log(`BACKUP RESULT: PASS (${files.length - Math.max(excess, 0)} backup(s) retained)`);
}

main().catch((error) => {
  console.error("BACKUP RESULT: FAIL", error);
  process.exitCode = 1;
});
