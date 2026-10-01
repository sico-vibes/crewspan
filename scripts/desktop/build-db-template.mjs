import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import net from "node:net";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";

const scriptPath = fileURLToPath(import.meta.url);
const startedAt = performance.now();
const SCHEMA_VERSION = 1;
// These contain only instance defaults inserted by migration 0105 on a fresh DB.
// All company, user, plugin, and other application state must remain absent.
const ROW_COUNT_ALLOWLIST = new Map([
  ["public.environments", 1n],
  ["public.instance_settings", 1n],
]);
const args = process.argv.slice(2);
const stageIndex = args.indexOf("--stage");
const stageDir = stageIndex >= 0 ? path.resolve(args[stageIndex + 1] ?? "") : "";

function fail(message) {
  console.error(`DB template build failed: ${message}`);
  process.exitCode = 1;
}

function sha256File(filePath) {
  return createHash("sha256").update(fs.readFileSync(filePath)).digest("hex");
}

function walkFiles(root) {
  const files = [];
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) files.push(...walkFiles(absolute));
    else if (entry.isFile()) files.push(absolute);
    else throw new Error("template contains a non-regular filesystem entry");
  }
  return files;
}

function treeFacts(root) {
  const files = walkFiles(root).sort((a, b) => a.localeCompare(b));
  return {
    files: files.map((file) => path.relative(root, file).split(path.sep).join("/")),
    bytes: files.reduce((sum, file) => sum + fs.statSync(file).size, 0),
  };
}

