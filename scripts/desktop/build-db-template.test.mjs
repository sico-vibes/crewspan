import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import net from "node:net";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { ensureNoForbiddenFiles, findPgCtl, treeFacts, unexpectedNonEmptyTables } from "./build-db-template.mjs";
import { seedDatabaseFromTemplate } from "../../desktop/sidecar/db-template-seed.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const builder = fileURLToPath(new URL("./build-db-template.mjs", import.meta.url));

test("template file accounting records relative names and rejects forbidden state", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-template-accounting-"));
  fs.mkdirSync(path.join(root, "global"));
  fs.writeFileSync(path.join(root, "PG_VERSION"), "18\n");
  fs.writeFileSync(path.join(root, "global", "pg_control"), "control");
  assert.deepEqual(treeFacts(root), {
    files: ["global/pg_control", "PG_VERSION"],
    bytes: 10,
  });
  assert.doesNotThrow(() => ensureNoForbiddenFiles(root));
  fs.writeFileSync(path.join(root, ".env"), "must not ship");
  assert.throws(() => ensureNoForbiddenFiles(root), /forbidden/);
});

test("template row audit permits migration defaults and rejects application state", () => {
  assert.deepEqual(unexpectedNonEmptyTables([
    { schema: "public", tableName: "environments", rowCount: 1n },
    { schema: "public", tableName: "instance_settings", rowCount: 1n },
    { schema: "public", tableName: "companies", rowCount: 0n },
  ]), []);
  assert.deepEqual(unexpectedNonEmptyTables([
    { schema: "public", tableName: "environments", rowCount: 1n },
    { schema: "public", tableName: "companies", rowCount: 1n },
  ]), ["public.companies"]);
  assert.deepEqual(unexpectedNonEmptyTables([
    { schema: "public", tableName: "environments", rowCount: 2n },
  ]), ["public.environments"]);
});

