#!/usr/bin/env node

/**
 * Offline §9.14 probe contract checker. It validates evidence shape and
 * fail-closed outcomes; it is not a sandbox, runner, or S3 certification tool.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

export const REQUIRED_PROBES = Object.freeze([
  ["filesystem.home", "blocked"],
  ["filesystem.root", "blocked"],
  ["filesystem.shadow", "blocked"],
  ["filesystem.runner-storage", "blocked"],
  ["filesystem.mirrors", "blocked"],
  ["filesystem.neighbour-scratch", "blocked"],
  ["filesystem.control-plane-volumes", "blocked"],
  ["filesystem.container-sockets", "blocked"],
  ["filesystem.other-run-proc", "blocked"],
  ["network.postgres", "blocked"],
  ["network.host", "blocked"],
  ["network.metadata-ip", "blocked"],
  ["network.rfc1918", "blocked"],
  ["network.ungranted-internet", "blocked"],
  ["network.dns-exfiltration", "blocked"],
  ["credentials.environment-canary", "blocked"],
  ["credentials.filesystem-canary", "blocked"],
  ["credentials.other-run-jwt", "blocked"],
  ["credentials.expired-jwt", "blocked"],
  ["git.hook-injection", "blocked"],
  ["git.malicious-bundle-refs", "blocked"],
  ["git.config-injection", "blocked"],
  ["api.project-b", "blocked"],
  ["api.folder-r", "blocked"],
  ["session.cross-scope-canary", "blocked"],
  ["resources.fork-bomb", "contained"],
  ["resources.memory-fill", "contained"],
  ["resources.disk-fill", "contained"],
]);

export function evaluateProbeReport(report) {
  const problems = [];
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return { status: "BLOCKED", problems: ["report must be an object"] };
  }
  for (const key of ["runId", "adapter", "sandbox", "supervisorVersion", "startedAt", "probes"]) {
    if (!report[key]) problems.push(`missing report.${key}`);
  }
  if (report.adapterApiKeyCapable !== true) problems.push("adapterApiKeyCapable must be true");
  if (report.realDataUsed !== false) problems.push("realDataUsed must be explicitly false");
  if (report.executionKind !== "reference-environment") {
    problems.push('executionKind must be "reference-environment"');
  }
  if (report.probes && typeof report.probes === "object" && !Array.isArray(report.probes)) {
    for (const [id, expected] of REQUIRED_PROBES) {
      const actual = report.probes[id];
      if (!actual || typeof actual !== "object") {
        problems.push(`missing probe ${id}`);
      } else if (actual.outcome !== expected) {
        problems.push(`${id}: expected ${expected}, received ${String(actual.outcome ?? "<missing>")}`);
      } else if (typeof actual.evidence !== "string" || actual.evidence.trim() === "") {
        problems.push(`${id}: missing evidence reference`);
      }
    }
    for (const id of Object.keys(report.probes)) {
      if (!REQUIRED_PROBES.some(([required]) => required === id)) problems.push(`unknown probe ${id}`);
    }
  }
  return { status: problems.length ? "BLOCKED" : "SHAPE_VALIDATION_ONLY", problems };
}

export function makeFixtureReport(fixture = "complete") {
  const probes = Object.fromEntries(REQUIRED_PROBES.map(([id, outcome]) => [id, {
    outcome: fixture === "failed" && id === "network.metadata-ip" ? "allowed" : outcome,
    evidence: `FAKE_FIXTURE:${id}`,
  }]));
  if (fixture === "incomplete") delete probes["filesystem.home"];
  return {
    runId: "FAKE-FIXTURE-ONLY",
    adapter: "FAKE-NO-ADAPTER",
    adapterApiKeyCapable: true,
    sandbox: "FAKE-SANDBOX",
    supervisorVersion: "FAKE-SUPERVISOR",
    executionKind: "reference-environment",
    realDataUsed: false,
    startedAt: "2000-01-01T00:00:00.000Z",
    probes,
    fixtureOnly: true,
  };
}

function isMain() {
  return process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
}

function main(args) {
  const fixtureIndex = args.indexOf("--fixture");
  const reportIndex = args.indexOf("--report");
  if (fixtureIndex >= 0) {
    const kind = args[fixtureIndex + 1] ?? "complete";
    if (!["complete", "incomplete", "failed"].includes(kind)) {
      console.error("Usage: node scripts/m1/probe-suite.mjs --fixture complete|incomplete|failed");
      return 2;
    }
    const result = evaluateProbeReport(makeFixtureReport(kind));
    console.log("SCAFFOLDING ONLY — FAKE PROBE DATA; NOT EVIDENCE THAT S3 PASSED.");
    console.log(`Contract result: ${result.status}`);
    for (const problem of result.problems) console.log(`- ${problem}`);
    return result.status === "BLOCKED" ? 1 : 2;
  }
  if (reportIndex >= 0 && args[reportIndex + 1]) {
    const report = JSON.parse(readFileSync(args[reportIndex + 1], "utf8"));
    const result = evaluateProbeReport(report);
    console.log("CONTRACT CHECK ONLY — THIS TOOL CANNOT CERTIFY S3 OR AUTHORIZE REAL-DATA RUNS.");
    console.log(`Contract result: ${result.status}`);
    for (const problem of result.problems) console.log(`- ${problem}`);
    return result.status === "BLOCKED" ? 1 : 2;
  }
  console.error("UNPROVEN: no reference-environment probe report supplied. No probes were run.");
  console.error("Use --fixture only to exercise scaffolding; fixture output is never S3 evidence.");
  return 2;
}

if (isMain()) process.exitCode = main(process.argv.slice(2));
