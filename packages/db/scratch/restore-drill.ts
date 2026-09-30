// Temporary Crewspan restore-rehearsal helper (CREW-9). Not committed, deleted after use.
// Restores a supported logical .sql.gz backup into a FRESH, ISOLATED embedded Postgres
// cluster under a scratch PAPERCLIP_HOME. Never touches the live instance.
import { existsSync, readdirSync, mkdirSync } from "node:fs";
import path from "node:path";
import net from "node:net";
import EmbeddedPostgres from "embedded-postgres";
import { ensurePostgresDatabase, runDatabaseRestore } from "@paperclipai/db";
import postgres from "postgres";

const home = process.env.DRILL_HOME;
const backupFile = process.env.DRILL_BACKUP_FILE;
const requestedPort = Number(process.env.DRILL_PORT ?? "54529");
if (!home) throw new Error("Set DRILL_HOME to the isolated scratch PAPERCLIP_HOME.");
if (!backupFile || !existsSync(backupFile)) throw new Error(`Backup file not found: ${backupFile}`);

function assertPortFree(port: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", (err) => reject(new Error(`port ${port} not free: ${err.message}`)));
    server.listen(port, "127.0.0.1", () => server.close(() => resolve()));
  });
}

const instanceId = "drill";
const instanceRoot = path.join(home, "instances", instanceId);
const databaseDir = path.join(instanceRoot, "db");
if (existsSync(databaseDir) && readdirSync(databaseDir).length !== 0) {
  throw new Error(`Refusing to restore into a non-empty database directory: ${databaseDir}`);
}
mkdirSync(databaseDir, { recursive: true });

const t = { start: Date.now() };
await assertPortFree(requestedPort);

const pg = new EmbeddedPostgres({
  databaseDir,
  user: "paperclip",
  password: "paperclip",
  port: requestedPort,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
  onLog: () => {},
  onError: () => {},
});

let started = false;
try {
  console.log(JSON.stringify({ phase: "initdb-start", ms: Date.now() - t.start }));
  await pg.initialise();
  t.initialised = Date.now();
  console.log(JSON.stringify({ phase: "initdb-done", ms: t.initialised - t.start }));

  await pg.start();
  started = true;
  t.started = Date.now();
  console.log(JSON.stringify({ phase: "postgres-started", ms: t.started - t.start, port: requestedPort }));

  const adminUrl = `postgres://paperclip:paperclip@127.0.0.1:${requestedPort}/postgres`;
  await ensurePostgresDatabase(adminUrl, "paperclip");

  const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${requestedPort}/paperclip`;
  await runDatabaseRestore({ connectionString, backupFile });
  t.restored = Date.now();
  console.log(JSON.stringify({ phase: "restore-complete", ms: t.restored - t.start }));

  const sql = postgres(connectionString, { max: 1 });
  try {
    const tableCount = await sql<{ n: number }[]>`
      SELECT count(*)::int AS n FROM information_schema.tables
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'`;
    const result: Record<string, unknown> = {
      phase: "verify",
      publicTableCount: tableCount[0]?.n ?? null,
    };
    for (const table of ["companies", "agents", "issues", "users", "projects", "activity_log", "drizzle_migrations"]) {
      try {
        const rows = await sql.unsafe<{ n: number }[]>(`SELECT count(*)::int AS n FROM public.${table}`);
        result[`rows_${table}`] = rows[0]?.n ?? null;
      } catch (err) {
        result[`rows_${table}`] = `n/a (${(err as Error).message.split("\n")[0]})`;
      }
    }
    console.log(JSON.stringify(result, null, 2));
  } finally {
    await sql.end();
  }

  t.total = Date.now();
  console.log(JSON.stringify({ phase: "done", totalMs: t.total - t.start, timeline: t }));
} finally {
  if (started) {
    await pg.stop().catch(() => {});
    console.log(JSON.stringify({ phase: "postgres-stopped", ms: Date.now() - t.start }));
  }
}