test("Linux database template builds from the staged runtime", {
  skip: process.platform !== "linux" ? "database templates are Linux-only in this test" : process.getuid?.() === 0 ? "PostgreSQL refuses to run as root; run this test as a non-root user" : false,
  timeout: 900_000,
}, async (t) => {
  const stageDir = process.env.CREWSPAN_DB_TEMPLATE_STAGE || path.join(repoRoot, "desktop", "stage");
  if (!fs.existsSync(path.join(stageDir, "stage-manifest.json"))) {
    t.skip("no Linux stage is available; prepare a Linux production stage first");
    return;
  }
  const stageManifest = JSON.parse(fs.readFileSync(path.join(stageDir, "stage-manifest.json"), "utf8"));
  if (stageManifest.platform !== `linux-${process.arch}`) {
    t.skip("the available stage does not target this Linux architecture");
    return;
  }
  const result = spawnSync(process.execPath, [builder, "--stage", stageDir], { encoding: "utf8" });
  assert.equal(result.status, 0, `template builder failed: ${result.stderr || result.stdout}`);
  const root = path.join(stageDir, "db-template");
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "template-manifest.json"), "utf8"));
  assert.equal(manifest.platform, `linux-${process.arch}`);
  for (const forbidden of [".env", "config.json", "postmaster.pid", "postmaster.opts"]) {
    assert.equal(manifest.files.some((name) => path.basename(name) === forbidden), false, `${forbidden} must not ship`);
  }
  assert.equal(manifest.files.some((name) => name === "global/pg_control"), true);
  assert.match(result.stdout, /DB template: \d+ bytes; \d+ ms;/);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-template-boot-"));
  const instanceRoot = path.join(home, "instances", "desktop");
  const configPath = path.join(instanceRoot, "config.json");
  fs.mkdirSync(instanceRoot, { recursive: true });
  const dbModulePath = path.join(stageDir, "app", "node_modules", "@paperclipai", "db", "dist", "index.js");
  const entryPath = path.join(stageDir, "sidecar", "entry.mjs");
  const nodePath = path.join(stageDir, "runtime", "node");
  const childEnv = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    TMPDIR: process.env.TMPDIR,
    NODE_ENV: "production",
    PAPERCLIP_HOME: home,
    PAPERCLIP_INSTANCE_ID: "desktop",
    PAPERCLIP_CONFIG: configPath,
    PAPERCLIP_DEPLOYMENT_MODE: "local_trusted",
    PAPERCLIP_BIND: "loopback",
    PAPERCLIP_MIGRATION_AUTO_APPLY: "true",
    PAPERCLIP_DISABLE_CWD_ENV_FILE: "true",
    PAPERCLIP_UI_DEV_MIDDLEWARE: "false",
    PAPERCLIP_OPEN_ON_LISTEN: "false",
    HOST: "127.0.0.1",
    PORT: "3100",
    SERVE_UI: "true",
    CREWSPAN_SIDECAR_NONCE: randomUUID(),
    CREWSPAN_SIDECAR_DB_TEMPLATE: path.join(stageDir, "db-template"),
  };
  const child = spawn(nodePath, [entryPath], { cwd: stageDir, env: childEnv, stdio: ["pipe", "pipe", "pipe"] });
  let stdout = "";
  child.stdout.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { stdout += chunk; });
  child.stderr.on("data", () => {});
  child.stdin.write("keepalive\n");
  let timer;
  let readyTimeout;
  try {
    await Promise.race([
      new Promise((resolve, reject) => {
        const check = () => {
          const line = stdout.split(/\r?\n/).find((entry) => entry.startsWith("CREWSPAN_SIDECAR_READY "));
          if (line) return resolve(JSON.parse(line.slice("CREWSPAN_SIDECAR_READY ".length)));
          if (stdout.includes("CREWSPAN_SIDECAR_ERROR ")) return reject(new Error("sidecar rejected template startup"));
          if (child.exitCode !== null) return reject(new Error("sidecar exited before READY"));
          timer = setTimeout(check, 100);
        };
        check();
      }),
      new Promise((_, reject) => { readyTimeout = setTimeout(() => reject(new Error("sidecar did not become READY")), 900_000); }),
    ]);
    assert.equal(/CREWSPAN_SIDECAR_TIMING \{"nodeBootMs":\d+,"seedMs":\d+,"importMs":\d+,"startServerMs":\d+,"template":"used"\}/.test(stdout), true, "template timing was not emitted");
    let health;
    for (let attempt = 0; attempt < 60; attempt += 1) {
      try {
        const response = await fetch("http://127.0.0.1:3100/api/health");
        if (response.ok) {
          health = await response.json();
          break;
        }
      } catch { /* listener may still be settling after READY */ }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    assert.equal(health?.status, "ok");
    const pidFile = path.join(instanceRoot, "db", "postmaster.pid");
    assert.equal(fs.existsSync(path.join(instanceRoot, ".db-seed-pending")), false, "READY clears the seed-pending marker");
    const pgPort = Number(fs.readFileSync(pidFile, "utf8").split(/\r?\n/)[3]);
    const db = await import(pathToFileURL(dbModulePath));
    const migrationState = await db.inspectMigrations(`postgres://paperclip:paperclip@127.0.0.1:${pgPort}/paperclip`);
    assert.equal(migrationState.status, "upToDate");
    assert.equal(/Migrations\s*│\s*already applied/.test(stdout), true, "migration summary was not already applied");
  } finally {
    clearTimeout(timer);
    clearTimeout(readyTimeout);
    if (child.exitCode === null) {
      child.stdin.write("shutdown\n");
      child.stdin.end();
      await Promise.race([once(child, "close"), new Promise((resolve) => setTimeout(resolve, 10_000))]);
      if (child.exitCode === null) child.kill("SIGKILL");
    }
  }

  const migrationsDir = path.resolve(path.dirname(dbModulePath), "migrations");
  const migrationFiles = fs.readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
  assert.ok(migrationFiles.length > 1, "staged migration set must contain multiple migrations");
  const latestMigration = migrationFiles.at(-1);
  const journalPath = path.join(migrationsDir, "meta", "_journal.json");
  const journalOriginal = fs.readFileSync(journalPath, "utf8");
  const journal = JSON.parse(journalOriginal);
  const journalEntry = journal.entries.pop();
  assert.equal(journalEntry.tag, latestMigration.slice(0, -4));
  const latestTemplate = path.join(stageDir, "db-template");
  const savedTemplate = path.join(stageDir, "db-template.latest-saved");
  const priorTemplate = path.join(stageDir, "db-template.prior");
  const migrationPath = path.join(migrationsDir, latestMigration);
  fs.renameSync(latestTemplate, savedTemplate);
  try {
    fs.writeFileSync(journalPath, `${JSON.stringify(journal, null, 2)}\n`);
    fs.renameSync(migrationPath, `${migrationPath}.disabled`);
    const priorBuild = spawnSync(process.execPath, [builder, "--stage", stageDir], { encoding: "utf8" });
    assert.equal(priorBuild.status, 0, "N-1 database template build failed");
    fs.renameSync(latestTemplate, priorTemplate);
  } finally {
    if (fs.existsSync(`${migrationPath}.disabled`)) fs.renameSync(`${migrationPath}.disabled`, migrationPath);
    fs.writeFileSync(journalPath, journalOriginal);
    if (fs.existsSync(savedTemplate)) fs.renameSync(savedTemplate, latestTemplate);
  }

  const priorManifest = JSON.parse(fs.readFileSync(path.join(priorTemplate, "template-manifest.json"), "utf8"));
  assert.equal(priorManifest.migrations.count, migrationFiles.length - 1);
  const incrementalHome = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-template-incremental-"));
  const incrementalInstance = path.join(incrementalHome, "instances", "desktop");
  fs.mkdirSync(incrementalInstance, { recursive: true });
  const seedResult = seedDatabaseFromTemplate({
    home: incrementalHome,
    instanceId: "desktop",
    configPath: path.join(incrementalInstance, "config.json"),
    templateDir: priorTemplate,
  });
  assert.equal(seedResult.template, "used");
  const pgCtl = findPgCtl(path.join(stageDir, "app", "node_modules"));
  const pgPort = await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const port = server.address().port;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
  const databaseDir = path.join(incrementalInstance, "db");
  const startedPostgres = spawnSync(pgCtl, ["start", "-D", databaseDir, "-w", "-o", `-p ${pgPort} -c listen_addresses=127.0.0.1`], { encoding: "utf8" });
  assert.equal(startedPostgres.status, 0, "N-1 template PostgreSQL start failed");
  try {
    const db = await import(pathToFileURL(dbModulePath));
    const connectionString = `postgres://paperclip:paperclip@127.0.0.1:${pgPort}/paperclip`;
    const before = await db.inspectMigrations(connectionString);
    assert.equal(before.status, "needsMigrations");
    assert.equal(before.pendingMigrations.length, 1);
    await db.applyPendingMigrations(connectionString);
    const after = await db.inspectMigrations(connectionString);
    assert.equal(after.status, "upToDate");
    assert.equal(after.appliedMigrations.length, before.appliedMigrations.length + 1);
  } finally {
    spawnSync(pgCtl, ["stop", "-D", databaseDir, "-m", "fast", "-w"], { encoding: "utf8" });
    fs.rmSync(incrementalHome, { recursive: true, force: true });
    fs.rmSync(priorTemplate, { recursive: true, force: true });
  }
});