function findPgCtl(modulesDir) {
  const packageName = process.platform === "win32" ? "windows-x64" : `${process.platform}-${process.arch}`;
  const candidates = [
    path.join(modulesDir, "@embedded-postgres", packageName, "bin", process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"),
    path.join(modulesDir, "@embedded-postgres", packageName, process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"),
  ];
  for (const candidate of candidates) if (fs.existsSync(candidate)) return candidate;
  const platformDir = path.join(modulesDir, "@embedded-postgres", packageName);
  if (fs.existsSync(platformDir)) {
    const found = walkFiles(platformDir).find((file) => path.basename(file).toLowerCase() === (process.platform === "win32" ? "pg_ctl.exe" : "pg_ctl"));
    if (found) return found;
  }
  throw new Error("embedded PostgreSQL pg_ctl binary is missing from the staged runtime");
}

function stagedPackage(appDir, packageName) {
  const packageDir = path.join(appDir, "node_modules", ...packageName.split("/"));
  const packageJsonPath = path.join(packageDir, "package.json");
  const manifest = JSON.parse(fs.readFileSync(packageJsonPath, "utf8"));
  const rootExport = manifest.exports?.["."] ?? manifest.exports;
  const entry = typeof rootExport === "string"
    ? rootExport
    : rootExport?.import ?? rootExport?.default ?? rootExport?.require ?? manifest.module ?? manifest.main;
  if (typeof entry !== "string") throw new Error(`staged package entry is missing: ${packageName}`);
  const entryPath = path.resolve(packageDir, entry);
  if (!entryPath.startsWith(`${packageDir}${path.sep}`) || !fs.existsSync(entryPath)) {
    throw new Error(`staged package entry is unavailable: ${packageName}`);
  }
  return { packageDir, packageJsonPath, manifest, entryPath };
}

async function freePort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const port = server.address().port;
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

function run(file, argv, options = {}) {
  const result = spawnSync(file, argv, { encoding: "utf8", windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(file)} failed with exit code ${result.status ?? "unknown"}`);
  return result.stdout;
}

function ensureNoForbiddenFiles(root) {
  const forbidden = walkFiles(root).filter((file) => {
    const name = path.basename(file).toLowerCase();
    return name === ".env" || name === "config.json" || name.endsWith(".key") || name === "postmaster.pid" || name === "postmaster.opts";
  });
  if (forbidden.length) throw new Error("template contains a forbidden instance or PostgreSQL runtime file");
}

function unexpectedNonEmptyTables(tables) {
  return tables
    .filter(({ schema, tableName, rowCount }) => rowCount > (ROW_COUNT_ALLOWLIST.get(`${schema}.${tableName}`) ?? 0n))
    .map(({ schema, tableName }) => `${schema}.${tableName}`)
    .sort();
}

async function runBuild() {
  if (!stageDir || !fs.existsSync(stageDir)) throw new Error("--stage must name an existing staged runtime directory");
  const manifestPath = path.join(stageDir, "stage-manifest.json");
  const stageManifest = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
  if (stageManifest.loader === "tsx" && process.env.CREWSPAN_DB_TEMPLATE_TSX_REEXEC !== "1") {
    const loader = path.join(stageDir, "app", "node_modules", "tsx", "dist", "loader.mjs");
    if (!fs.existsSync(loader)) throw new Error("staged tsx loader is missing");
    const child = spawnSync(process.execPath, ["--import", loader, scriptPath, ...args], {
      stdio: "inherit",
      windowsHide: true,
      env: { ...process.env, CREWSPAN_DB_TEMPLATE_TSX_REEXEC: "1" },
    });
    if (child.error) throw child.error;
    if (child.status !== 0) process.exitCode = child.status ?? 1;
    return;
  }
  if (process.env.CREWSPAN_DB_TEMPLATE_TSX_REEXEC === "1" && stageManifest.loader !== "tsx") {
    throw new Error("tsx re-execution stage manifest changed unexpectedly");
  }

  const appDir = path.join(stageDir, "app");
  const modulesDir = path.join(appDir, "node_modules");
  const embeddedPackage = stagedPackage(appDir, "embedded-postgres");
  const dbPackage = stagedPackage(appDir, "@paperclipai/db");
  const postgresPackage = stagedPackage(appDir, "postgres");
  const embeddedPath = embeddedPackage.entryPath;
  const dbPath = dbPackage.entryPath;
  const postgresPath = postgresPackage.entryPath;
  const optionPath = path.join(appDir, "server", "dist", "embedded-postgres-options.js");
  if (!fs.existsSync(optionPath)) throw new Error("staged embedded PostgreSQL options module is missing");
  const [{ default: EmbeddedPostgres }, db, { default: postgres }, options] = await Promise.all([
    import(pathToFileURL(embeddedPath)),
    import(pathToFileURL(dbPath)),
    import(pathToFileURL(postgresPath)),
    import(pathToFileURL(optionPath)),
  ]);
  await db.prepareEmbeddedPostgresNativeRuntime?.();
  const partialRoot = path.join(stageDir, `db-template.partial-${randomUUID()}`);
  const dataDir = path.join(partialRoot, "db");
  const destination = path.join(stageDir, "db-template");
  const pgCtl = findPgCtl(modulesDir);
  const port = await freePort();
  fs.mkdirSync(dataDir, { recursive: true });
  let postmasterStarted = false;
  let pg;
  try {
    const instance = new EmbeddedPostgres({
      databaseDir: dataDir,
      user: options.EMBEDDED_POSTGRES_USER,
      password: options.EMBEDDED_POSTGRES_PASSWORD,
      port,
      persistent: true,
      initdbFlags: [...options.EMBEDDED_POSTGRES_INITDB_FLAGS],
    });
    await instance.initialise();
    run(pgCtl, ["start", "-D", dataDir, "-w", "-o", `-p ${port} -c listen_addresses=127.0.0.1 -c min_wal_size=32MB`]);
    postmasterStarted = true;

    const adminUrl = `postgres://${options.EMBEDDED_POSTGRES_USER}:${options.EMBEDDED_POSTGRES_PASSWORD}@127.0.0.1:${port}/postgres`;
    await db.ensurePostgresDatabase(adminUrl, "paperclip");
    const connectionString = `postgres://${options.EMBEDDED_POSTGRES_USER}:${options.EMBEDDED_POSTGRES_PASSWORD}@127.0.0.1:${port}/paperclip`;
    await db.applyPendingMigrations(connectionString);
    const migrationState = await db.inspectMigrations(connectionString);
    if (migrationState.status !== "upToDate") throw new Error("template migrations did not reach upToDate");

    pg = postgres(connectionString, { max: 1, onnotice: () => {} });
    const tables = await pg`
      select table_schema, table_name
      from information_schema.tables
      where table_type = 'BASE TABLE' and table_schema not in ('pg_catalog', 'information_schema')
      order by table_schema, table_name
    `;
    const auditedTables = [];
    for (const table of tables) {
      // Drizzle's migration journal is migration metadata, not seeded application state.
      if (table.table_name === "__drizzle_migrations") continue;
      const count = await pg.unsafe(`select count(*)::bigint as count from ${JSON.stringify(table.table_schema)}.${JSON.stringify(table.table_name)}`);
      const rowCount = BigInt(count[0].count);
      auditedTables.push({ schema: table.table_schema, tableName: table.table_name, rowCount });
    }
    const unexpected = unexpectedNonEmptyTables(auditedTables);
    if (unexpected.length) throw new Error(`row-count audit found non-empty application tables: ${unexpected.sort().join(", ")}`);
    await pg`CHECKPOINT`;
    await pg.end({ timeout: 5 });
    pg = undefined;
    run(pgCtl, ["stop", "-D", dataDir, "-m", "fast", "-w"]);
    postmasterStarted = false;
    const pidFile = path.join(dataDir, "postmaster.pid");
    if (fs.existsSync(pidFile)) throw new Error("postmaster.pid remained after clean stop");
    fs.rmSync(path.join(dataDir, "postmaster.opts"), { force: true });
    ensureNoForbiddenFiles(dataDir);

    const facts = treeFacts(dataDir);
    const migrations = migrationState.appliedMigrations;
    const migrationsDir = path.resolve(path.dirname(dbPath), "migrations");
    const migrationDigest = createHash("sha256");
    for (const migration of migrations) {
      migrationDigest.update(migration).update("\n");
      migrationDigest.update(fs.readFileSync(path.join(migrationsDir, migration)));
    }
    const pgControl = path.join(dataDir, "global", "pg_control");
    const templateManifest = {
      schemaVersion: SCHEMA_VERSION,
      platform: `${process.platform}-${process.arch}`,
      pgVersion: fs.readFileSync(path.join(dataDir, "PG_VERSION"), "utf8").trim(),
      embeddedPostgresVersion: embeddedPackage.manifest.version,
      migrations: {
        count: migrations.length,
        last: migrations.at(-1) ?? null,
        digest: migrationDigest.digest("hex"),
      },
      files: facts.files,
      bytes: facts.bytes,
      pgControlSha256: sha256File(pgControl),
    };
    fs.writeFileSync(path.join(partialRoot, "template-manifest.json"), `${JSON.stringify(templateManifest, null, 2)}\n`);
    ensureNoForbiddenFiles(partialRoot);
    if (fs.existsSync(destination)) fs.rmSync(destination, { recursive: true, force: true });
    fs.renameSync(partialRoot, destination);
    console.log(`DB template: ${templateManifest.bytes} bytes; ${Math.round(performance.now() - startedAt)} ms; ${templateManifest.files.length} files`);
  } catch (error) {
    if (pg) await pg.end({ timeout: 1 }).catch(() => {});
    if (postmasterStarted) {
      try { run(pgCtl, ["stop", "-D", dataDir, "-m", "fast", "-w"]); } catch { /* preserve failed partial for diagnosis */ }
    }
    fs.rmSync(partialRoot, { recursive: true, force: true });
    throw error;
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  if (!args.includes("--stage") || !stageDir) {
    fail("usage: node scripts/desktop/build-db-template.mjs --stage <dir>");
  } else {
    runBuild().catch((error) => fail(error instanceof Error ? error.message : "unknown failure"));
  }
}

export { ensureNoForbiddenFiles, findPgCtl, stagedPackage, treeFacts, unexpectedNonEmptyTables };
