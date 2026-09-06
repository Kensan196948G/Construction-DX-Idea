#!/usr/bin/env node
/**
 * バックアップの復元演習（Restore Drill・docs/29 §2.22・Issue #8）。
 *
 * backups/<dbname>/ 配下の最新（または指定）ダンプを一時DB（<dbname>_restore_drill_*）へ
 * 復元し、元DBとの行数比較・監査ハッシュチェーン検証（worker本番コードと同じロジック）を
 * 行ったうえで一時DBを削除する。DBの作成・削除にはCREATEDB権限が必要なため、アプリ用
 * ロール（DATABASE_URLの接続ユーザー）ではなくpeer認証のローカル管理ユーザーで実行する
 * （このホストではOSユーザー kensan がPostgresのsuperuserを兼ねる。他ホストへ移設する
 * 場合はPG_ADMIN_SUPERUSERで上書きするか、対象ホストで同等の管理ユーザーを用意すること）。
 *
 * Usage:
 *   node scripts/restore-drill.mjs [--file path/to/dump] [--keep-db]
 *   （DATABASE_URL は環境変数またはルート .env から読み込む。復元検証専用で、
 *   元DBへは一切書き込まない）
 */
import { execFile } from "node:child_process";
import { appendFile, mkdir, readdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import postgres from "postgres";
import { workerSecurityTestHooks } from "../worker/index";

const execFileAsync = promisify(execFile);
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
process.loadEnvFile?.(path.join(root, ".env"));

const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error("DATABASE_URL is required. Refusing to run.");
  process.exit(1);
}
const adminUser = process.env.PG_ADMIN_SUPERUSER || process.env.USER || "postgres";

const parsedUrl = new URL(databaseUrl);
const dbName = parsedUrl.pathname.replace(/^\//, "");
if (!dbName) {
  console.error("DATABASE_URL must include a database name.");
  process.exit(1);
}
const appUser = decodeURIComponent(parsedUrl.username);

const fileArgIdx = process.argv.indexOf("--file");
const keepDb = process.argv.includes("--keep-db");

async function latestDumpFile() {
  const backupDir = path.join(root, "backups", dbName);
  const files = (await readdir(backupDir).catch(() => []))
    .filter((f) => f.startsWith(`${dbName}-`) && f.endsWith(".dump"))
    .sort();
  if (files.length === 0) return null;
  return path.join(backupDir, files[files.length - 1]);
}

function psqlAdmin(sqlText, database = "postgres") {
  // peer認証（Unixソケット）で管理接続する。ホスト/ポートを指定しない = ソケット接続。
  return execFileAsync("psql", ["-U", adminUser, "-d", database, "-v", "ON_ERROR_STOP=1", "-c", sqlText]);
}

async function main() {
  const dumpFile = fileArgIdx >= 0 ? path.resolve(process.argv[fileArgIdx + 1]) : await latestDumpFile();
  if (!dumpFile) {
    throw new Error(`No dump file found for database "${dbName}" (run scripts/backup-postgres.mjs first, or pass --file).`);
  }
  await stat(dumpFile);
  console.log(`using dump: ${dumpFile}`);

  const stamp = new Date().toISOString().replace(/[^0-9]/g, "");
  const drillDb = `${dbName}_restore_drill_${stamp}`;

  const sourceSql = postgres(databaseUrl, { max: 1 });
  let failures = 0;
  const check = (name, cond, detail = "") => {
    console.log(`${cond ? "PASS" : "FAIL"} ${name} ${cond ? "" : detail}`);
    if (!cond) failures++;
  };

  try {
    console.log(`creating drill database: ${drillDb}`);
    await psqlAdmin(`create database ${drillDb};`);

    const restoreConn = `dbname=${drillDb} host=/var/run/postgresql user=${adminUser}`;
    await execFileAsync(
      "/usr/lib/postgresql/16/bin/pg_restore",
      ["-d", restoreConn, "--no-owner", "--no-privileges", dumpFile],
      { maxBuffer: 1024 * 1024 * 64 },
    ).catch(async (error) => {
      // pg_restore は警告的なエラー（存在しないロールへのGRANT等）でも非0終了することがあるため、
      // テーブルが実際に復元できているかは後続の行数比較で判定する。ここではログのみ残す。
      console.warn("pg_restore reported warnings/errors (continuing to verification):", error.message.slice(0, 500));
    });

    // アプリロールが検証用クエリを投げられるよう、復元DBへの接続・参照権限を付与する。
    await psqlAdmin(`grant connect on database ${drillDb} to "${appUser}";`);
    await psqlAdmin(
      `grant usage on schema public to "${appUser}"; grant select on all tables in schema public to "${appUser}";`,
      drillDb,
    );

    const drillUrl = new URL(databaseUrl);
    drillUrl.pathname = `/${drillDb}`;
    const drillSql = postgres(drillUrl.toString(), { max: 1 });
    try {
      // 1) 主要テーブルの行数比較（元DB vs 復元DB）。
      const tableRows = await sourceSql`
        select table_name from information_schema.tables
        where table_schema = 'public' and table_type = 'BASE TABLE'
        order by table_name
      `;
      check("at least one table found in source", tableRows.length > 0, `tables=${tableRows.length}`);
      for (const { table_name: table } of tableRows) {
        const [{ count: sourceCount }] = await sourceSql`select count(*)::int as count from ${sourceSql(table)}`;
        const [{ count: restoredCount }] = await drillSql`select count(*)::int as count from ${drillSql(table)}`;
        check(`row count matches: ${table}`, sourceCount === restoredCount, `source=${sourceCount} restored=${restoredCount}`);
      }

      // 2) 監査ハッシュチェーン検証（本番 GET /api/admin/audit/verify と同一ロジック）。
      const chain = await workerSecurityTestHooks.verifyAuditChainFromDb({ DATABASE_URL: drillUrl.toString() });
      check("audit chain valid in restored db", chain.valid, JSON.stringify(chain));
    } finally {
      await drillSql.end();
    }
  } finally {
    await sourceSql.end();
    if (!keepDb) {
      console.log(`dropping drill database: ${drillDb}`);
      // postgres.js の接続クローズがOS側へ伝播しきる前にDROPすると
      // 「他セッションが使用中」で失敗することがあるため、残存バックエンドを
      // 強制終了してから削除する（使い捨ての検証用DBなので安全）。
      await psqlAdmin(
        `select pg_terminate_backend(pid) from pg_stat_activity where datname = '${drillDb}' and pid <> pg_backend_pid();`,
      ).catch(() => {});
      await psqlAdmin(`drop database if exists ${drillDb};`).catch((error) => {
        console.error(`WARNING: failed to drop ${drillDb} — manual cleanup required:`, error.message);
      });
    } else {
      console.log(`--keep-db specified: leaving ${drillDb} in place for manual inspection.`);
    }
  }

  const result = failures === 0 ? "PASS" : "FAIL";
  const logLine = `${new Date().toISOString()}\t${result}\tdb=${dbName}\tdump=${path.basename(dumpFile)}\tfailures=${failures}\n`;
  const logDir = path.join(root, "backups");
  await mkdir(logDir, { recursive: true });
  await appendFile(path.join(logDir, "restore-drill-log.tsv"), logLine);

  console.log(failures === 0 ? "\nRESTORE DRILL RESULT: PASS" : `\nRESTORE DRILL RESULT: FAIL (${failures})`);
  process.exitCode = failures === 0 ? 0 : 1;
}

main().catch((error) => {
  console.error("RESTORE DRILL RESULT: FAIL", error);
  process.exitCode = 1;
});
