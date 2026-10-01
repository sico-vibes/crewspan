import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { createHash } from "node:crypto";
import { seedDatabaseFromTemplate } from "./db-template-seed.mjs";

const entryPath = fileURLToPath(new URL("./entry.mjs", import.meta.url));
const READY_PREFIX = "CREWSPAN_SIDECAR_READY ";
const ERROR_PREFIX = "CREWSPAN_SIDECAR_ERROR ";
const SECRET_TEST_KEYS = [
  "PAPERCLIP_AGENT_JWT_SECRET",
  "PAPERCLIP_TOOL_ACTION_SIGNING_SECRET",
];

async function fixture(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-sidecar-"));
  const serverEntry = path.join(dir, "fake-server.mjs");
  const stateFile = path.join(dir, "state.json");
  const configPath = options.configPath ?? path.join(dir, "config.json");
  if (!fs.existsSync(configPath)) fs.writeFileSync(configPath, "{}\n");
  if (options.envFileContents !== undefined) {
    const envPath = path.join(path.dirname(configPath), ".env");
    fs.writeFileSync(envPath, options.envFileContents);
    if (options.envFileMode !== undefined) fs.chmodSync(envPath, options.envFileMode);
  }
  const moduleSource = `
import fs from "node:fs";
export async function startServer() {
  if (process.env.FAKE_START_MODE === "throw") throw new Error(process.env.FAKE_ERROR || "fake startup failure");
  if (Number(process.env.FAKE_START_DELAY_MS || 0) > 0) await new Promise((resolve) => setTimeout(resolve, Number(process.env.FAKE_START_DELAY_MS)));
  const statePath = process.env.FAKE_STATE_FILE;
  const state = {
    shutdownCalls: 0,
    secrets: {
      PAPERCLIP_AGENT_JWT_SECRET: process.env.PAPERCLIP_AGENT_JWT_SECRET,
      PAPERCLIP_TOOL_ACTION_SIGNING_SECRET: process.env.PAPERCLIP_TOOL_ACTION_SIGNING_SECRET,
    },
  };
  fs.writeFileSync(statePath, JSON.stringify(state));
  return {
    listenPort: Number(process.env.FAKE_LISTEN_PORT || process.env.PORT),
    async shutdown() {
      const current = JSON.parse(fs.readFileSync(statePath, "utf8"));
      current.shutdownCalls += 1;
      fs.writeFileSync(statePath, JSON.stringify(current));
      if (process.env.FAKE_SHUTDOWN_MODE === "hang") return new Promise(() => {});
      if (process.env.FAKE_SHUTDOWN_MODE === "reject") throw new Error(process.env.FAKE_ERROR || "fake shutdown failure");
    },
  };
}
`;
  fs.writeFileSync(serverEntry, moduleSource);
  const env = { ...process.env };
  delete env.NODE_TEST_CONTEXT;
  delete env.PAPERCLIP_AGENT_JWT_SECRET;
  delete env.PAPERCLIP_TOOL_ACTION_SIGNING_SECRET;
  Object.assign(env, {
    CREWSPAN_SIDECAR_NONCE: "test-nonce-4f3a",
    CREWSPAN_SIDECAR_SERVER_ENTRY: serverEntry,
    PORT: "3100",
    HOST: "127.0.0.1",
    PAPERCLIP_CONFIG: configPath,
    FAKE_STATE_FILE: stateFile,
    ...options.env,
  });
  const child = spawn(process.execPath, [entryPath], { env, stdio: ["pipe", "pipe", "pipe"] });
  const run = {
    dir,
    stateFile,
    configPath,
    envFile: path.join(path.dirname(configPath), ".env"),
    child,
    stdout: "",
    stderr: "",
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", (chunk) => { run.stdout += chunk; });
  child.stderr.on("data", (chunk) => { run.stderr += chunk; });
  run.closed = once(child, "close").then(([code, signal]) => ({ code, signal }));
  // Keep the pipe open while the test waits for readiness; unrelated lines are ignored by the protocol.
  if (options.closeStdinImmediately) child.stdin.end();
  else child.stdin.write("keepalive\n");
  return run;
}

async function waitForOutput(run, kind, timeoutMs = 5_000) {
  const field = kind === "ready" ? "stdout" : "stderr";
  const marker = kind === "ready" ? READY_PREFIX : ERROR_PREFIX;
  const deadline = Date.now() + timeoutMs;
  while (!run[field].includes(marker)) {
    if (run.child.exitCode !== null) throw new Error(`Child exited ${run.child.exitCode}; stdout=${run.stdout} stderr=${run.stderr}`);
    if (Date.now() >= deadline) throw new Error(`Timed out waiting for ${kind}; stdout=${run.stdout} stderr=${run.stderr}`);
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
}

async function finish(run, input) {
  if (input !== undefined) run.child.stdin.write(input);
  if (!run.child.stdin.writableEnded) run.child.stdin.end();
  return (await run.closed).code;
}

async function waitForClose(run, timeoutMs = 5_000) {
  const startedAt = Date.now();
  let timer;
  const result = await Promise.race([
    run.closed,
    new Promise((resolve) => { timer = setTimeout(() => resolve({ timeout: true }), timeoutMs); }),
  ]);
  clearTimeout(timer);
  if (result.timeout) {
    run.child.kill();
    throw new Error(`Child did not exit within ${timeoutMs}ms`);
  }
  return { ...result, elapsedMs: Date.now() - startedAt };
}

function readState(run) {
  return JSON.parse(fs.readFileSync(run.stateFile, "utf8"));
}

function readyPayload(output) {
  const lines = output.trimEnd().split(/\r?\n/).filter((line) => line.startsWith(READY_PREFIX));
  assert.equal(lines.length, 1, "expected exactly one READY line");
  return JSON.parse(lines[0].slice(READY_PREFIX.length));
}

test("success emits one valid READY line with nonce, port, and pid", async () => {
  const seededFakeSecret = "fake-seeded-secret-value-2026";
  const run = await fixture({ env: { PAPERCLIP_AGENT_JWT_SECRET: seededFakeSecret } });
  await waitForOutput(run, "ready");
  const payload = readyPayload(run.stdout);
  assert.deepEqual(payload, { nonce: "test-nonce-4f3a", port: 3100, pid: run.child.pid });
  assert.match(run.stdout, /CREWSPAN_SIDECAR_PHASE \{"phase":"seed_database","elapsedMs":0\}/);
  assert.match(run.stdout, /CREWSPAN_SIDECAR_PHASE \{"phase":"load_server","elapsedMs":\d+\}/);
  assert.match(run.stdout, /CREWSPAN_SIDECAR_PHASE \{"phase":"start_server","elapsedMs":\d+\}/);
  const timingLine = run.stdout.split(/\r?\n/).find((line) => line.startsWith("CREWSPAN_SIDECAR_TIMING "));
  assert.ok(timingLine);
  assert.deepEqual(Object.keys(JSON.parse(timingLine.slice("CREWSPAN_SIDECAR_TIMING ".length))).sort(), [
    "importMs", "nodeBootMs", "seedMs", "startServerMs", "template",
  ]);
  assert.ok(!/[/\\]|SECRET|test-nonce/.test(timingLine));
  assert.ok(!run.stdout.includes(seededFakeSecret));
  assert.equal(await finish(run), 0);
  assert.equal(readState(run).shutdownCalls, 1);
});

function seedFixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-db-seed-"));
  const home = path.join(root, "home");
  const instanceRoot = path.join(home, "instances", "desktop");
  const configPath = path.join(instanceRoot, "config.json");
  const templateDir = path.join(root, "template");
  const sourceDb = path.join(templateDir, "db");
  fs.mkdirSync(path.join(sourceDb, "global"), { recursive: true });
  fs.writeFileSync(path.join(sourceDb, "PG_VERSION"), "18\n");
  fs.writeFileSync(path.join(sourceDb, "global", "pg_control"), "fake-control");
  const files = ["PG_VERSION", "global/pg_control"];
  const bytes = files.reduce((total, file) => total + fs.statSync(path.join(sourceDb, file)).size, 0);
  fs.writeFileSync(path.join(templateDir, "template-manifest.json"), JSON.stringify({
    schemaVersion: 1,
    platform: `${process.platform}-${process.arch}`,
    files,
    bytes,
    pgControlSha256: createHash("sha256").update(fs.readFileSync(path.join(sourceDb, "global", "pg_control"))).digest("hex"),
  }));
  const seed = (overrides = {}) => seedDatabaseFromTemplate({
    home,
    instanceId: "desktop",
    configPath,
    templateDir,
    ...overrides,
  });
  return { root, home, instanceRoot, configPath, templateDir, sourceDb, seed };
}

test("database template seeding uses a verified copy and creates a pending marker", () => {
  const fixture = seedFixture();
  fs.mkdirSync(path.join(fixture.instanceRoot, "db"), { recursive: true });
  fs.mkdirSync(path.join(fixture.instanceRoot, ".db-seed-stale"), { recursive: true });
  const result = fixture.seed();
  assert.deepEqual(result, { template: "used", pendingPath: path.join(fixture.instanceRoot, ".db-seed-pending") });
  assert.equal(fs.existsSync(path.join(fixture.instanceRoot, "db", "PG_VERSION")), true);
  assert.equal(fs.existsSync(result.pendingPath), true);
  assert.equal(fs.existsSync(path.join(fixture.instanceRoot, ".db-seed-stale")), false);
  assert.equal(fs.existsSync(fixture.configPath), false, "seeding never creates config.json");
});

test("database template skip and recovery rules preserve existing data", async (t) => {
  await t.test("disabled and absent templates", () => {
    const fixture = seedFixture();
    assert.deepEqual(fixture.seed({ templateDir: "off" }), { template: "disabled" });
    assert.deepEqual(fixture.seed({ templateDir: path.join(fixture.root, "missing") }), { template: "absent" });
  });
  await t.test("existing database and config", () => {
    const existingDb = seedFixture();
    fs.mkdirSync(path.join(existingDb.instanceRoot, "db"), { recursive: true });
    fs.writeFileSync(path.join(existingDb.instanceRoot, "db", "user-data"), "keep");
    assert.deepEqual(existingDb.seed(), { template: "skipped:existing_data" });
    assert.equal(fs.readFileSync(path.join(existingDb.instanceRoot, "db", "user-data"), "utf8"), "keep");
    const existingConfig = seedFixture();
    fs.mkdirSync(existingConfig.instanceRoot, { recursive: true });
    fs.writeFileSync(existingConfig.configPath, "{}");
    assert.deepEqual(existingConfig.seed(), { template: "skipped:existing_config" });
  });
  await t.test("platform mismatch and corrupt template", () => {
    const mismatch = seedFixture();
    assert.deepEqual(mismatch.seed({ platform: "other", arch: "other" }), { template: "skipped:platform_mismatch" });
    const corrupt = seedFixture();
    fs.rmSync(path.join(corrupt.sourceDb, "PG_VERSION"));
    assert.deepEqual(corrupt.seed(), { template: "skipped:missing_file" });
    const running = seedFixture();
    fs.writeFileSync(path.join(running.sourceDb, "postmaster.pid"), "123\n");
    assert.deepEqual(running.seed(), { template: "skipped:postmaster_pid" });
  });
  await t.test("copy failure and rename race take the slow path", () => {
    const failedCopy = seedFixture();
    const copyFailingFs = { ...fs, cpSync() { throw new Error("copy failure"); } };
    assert.deepEqual(failedCopy.seed({ fsApi: copyFailingFs }), { template: "rejected:copy_or_rename" });
    assert.equal(fs.existsSync(path.join(failedCopy.instanceRoot, "db")), false);
    const raced = seedFixture();
    const racingFs = {
      ...fs,
      renameSync(from, to) {
        if (to === path.join(raced.instanceRoot, "db")) {
          fs.mkdirSync(to, { recursive: true });
          fs.writeFileSync(path.join(to, "racing-data"), "keep");
        }
        return fs.renameSync(from, to);
      },
    };
    assert.deepEqual(raced.seed({ fsApi: racingFs }), { template: "rejected:copy_or_rename" });
    assert.equal(fs.readFileSync(path.join(raced.instanceRoot, "db", "racing-data"), "utf8"), "keep");
  });
  await t.test("seed-pending recovery moves the database aside", () => {
    const pending = seedFixture();
    const dbDir = path.join(pending.instanceRoot, "db");
    fs.mkdirSync(dbDir, { recursive: true });
    fs.writeFileSync(path.join(dbDir, "PG_VERSION"), "bad but preserved");
    fs.writeFileSync(path.join(pending.instanceRoot, ".db-seed-pending"), "seeded\n");
    assert.deepEqual(pending.seed(), { template: "skipped:seed_pending_recovery" });
    assert.equal(fs.existsSync(dbDir), false);
    const moved = fs.readdirSync(pending.instanceRoot).find((name) => name.startsWith(".db.failed-seed-"));
    assert.ok(moved);
    assert.equal(fs.readFileSync(path.join(pending.instanceRoot, moved, "PG_VERSION"), "utf8"), "bad but preserved");
    assert.equal(fs.existsSync(path.join(pending.instanceRoot, ".db-seed-pending")), false);
  });
});

test("port mismatch shuts down, exits 64, and never emits READY", async () => {
  const run = await fixture({ env: { FAKE_LISTEN_PORT: "3101" } });
  const { code } = await waitForClose(run);
  assert.equal(code, 64);
  assert.equal(run.stdout.includes(READY_PREFIX), false);
  assert.deepEqual(JSON.parse(run.stderr.slice(ERROR_PREFIX.length)), {
    code: "port_mismatch", requested: 3100, actual: 3101,
  });
  assert.equal(readState(run).shutdownCalls, 1);
});

test("port mismatch shutdown timeout still exits 64 with port_mismatch", async () => {
  const run = await fixture({ env: {
    FAKE_LISTEN_PORT: "3101",
    FAKE_SHUTDOWN_MODE: "hang",
    CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS: "80",
  } });
  const { code, elapsedMs } = await waitForClose(run);
  assert.equal(code, 64);
  assert.ok(elapsedMs < 1_000);
  assert.equal(run.stdout.includes(READY_PREFIX), false);
  assert.deepEqual(JSON.parse(run.stderr.slice(ERROR_PREFIX.length)), {
    code: "port_mismatch", requested: 3100, actual: 3101,
  });
  assert.equal(readState(run).shutdownCalls, 1);
});

test("pre-ready EOF bounds a hanging shutdown and exits 70 without READY", async () => {
  const run = await fixture({ closeStdinImmediately: true, env: {
    FAKE_START_DELAY_MS: "100",
    FAKE_SHUTDOWN_MODE: "hang",
    CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS: "80",
  } });
  const { code, elapsedMs } = await waitForClose(run);
  assert.equal(code, 70);
  assert.ok(elapsedMs < 1_000);
  assert.equal(run.stdout.includes(READY_PREFIX), false);
  assert.equal(run.stderr, `${ERROR_PREFIX}{"code":"shutdown_timeout"}\n`);
  assert.equal(readState(run).shutdownCalls, 1);
});

test("shutdown stdin command exits 0 and calls shutdown once", async () => {
  const run = await fixture();
  await waitForOutput(run, "ready");
  const code = await finish(run, " shutdown \n");
  assert.equal(code, 0);
  assert.equal(readState(run).shutdownCalls, 1);
});

test("EOF triggers shutdown once", async () => {
  const run = await fixture();
  await waitForOutput(run, "ready");
  assert.equal(await finish(run), 0);
  assert.equal(readState(run).shutdownCalls, 1);
});

test("shutdown followed by EOF still calls shutdown once", async () => {
  const run = await fixture();
  await waitForOutput(run, "ready");
  assert.equal(await finish(run, "shutdown\n"), 0);
  assert.equal(readState(run).shutdownCalls, 1);
});

test("shutdown deadline exits 70", async () => {
  const run = await fixture({ env: {
    FAKE_SHUTDOWN_MODE: "hang",
    CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS: "80",
  } });
  await waitForOutput(run, "ready");
  assert.equal(await finish(run, "shutdown\n"), 70);
  assert.equal(run.stderr, `${ERROR_PREFIX}{"code":"shutdown_timeout"}\n`);
  assert.equal(readState(run).shutdownCalls, 1);
});

for (const [name, envOverrides] of [
  ["missing nonce", { CREWSPAN_SIDECAR_NONCE: "" }],
  ["non-loopback host", { HOST: "0.0.0.0" }],
  ...["03100", "0", "+3100", " 3100", "3100.5", "65536", "3100x"].map((PORT) => [`bad port ${JSON.stringify(PORT)}`, { PORT }]),
]) {
  test(`invalid env (${name}) exits 65 with an ERROR line`, async () => {
    const run = await fixture({ env: envOverrides });
    const { code } = await waitForClose(run);
    assert.equal(code, 65);
    assert.equal(run.stdout, "");
    assert.ok(run.stderr.startsWith(ERROR_PREFIX));
    const error = JSON.parse(run.stderr.slice(ERROR_PREFIX.length));
    assert.equal(error.code, "invalid_env");
    assert.equal(typeof error.message, "string");
  });
}

for (const PORT of ["1", "65535"]) {
  test(`valid PORT ${PORT} starts on the exact requested port`, async () => {
    const run = await fixture({ env: { PORT } });
    await waitForOutput(run, "ready");
    assert.equal(readyPayload(run.stdout).port, Number(PORT));
    assert.equal(await finish(run), 0);
    assert.equal(readState(run).shutdownCalls, 1);
  });
}

test("secrets are persisted privately, preserved, and never printed", async () => {
  const first = await fixture({ envFileContents: "UNRELATED_SETTING=keep-this\n" });
  await waitForOutput(first, "ready");
  const payload = readyPayload(first.stdout);
  assert.equal(await finish(first), 0);
  let envContents = fs.readFileSync(first.envFile, "utf8");
  const original = Object.fromEntries([
    "PAPERCLIP_AGENT_JWT_SECRET",
    "PAPERCLIP_TOOL_ACTION_SIGNING_SECRET",
  ].map((key) => [key, envContents.match(new RegExp(`^${key}=([a-f0-9]{64})$`, "m"))?.[1]]));
  for (const secret of Object.values(original)) assert.match(secret, /^[a-f0-9]{64}$/);
  assert.match(envContents, /^PAPERCLIP_AGENT_JWT_SECRET=[a-f0-9]{64}$/m);
  assert.match(envContents, /^PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=[a-f0-9]{64}$/m);
  assert.match(envContents, /^UNRELATED_SETTING=keep-this$/m);
  if (process.platform !== "win32") assert.equal(fs.statSync(first.envFile).mode & 0o777, 0o600);
  for (const secret of Object.values(original)) {
    assert.ok(!first.stdout.includes(secret));
    assert.ok(!first.stderr.includes(secret));
  }

  const second = await fixture({
    envFileContents: envContents,
    env: { PAPERCLIP_CONFIG: first.configPath },
  });
  await waitForOutput(second, "ready");
  assert.equal(await finish(second), 0);
  envContents = fs.readFileSync(first.envFile, "utf8");
  assert.match(envContents, /^UNRELATED_SETTING=keep-this$/m);
  for (const [key, secret] of Object.entries(original)) assert.match(envContents, new RegExp(`^${key}=${secret}$`, "m"));

  const externallySet = "f".repeat(64);
  const third = await fixture({ env: {
    PAPERCLIP_AGENT_JWT_SECRET: externallySet,
  } });
  await waitForOutput(third, "ready");
  assert.equal(await finish(third), 0);
  const afterExternal = fs.readFileSync(third.envFile, "utf8");
  assert.ok(!afterExternal.includes(`PAPERCLIP_AGENT_JWT_SECRET=${externallySet}`));
  assert.equal(afterExternal.match(/^PAPERCLIP_AGENT_JWT_SECRET=/gm), null);
  assert.match(afterExternal, /^PAPERCLIP_TOOL_ACTION_SIGNING_SECRET=[a-f0-9]{64}$/m);
  for (const secret of [externallySet, ...Object.values(original)]) {
    assert.ok(!third.stdout.includes(secret));
    assert.ok(!third.stderr.includes(secret));
  }
  assert.equal(payload.port, 3100);
});

test("concurrent first starts share both atomically published secrets across 20 races", { timeout: 30_000 }, async () => {
  const startedAt = Date.now();
  for (let iteration = 0; iteration < 20; iteration += 1) {
    const sharedDir = fs.mkdtempSync(path.join(os.tmpdir(), "crewspan-sidecar-race-"));
    const sharedConfig = path.join(sharedDir, "config.json");
    fs.writeFileSync(sharedConfig, "{}\n");
    const [left, right] = await Promise.all([
      fixture({ configPath: sharedConfig }),
      fixture({ configPath: sharedConfig }),
    ]);
    await Promise.all([waitForOutput(left, "ready"), waitForOutput(right, "ready")]);
    assert.equal(await Promise.all([finish(left), finish(right)]).then((codes) => codes.every((code) => code === 0)), true);

    const envFile = fs.readFileSync(path.join(sharedDir, ".env"), "utf8");
    const fileSecrets = Object.fromEntries(SECRET_TEST_KEYS.map((key) => [
      key,
      envFile.match(new RegExp(`^${key}=([a-f0-9]{64})$`, "m"))?.[1],
    ]));
    for (const key of SECRET_TEST_KEYS) {
      assert.match(fileSecrets[key], /^[a-f0-9]{64}$/);
      assert.equal(readState(left).secrets[key], fileSecrets[key]);
      assert.equal(readState(right).secrets[key], fileSecrets[key]);
    }
  }
  assert.ok(Date.now() - startedAt < 30_000, "20 concurrent secret races should finish under 30 seconds");
});

test("existing loose .env permissions are tightened to 0600 on POSIX", async (t) => {
  if (process.platform === "win32") return t.skip("POSIX permission mode is not available on Windows");
  const envContents = `${SECRET_TEST_KEYS[0]}=${"a".repeat(64)}\n${SECRET_TEST_KEYS[1]}=${"b".repeat(64)}\n`;
  const run = await fixture({ envFileContents: envContents, envFileMode: 0o644 });
  await waitForOutput(run, "ready");
  assert.equal(fs.statSync(run.envFile).mode & 0o777, 0o600);
  assert.equal(await finish(run), 0);
});

test("shutdown rejection emits shutdown_failed and exits 1 with its message redacted", async () => {
  const secret = "e".repeat(64);
  const run = await fixture({ env: {
    PAPERCLIP_AGENT_JWT_SECRET: secret,
    FAKE_SHUTDOWN_MODE: "reject",
    FAKE_ERROR: `shutdown exposed ${secret}`,
  } });
  await waitForOutput(run, "ready");
  const code = await finish(run, "shutdown\n");
  assert.equal(code, 1);
  assert.deepEqual(JSON.parse(run.stderr.slice(ERROR_PREFIX.length)), {
    code: "shutdown_failed", message: "shutdown exposed [REDACTED]",
  });
  assert.ok(!run.stderr.includes(secret));
});

test("start failure while stdin is already closed exits 1 with start_failed", async () => {
  const run = await fixture({ closeStdinImmediately: true, env: { FAKE_START_MODE: "throw" } });
  const { code } = await waitForClose(run);
  assert.equal(code, 1);
  assert.equal(run.stdout.includes(READY_PREFIX), false);
  assert.ok(run.stderr.startsWith(ERROR_PREFIX));
  assert.deepEqual(JSON.parse(run.stderr.slice(ERROR_PREFIX.length)), {
    code: "start_failed", message: "fake startup failure",
  });
});
