import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import * as module from "node:module";
import { seedDatabaseFromTemplate } from "./db-template-seed.mjs";

const ERROR_PREFIX = "CREWSPAN_SIDECAR_ERROR ";
const READY_PREFIX = "CREWSPAN_SIDECAR_READY ";
const SECRET_KEYS = [
  "PAPERCLIP_AGENT_JWT_SECRET",
  "PAPERCLIP_TOOL_ACTION_SIGNING_SECRET",
];
const DEFAULT_SHUTDOWN_TIMEOUT_MS = 45_000;
const entryStarted = process.uptime() * 1_000;

function writeLine(stream, line) {
  return new Promise((resolve) => stream.write(`${line}\n`, resolve));
}

function failEnvironment(message) {
  return writeLine(process.stderr, `${ERROR_PREFIX}${JSON.stringify({ code: "invalid_env", message })}`)
    .then(() => process.exit(65));
}

function readConfiguration() {
  const nonce = process.env.CREWSPAN_SIDECAR_NONCE;
  if (typeof nonce !== "string" || nonce.trim() === "") return { error: "CREWSPAN_SIDECAR_NONCE is required" };

  const portText = process.env.PORT;
  if (typeof portText !== "string" || !/^[1-9]\d{0,4}$/.test(portText)) return { error: "PORT must be an integer from 1 to 65535" };
  const port = Number(portText);
  if (!Number.isSafeInteger(port) || port < 1 || port > 65535) return { error: "PORT must be an integer from 1 to 65535" };

  if (process.env.HOST !== "127.0.0.1") return { error: "HOST must be exactly 127.0.0.1" };

  const configPath = process.env.PAPERCLIP_CONFIG;
  if (typeof configPath !== "string" || configPath.length === 0 || !path.isAbsolute(configPath)) {
    return { error: "PAPERCLIP_CONFIG must be an absolute path" };
  }

  const timeoutText = process.env.CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS;
  const shutdownTimeoutMs = timeoutText === undefined ? DEFAULT_SHUTDOWN_TIMEOUT_MS : Number(timeoutText);
  if (!Number.isSafeInteger(shutdownTimeoutMs) || shutdownTimeoutMs < 1) {
    return { error: "CREWSPAN_SIDECAR_SHUTDOWN_TIMEOUT_MS must be a positive integer" };
  }

  const defaultEntry = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../app/server/dist/index.js");
  const serverEntry = process.env.CREWSPAN_SIDECAR_SERVER_ENTRY || defaultEntry;
  return { nonce, port, configPath, shutdownTimeoutMs, serverEntry };
}

function parseEnvValue(raw) {
  const value = raw.trim();
  if (!value) return "";
  if (value[0] === '"' && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1).replace(/\\n/g, "\n").replace(/\\r/g, "\r").replace(/\\(.)/g, "$1");
    }
  }
  if ((value[0] === "'" && value.endsWith("'")) || (value[0] === "`" && value.endsWith("`"))) {
    return value.slice(1, -1);
  }
  return value.replace(/\s+#.*$/, "").trim();
}

