import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function databaseFacts(root, fsApi) {
  const files = [];
  let bytes = 0;
  const visit = (directory) => {
    for (const entry of fsApi.readdirSync(directory, { withFileTypes: true })) {
      const absolute = path.join(directory, entry.name);
      if (entry.isDirectory()) visit(absolute);
      else if (entry.isFile()) {
        files.push(path.relative(root, absolute).split(path.sep).join("/"));
        bytes += fsApi.statSync(absolute).size;
      } else throw new Error("template contains a non-regular file");
    }
  };
  visit(root);
  files.sort();
  return { files, bytes };
}

function hashFile(filePath, fsApi) {
  return createHash("sha256").update(fsApi.readFileSync(filePath)).digest("hex");
}

export function seedDatabaseFromTemplate({
  home,
  instanceId,
  configPath,
  templateDir,
  platform = process.platform,
  arch = process.arch,
  fsApi = fs,
  now = () => Date.now(),
}) {
  if (typeof home !== "string" || home.length === 0) return { template: "disabled" };
  const instancesDir = path.join(home, "instances");
  const instanceRoot = path.join(instancesDir, instanceId);
  const dbPath = path.join(instanceRoot, "db");
  const pendingPath = path.join(instanceRoot, ".db-seed-pending");
  fsApi.mkdirSync(instanceRoot, { recursive: true });

  for (const name of fsApi.readdirSync(instanceRoot)) {
    if (name.startsWith(".db-seed-") && name !== ".db-seed-pending") {
      fsApi.rmSync(path.join(instanceRoot, name), { recursive: true, force: true });
    }
  }

  if (fsApi.existsSync(pendingPath)) {
    if (fsApi.existsSync(dbPath)) {
      let failedPath = path.join(instanceRoot, `.db.failed-seed-${now()}`);
      while (fsApi.existsSync(failedPath)) failedPath = path.join(instanceRoot, `.db.failed-seed-${now()}-${randomUUID()}`);
      fsApi.renameSync(dbPath, failedPath);
    }
    fsApi.rmSync(pendingPath, { force: true });
    return { template: "skipped:seed_pending_recovery" };
  }

  if (!templateDir || templateDir === "off") return { template: "disabled" };
  if (!fsApi.existsSync(templateDir)) return { template: "absent" };
  if (fsApi.existsSync(configPath)) return { template: "skipped:existing_config" };

  if (fsApi.existsSync(dbPath)) {
    const contents = fsApi.readdirSync(dbPath);
    if (contents.length > 0) return { template: "skipped:existing_data" };
    fsApi.rmSync(dbPath, { recursive: true, force: true });
  }

  let temporaryPath;
  let renamedIntoPlace = false;
  try {
    const manifestPath = path.join(templateDir, "template-manifest.json");
    const manifest = JSON.parse(fsApi.readFileSync(manifestPath, "utf8"));
    if (manifest.schemaVersion !== 1 || !Array.isArray(manifest.files) || !Number.isSafeInteger(manifest.bytes)) {
      return { template: "rejected:invalid_manifest" };
    }
    if (manifest.platform !== `${platform}-${arch}`) return { template: "skipped:platform_mismatch" };
    const sourceDb = path.join(templateDir, "db");
    if (fsApi.existsSync(path.join(sourceDb, "postmaster.pid"))) return { template: "skipped:postmaster_pid" };
    for (const file of manifest.files) {
      if (typeof file !== "string" || path.isAbsolute(file) || file.split(/[\\/]/).includes("..") || !fsApi.existsSync(path.join(sourceDb, file))) {
        return { template: "skipped:missing_file" };
      }
    }
    for (const required of ["PG_VERSION", "global/pg_control"]) {
      if (!fsApi.existsSync(path.join(sourceDb, required))) return { template: "skipped:missing_file" };
    }
    if (typeof manifest.pgControlSha256 !== "string" || hashFile(path.join(sourceDb, "global/pg_control"), fsApi) !== manifest.pgControlSha256) {
      return { template: "rejected:pg_control_hash" };
    }

    temporaryPath = path.join(instanceRoot, `.db-seed-${process.pid}-${randomUUID()}`);
    fsApi.cpSync(sourceDb, temporaryPath, { recursive: true, errorOnExist: true, force: false });
    const copied = databaseFacts(temporaryPath, fsApi);
    if (copied.bytes !== manifest.bytes || copied.files.length !== manifest.files.length || copied.files.some((file, index) => file !== [...manifest.files].sort()[index])) {
      throw new Error("template copy verification failed");
    }
    if (hashFile(path.join(temporaryPath, "global/pg_control"), fsApi) !== manifest.pgControlSha256) {
      throw new Error("template control file verification failed");
    }
    if (platform !== "win32") fsApi.chmodSync(temporaryPath, 0o700);
    fsApi.renameSync(temporaryPath, dbPath);
    temporaryPath = undefined;
    renamedIntoPlace = true;
    fsApi.writeFileSync(pendingPath, "seeded\n", { encoding: "utf8", flag: "wx", mode: 0o600 });
    return { template: "used", pendingPath };
  } catch {
    if (temporaryPath) fsApi.rmSync(temporaryPath, { recursive: true, force: true });
    if (renamedIntoPlace && fsApi.existsSync(dbPath)) {
      let failedPath = path.join(instanceRoot, `.db.failed-seed-${now()}`);
      while (fsApi.existsSync(failedPath)) failedPath = path.join(instanceRoot, `.db.failed-seed-${now()}-${randomUUID()}`);
      try { fsApi.renameSync(dbPath, failedPath); } catch { /* preserve data if the move is blocked */ }
    }
    return { template: "rejected:copy_or_rename" };
  }
}

