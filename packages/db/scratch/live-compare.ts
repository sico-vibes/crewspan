// Temporary CREW-9 helper: read-only row counts from the LIVE instance DB, to
// compare against the drill restore. Deleted after use.
import postgres from "postgres";

const liveUrl = "postgres://paperclip:paperclip@127.0.0.1:54329/paperclip";
const tables = [
  "companies", "agents", "issues", "projects", "activity_log",
  "issue_comments", "instance_settings", "issue_attachments",
];

const sql = postgres(liveUrl, { max: 1 });
const out: Record<string, number | string> = {};
try {
  for (const table of tables) {
    try {
      const rows = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM public.${table}`);
      out[table] = rows[0]?.n ?? -1;
    } catch (err) {
      out[table] = `n/a (${(err as Error).message.split("\n")[0]})`;
    }
  }
  const tablesCount = await sql<{ n: number }[]>`
    SELECT count(*)::int AS n FROM information_schema.tables
    WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
  out["__publicTableCount"] = tablesCount[0]?.n ?? -1;
} finally {
  await sql.end();
}
console.log(JSON.stringify(out, null, 2));