function parseEnvFile(contents) {
  const values = {};
  for (const line of contents.split(/\r\n|\n|\r/)) {
    const match = line.match(/^\s*(?:export\s+)?([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (match) values[match[1]] = parseEnvValue(match[2]);
  }
  return values;
}

function updateEnvFile(contents, entries) {
  const lines = contents.match(/[^\r\n]*(?:\r\n|\n|\r|$)/g)?.filter((line) => line !== "") ?? [];
  if (contents === "") lines.push("");
  const newline = contents.match(/\r\n|\n|\r/)?.[0] ?? "\n";
  const missing = new Map(Object.entries(entries));

  for (let index = 0; index < lines.length; index += 1) {
    const fullLine = lines[index];
    const ending = fullLine.match(/(?:\r\n|\n|\r)$/)?.[0] ?? "";
    const body = ending ? fullLine.slice(0, -ending.length) : fullLine;
    const match = body.match(/^(\s*(?:export\s+)?)([A-Za-z_][A-Za-z0-9_]*)(\s*=\s*)(.*)$/);
    if (!match || !(match[2] in entries)) continue;
    const [, prefix, key, separator, rawValue] = match;
    missing.delete(key);
    if (parseEnvValue(rawValue) === entries[key]) continue;
    const comment = rawValue.match(/\s+#.*$/)?.[0] ?? "";
    lines[index] = `${prefix}${key}${separator}${entries[key]}${comment}${ending}`;
  }

  if (missing.size === 0) return lines.join("");
  const inserted = [...missing].map(([key, value]) => `${key}=${value}${newline}`);
  if (lines.length > 0 && lines.at(-1) !== "" && !/(?:\r\n|\n|\r)$/.test(lines.at(-1))) {
    lines[lines.length - 1] += newline;
    inserted[inserted.length - 1] = inserted.at(-1).slice(0, -newline.length);
  }
  const trailingBlank = lines.at(-1) === "" ? lines.length - 1 : lines.length;
  lines.splice(trailingBlank, 0, ...inserted);
  return lines.join("");
}

function chmodEnvFile(envPath) {
  if (process.platform === "win32" || !fs.existsSync(envPath)) return;
  const mode = fs.statSync(envPath).mode & 0o777;
  if ((mode & 0o077) !== 0) fs.chmodSync(envPath, 0o600);
}

function writeEnvFileByRename(envPath, next) {
  const directory = path.dirname(envPath);
  const temporaryPath = path.join(directory, `.${path.basename(envPath)}.${process.pid}.${randomUUID()}.tmp`);
  try {
    fs.writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600, flag: "wx" });
    fs.renameSync(temporaryPath, envPath);
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch { /* already moved or never created */ }
    throw error;
  }
}

function adoptSecretsFromEnvFile(envPath, environmentValues) {
  const values = parseEnvFile(fs.readFileSync(envPath, "utf8"));
  for (const key of SECRET_KEYS) {
    if (environmentValues[key]) continue;
    const value = values[key];
    if (typeof value === "string" && value.trim() !== "") process.env[key] = value.trim();
  }
}

function ensureSecrets(configPath) {
  const envPath = path.join(path.dirname(configPath), ".env");
  const envFileExisted = fs.existsSync(envPath);
  const previous = envFileExisted ? fs.readFileSync(envPath, "utf8") : "";
  const fileValues = parseEnvFile(previous);
  const environmentValues = Object.fromEntries(SECRET_KEYS.map((key) => [
    key,
    typeof process.env[key] === "string" && process.env[key].trim() !== "" ? process.env[key].trim() : "",
  ]));
  const added = {};

  for (const key of SECRET_KEYS) {
    if (environmentValues[key]) continue;
    const savedValue = fileValues[key];
    if (typeof savedValue === "string" && savedValue.trim() !== "") {
      process.env[key] = savedValue.trim();
    } else {
      const generated = randomBytes(32).toString("hex");
      process.env[key] = generated;
      added[key] = generated;
    }
  }

  const directory = path.dirname(envPath);
  fs.mkdirSync(directory, { recursive: true });
  if (Object.keys(added).length > 0) {
    const next = updateEnvFile(previous, added);
    if (!envFileExisted) {
      const temporaryPath = path.join(directory, `.${path.basename(envPath)}.${process.pid}.${randomUUID()}.tmp`);
      try {
        fs.writeFileSync(temporaryPath, next, { encoding: "utf8", mode: 0o600, flag: "wx" });
        try {
          fs.linkSync(temporaryPath, envPath);
        } catch (error) {
          if (error?.code === "EEXIST") {
            adoptSecretsFromEnvFile(envPath, environmentValues);
          } else {
            writeEnvFileByRename(envPath, next);
          }
        }
      } finally {
        try { fs.unlinkSync(temporaryPath); } catch { /* already removed or never created */ }
      }
    } else if (next !== previous) {
      writeEnvFileByRename(envPath, next);
    }
  }
  chmodEnvFile(envPath);
}

function safeMessage(error) {
  let message = error instanceof Error ? error.message : String(error);
  for (const key of SECRET_KEYS) {
    const secret = process.env[key];
    if (secret) message = message.split(secret).join("[REDACTED]");
  }
  return message || "Unknown startup error";
}

function shutdownWithDeadline(started, timeoutMs) {
  let timer;
  const deadline = new Promise((resolve) => {
    timer = setTimeout(() => resolve({ status: "timeout" }), timeoutMs);
  });
  const shutdown = Promise.resolve()
    .then(() => started.shutdown())
    .then(() => ({ status: "stopped" }), (error) => ({ status: "failed", error }));
  return Promise.race([shutdown, deadline]).finally(() => clearTimeout(timer));
}

async function reportShutdownFailure(error) {
  await writeLine(process.stderr, `${ERROR_PREFIX}${JSON.stringify({ code: "shutdown_failed", message: safeMessage(error) })}`);
  process.exit(1);
}

function installShutdownHandlers(timeoutMs) {
  // Keep the sidecar alive even when a test or wrapper server has no other handles.
  const inputKeepAlive = setInterval(() => {}, 60_000);
  let started;
  let shutdownStarted = false;
  let ready = false;
  let pendingExitBeforeReady = false;
  let preReadyShutdown;
  let input = "";

  const shutdown = async () => {
    if (shutdownStarted) return;
    shutdownStarted = true;
    if (!ready) {
      pendingExitBeforeReady = true;
      if (started) void stopBeforeReady();
      return;
    }

    const result = await shutdownWithDeadline(started, timeoutMs);
    if (result.status === "timeout") {
      clearInterval(inputKeepAlive);
      await writeLine(process.stderr, `${ERROR_PREFIX}{"code":"shutdown_timeout"}`);
      process.exit(70);
    }
    clearInterval(inputKeepAlive);
    if (result.status === "failed") await reportShutdownFailure(result.error);
    process.exit(0);
  };
  const stopBeforeReady = () => {
    if (!preReadyShutdown) {
      preReadyShutdown = (async () => {
        const result = await shutdownWithDeadline(started, timeoutMs);
        clearInterval(inputKeepAlive);
        if (result.status === "timeout") {
          await writeLine(process.stderr, `${ERROR_PREFIX}{"code":"shutdown_timeout"}`);
          process.exit(70);
        }
        if (result.status === "failed") await reportShutdownFailure(result.error);
        process.exit(0);
      })();
    }
    return preReadyShutdown;
  };

  const onData = (chunk) => {
    input += chunk.toString("utf8");
    let newlineIndex;
    while ((newlineIndex = input.indexOf("\n")) !== -1) {
      const line = input.slice(0, newlineIndex).replace(/\r$/, "");
      input = input.slice(newlineIndex + 1);
      if (line.trim() === "shutdown") void shutdown();
    }
  };
  const onEnd = () => { void shutdown(); };
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", onData);
  process.stdin.on("end", onEnd);
  process.stdin.ref?.();
  process.stdin.resume();
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);

  return {
    async markReady() {
      if (pendingExitBeforeReady) {
        if (started) await stopBeforeReady();
        return false;
      }
      ready = true;
      return true;
    },
    setStarted(server) {
      started = server;
      if (pendingExitBeforeReady) void stopBeforeReady();
    },
    hasPendingShutdown() { return pendingExitBeforeReady; },
    stopBeforeReady,
  };
}

async function main() {
  const config = readConfiguration();
  if (config.error) await failEnvironment(config.error);

  const handlers = installShutdownHandlers(config.shutdownTimeoutMs);
  try {
    const seedStarted = performance.now();
    await writeLine(process.stdout, `CREWSPAN_SIDECAR_PHASE ${JSON.stringify({ phase: "seed_database", elapsedMs: 0 })}`);
    const templateResult = seedDatabaseFromTemplate({
      home: process.env.PAPERCLIP_HOME,
      instanceId: process.env.PAPERCLIP_INSTANCE_ID || "desktop",
      configPath: config.configPath,
      templateDir: process.env.CREWSPAN_SIDECAR_DB_TEMPLATE || "off",
    });
    const seedMs = Math.round(performance.now() - seedStarted);
    ensureSecrets(config.configPath);
    await writeLine(process.stdout, `CREWSPAN_SIDECAR_PHASE ${JSON.stringify({ phase: "load_server", elapsedMs: seedMs })}`);
    const compileCache = typeof process.env.PAPERCLIP_HOME === "string"
      ? module.enableCompileCache?.(path.join(process.env.PAPERCLIP_HOME, "cache", "node-compile"))
      : undefined;
    if (compileCache) await writeLine(process.stdout, `CREWSPAN_SIDECAR_COMPILE_CACHE ${compileCache.status}`);
    const serverUrl = pathToFileURL(path.resolve(config.serverEntry)).href;
    const importStarted = performance.now();
    const serverModule = await import(serverUrl);
    const importMs = Math.round(performance.now() - importStarted);
    if (typeof serverModule.startServer !== "function") throw new Error("Server module does not export startServer()");
    await writeLine(process.stdout, `CREWSPAN_SIDECAR_PHASE ${JSON.stringify({ phase: "start_server", elapsedMs: importMs })}`);
    const startServerStarted = performance.now();
    const started = await serverModule.startServer();
    const startServerMs = Math.round(performance.now() - startServerStarted);
    handlers.setStarted(started);

    if (handlers.hasPendingShutdown()) {
      await handlers.stopBeforeReady();
      return;
    }

    if (started.listenPort !== config.port) {
      const shutdownResult = await shutdownWithDeadline(started, config.shutdownTimeoutMs);
      if (shutdownResult.status === "failed") await reportShutdownFailure(shutdownResult.error);
      await writeLine(process.stderr, `${ERROR_PREFIX}${JSON.stringify({
        code: "port_mismatch",
        requested: config.port,
        actual: started.listenPort,
      })}`);
      process.exit(64);
    }

    if (!await handlers.markReady()) return;
    const timingLine = `CREWSPAN_SIDECAR_TIMING ${JSON.stringify({
      nodeBootMs: Math.max(0, Math.round(entryStarted)),
      seedMs,
      importMs,
      startServerMs,
      template: templateResult.template,
    })}`;
    const readyLine = `${READY_PREFIX}${JSON.stringify({ nonce: config.nonce, port: started.listenPort, pid: process.pid })}`;
    await writeLine(process.stdout, `${timingLine}\n${readyLine}`);
    if (templateResult.pendingPath) fs.rmSync(templateResult.pendingPath, { force: true });
  } catch (error) {
    await writeLine(process.stderr, `${ERROR_PREFIX}${JSON.stringify({ code: "start_failed", message: safeMessage(error) })}`);
    process.exit(1);
  }
}

await main();
