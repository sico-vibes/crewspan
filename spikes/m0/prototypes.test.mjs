import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// These deliberately small experiments are feasibility probes only. They do
// not wire policy into the Paperclip API or execute an agent on the reference.
function scopedRows(rows, { companyId, allowedScopes }) {
  if (!companyId || !(allowedScopes instanceof Set)) throw new Error("scope required");
  return rows.filter((row) => row.companyId === companyId && allowedScopes.has(row.scopeId));
}

function sessionKey(agentId, projectId) {
  if (!agentId || !projectId) throw new Error("agent and project scope required");
  return JSON.stringify([agentId, projectId]);
}

function authorizeModelRequest(request, policy, providerKey) {
  if (!request || !policy || !providerKey) throw new Error("gateway configuration required");
  if (!policy.allowedModels.includes(request.model)) throw new Error("model denied");
  if (!Number.isInteger(request.maxTokens) || request.maxTokens < 1 || request.maxTokens > policy.maxTokens) {
    throw new Error("token cap denied");
  }
  // The key is used by the gateway's upstream transport, never serialized into
  // the request handed to the sandbox adapter.
  return {
    upstream: { model: request.model, max_tokens: request.maxTokens, prompt: request.prompt },
    meteredTokens: request.maxTokens,
  };
}

function mayWakeOnAssignment(setting) {
  // Undefined preserves inherited Paperclip behaviour for old companies/clients.
  return setting !== "disabled";
}

function git(cwd, ...args) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tempRepo(fn) {
  const root = mkdtempSync(join(tmpdir(), "crewspan-m0-git-"));
  try {
    const source = join(root, "source");
    mkdirSync(source);
    git(root, "init", "--bare", "mirror.git");
    git(source, "init", "-b", "main");
    git(source, "config", "user.name", "M0 spike");
    git(source, "config", "user.email", "spike@example.invalid");
    writeFileSync(join(source, "canary.txt"), "project-a\n");
    git(source, "add", "canary.txt");
    git(source, "commit", "-m", "seed");
    git(source, "remote", "add", "origin", join(root, "mirror.git"));
    git(source, "push", "origin", "main");
    git(source, "--git-dir", join(root, "mirror.git"), "symbolic-ref", "HEAD", "refs/heads/main");
    fn({ root, source, mirror: join(root, "mirror.git") });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
}

test("S1 prototype: company and scope filters prevent cross-company and cross-scope rows", () => {
  const datasets = ["projects", "tasks", "attachments"].map((kind) => [
    { kind, id: "a-visible", companyId: "company-a", scopeId: "project-a" },
    { kind, id: "a-hidden", companyId: "company-a", scopeId: "project-b" },
    { kind, id: "b-visible", companyId: "company-b", scopeId: "project-a" },
  ]);
  for (const rows of datasets) {
    assert.deepEqual(scopedRows(rows, { companyId: "company-a", allowedScopes: new Set(["project-a"]) }).map((row) => row.id), ["a-visible"]);
  }
  assert.throws(() => scopedRows(datasets[0], { companyId: "company-a" }), /scope required/);
});

test("S3 probe: missing sandbox runtime fails closed", () => {
  const supported = ["bwrap", "podman", "runsc"];
  const installed = supported.filter((binary) => {
    try {
      execFileSync("where.exe", [binary], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  });
  assert.deepEqual(installed, [], `unexpected sandbox runtime available: ${installed.join(", ")}`);
  const launch = (sandbox) => {
    if (!sandbox) throw new Error("contained execution unavailable; refusing fallback");
    return "launched";
  };
  assert.throws(() => launch(installed[0]), /refusing fallback/);
});

test("S4 prototype: clone is private, only permitted ref is fetched, and bundle validates", () => {
  tempRepo(({ root, mirror }) => {
    git(mirror, "config", "core.hooksPath", join(root, "injected-hooks"));
    mkdirSync(join(root, "injected-hooks"));
    writeFileSync(join(root, "injected-hooks", "post-checkout"), "exit 91\n");
    const clone = join(root, "run-a");
    const before = Date.now();
    git(root, "clone", "--no-local", "--single-branch", "--branch", "main", mirror, clone);
    const elapsedMs = Date.now() - before;
    assert.equal(git(clone, "branch", "--all"), "* main\n  remotes/origin/main");
    assert.notEqual(git(clone, "rev-parse", "--git-dir"), git(mirror, "rev-parse", "--git-dir"));
    assert.throws(() => git(clone, "config", "--local", "--get", "core.hooksPath"));
    writeFileSync(join(clone, "result.txt"), "run-a\n");
    git(clone, "add", "result.txt");
    git(clone, "config", "user.name", "M0 spike");
    git(clone, "config", "user.email", "spike@example.invalid");
    git(clone, "commit", "-m", "run result");
    const bundle = join(root, "run-a.bundle");
    git(clone, "bundle", "create", bundle, "main");
    assert.match(git(clone, "bundle", "verify", bundle), /The bundle contains this ref:/);
    assert.ok(elapsedMs >= 0);
    console.log(`S4 synthetic warm clone: ${elapsedMs} ms for one tiny repository/ref`);
    assert.equal(readFileSync(join(mirror, "HEAD"), "utf8").includes("run result"), false);
  });
});

test("S5 prototype: gateway rejects disallowed models and token overages and meters accepted requests", () => {
  const policy = { allowedModels: ["model-a"], maxTokens: 40 };
  const call = authorizeModelRequest({ model: "model-a", maxTokens: 32, prompt: "canary" }, policy, "key-held-outside-sandbox");
  assert.equal(call.meteredTokens, 32);
  assert.deepEqual(call.upstream, { model: "model-a", max_tokens: 32, prompt: "canary" });
  assert.equal(JSON.stringify(call).includes("key-held-outside-sandbox"), false);
  assert.throws(() => authorizeModelRequest({ model: "model-b", maxTokens: 1 }, policy, "key"), /model denied/);
  assert.throws(() => authorizeModelRequest({ model: "model-a", maxTokens: 41 }, policy, "key"), /token cap denied/);
});

test("S6 prototype: session namespace separates the same agent across projects", () => {
  const a = sessionKey("agent-1", "project-a");
  const b = sessionKey("agent-1", "project-b");
  const sessions = new Map([[a, "canary-A"]]);
  assert.notEqual(a, b);
  assert.equal(sessions.get(b), undefined);
  assert.throws(() => sessionKey("agent-1"), /scope required/);
});

test("S7 prototype: new setting can disable assignment wake while omission preserves legacy clients", () => {
  assert.equal(mayWakeOnAssignment(undefined), true);
  assert.equal(mayWakeOnAssignment("enabled"), true);
  assert.equal(mayWakeOnAssignment("disabled"), false);
});
