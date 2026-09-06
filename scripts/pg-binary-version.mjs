/**
 * サーバーのPostgreSQLメジャーバージョンに一致する pg_dump / pg_restore バイナリを
 * 選択する共通ヘルパー（scripts/backup-postgres.mjs・scripts/restore-drill.mjs で共有）。
 *
 * PATH上のバイナリがサーバーより新しいバージョンだと、生成/期待するダンプ形式が
 * 食い違い「ファイルヘッダのバージョンはサポートされていません」で失敗する
 * （2026-09-06実機確認: サーバー16.14に対しPATH上のpg_dumpが17系だと復元不能な
 * ダンプが生成される）。サーバーへ現在のバージョンを問い合わせ、
 * /usr/lib/postgresql/<major>/bin/<name> が存在すればそれを優先する。
 */
import { stat } from "node:fs/promises";
import postgres from "postgres";

export async function findMatchingPgBinary(databaseUrl, name) {
  const sql = postgres(databaseUrl, { max: 1 });
  try {
    const [{ version_num: versionNum }] = await sql`select current_setting('server_version_num') as version_num`;
    const major = Math.floor(Number(versionNum) / 10000);
    const versionedPath = `/usr/lib/postgresql/${major}/bin/${name}`;
    try {
      await stat(versionedPath);
      return { bin: versionedPath, major };
    } catch {
      return { bin: name, major };
    }
  } finally {
    await sql.end();
  }
}
