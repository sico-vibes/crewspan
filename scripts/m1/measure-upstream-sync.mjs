#!/usr/bin/env node

import { writeFileSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REPORT = "doc/plans/2026-10-01-upstream-sync-cost.md";

function git(args, cwd = repoRoot) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function hasCommit(ref, cwd = repoRoot) {
  try { git(["rev-parse", "--verify", `${ref}^{commit}`], cwd); return true; } catch { return false; }
}

export function compareChangedFiles(upstreamFiles, forkFiles) {
  const upstream = new Set(upstreamFiles);
  const fork = new Set(forkFiles);
  const overlap = [...upstream].filter((file) => fork.has(file)).sort();
  return {
    upstreamChanged: [...upstream].sort(),
    forkChanged: [...fork].sort(),
    overlap,
    upstreamOnly: [...upstream].filter((file) => !fork.has(file)).sort(),
    forkOnly: [...fork].filter((file) => !upstream.has(file)).sort(),
  };
}

export function renderSyncReport({ base, upstreamRef, forkRef, comparison, unavailable = [] }, generatedAt = new Date().toISOString()) {
  const known = Boolean(base && upstreamRef && forkRef && comparison);
  const overlap = known ? comparison.overlap : [];
  const shownOverlap = overlap.slice(0, 50);
  const omittedOverlap = Math.max(0, overlap.length - shownOverlap.length);
  return `# Upstream sync cost measurement input\n\n` +
    `Generated: ${generatedAt}\n\n` +
    `**Status: UNPROVEN.** File overlap is a change-risk indicator; it does not measure hands-on conflict ` +
    `resolution, builds, tests, reviews, or elapsed engineer-days. S2's <2-engineer-day criterion requires an ` +
    `actual rehearsal on the S1 skeleton.\n\n` +
    `The file counts compare each ref's tree with the selected base. Shared paths are not confirmed merge conflicts.\n\n` +
    `## Local references\n\n` +
    `- Base: ${base ?? "UNAVAILABLE"}\n- Upstream ref: ${upstreamRef ?? "UNAVAILABLE"}\n- Fork ref: ${forkRef ?? "UNAVAILABLE"}\n` +
    (unavailable.length ? `- Missing inputs: ${unavailable.join(", ")}\n` : "") +
    `\n## Changed-file overlap${known ? "" : " (not measured)"}\n\n` +
    `| Metric | Count |\n|---|---:|\n` +
    `| Upstream changed files | ${known ? comparison.upstreamChanged.length : "—"} |\n` +
    `| Fork changed files | ${known ? comparison.forkChanged.length : "—"} |\n` +
    `| Paths changed on both sides | ${known ? overlap.length : "—"} |\n` +
    `| Upstream-only paths | ${known ? comparison.upstreamOnly.length : "—"} |\n` +
    `| Fork-only paths | ${known ? comparison.forkOnly.length : "—"} |\n\n` +
    `## Gate status\n\n` +
    `- S2 real merge rehearsal and recorded effort: **UNPROVEN**.\n` +
    `- §3.5 upstream sync <2 engineer-days: **UNPROVEN**.\n` +
    `- No remote fetch, branch mutation, merge, or real-data run was performed by this script.\n\n` +
    `## Overlapping paths\n\n` +
    (known && overlap.length ? shownOverlap.map((path) => `- \`${path}\``).join("\n") + (omittedOverlap ? `\n- … ${omittedOverlap} additional shared paths omitted` : "") : "No overlap list available.") + "\n\n" +
    `## Required follow-up\n\n` +
    `Select the upstream release and S1 skeleton, rehearse the merge in an isolated disposable worktree, ` +
    `record conflict files and hands-on hours, run the relevant build/tests, and update this report with the ` +
    `operator-reviewed result. Do not infer engineer-days from file counts.\n`;
}

function main(args) {
  const base = args[0] ?? "v2026.916.1";
  const upstreamRef = args[1] ?? "refs/remotes/upstream/master";
  const forkRef = args[2] ?? "HEAD";
  const reportPath = resolve(repoRoot, args[3] ?? DEFAULT_REPORT);
  const unavailable = [base, upstreamRef, forkRef].filter((ref) => !hasCommit(ref));
 let comparison = null;
 if (unavailable.length === 0) {
   try {
      const upstreamFiles = git(["diff", "--name-only", base, upstreamRef]).split("\n").filter(Boolean);
      const forkFiles = git(["diff", "--name-only", base, forkRef]).split("\n").filter(Boolean);
      comparison = compareChangedFiles(upstreamFiles, forkFiles);
    } catch (error) {
      unavailable.push(`comparison failed (${error.message.split("\n")[0]})`);
    }
  }
  const report = renderSyncReport({ base, upstreamRef, forkRef, comparison, unavailable });
  writeFileSync(reportPath, report);
  console.log(`Wrote ${relative(repoRoot, reportPath)}.`);
  console.log(`Changed-file overlap: ${comparison ? comparison.overlap.length : "UNAVAILABLE"}; measured rehearsal cost: UNPROVEN.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
