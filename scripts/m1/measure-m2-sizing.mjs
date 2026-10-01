#!/usr/bin/env node

import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const DEFAULT_REPORT = "doc/plans/2026-10-01-m2-retrofit-sizing.md";

function listFiles(root) {
  const files = [];
  try {
    for (const item of readdirSync(root, { withFileTypes: true })) {
      const path = resolve(root, item.name);
      if (item.isDirectory() && !["node_modules", "dist"].includes(item.name)) files.push(...listFiles(path));
      else if (item.isFile() && /\.(?:ts|tsx|js|mjs)$/.test(item.name) && !/\.(?:test|spec)\./.test(item.name)) files.push(path);
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  return files.sort();
}

function countLines(text) {
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").length;
}

export function measureSourceScope(root) {
  const files = listFiles(root);
  const routeFiles = files.filter((path) => /(?:^|[/\\])routes(?:[/\\]|$)/.test(path));
  const all = files.map((path) => ({ path, text: readFileSync(path, "utf8") }));
  const routeRegistrations = all.reduce((sum, file) => sum + (file.text.match(/\b(?:router|app)\.(?:get|post|put|patch|delete|all|use)\s*\(/g) ?? []).length, 0);
  const dbReferences = all.reduce((sum, file) => sum + (file.text.match(/\b(?:db|tx)\.(?:select|insert|update|delete|query)\b/g) ?? []).length, 0);
  const queryFunctions = all.reduce((sum, file) => sum + (file.text.match(/\bexport\s+(?:async\s+)?function\s+\w+/g) ?? []).length, 0);
  return {
    sourceFiles: files.length,
    nonblankLines: all.reduce((sum, file) => sum + countLines(file.text), 0),
    routeFiles: routeFiles.length,
    routeRegistrations,
    dbReferences,
    exportedFunctions: queryFunctions,
    files: files.map((path) => relative(root, path).split(sep).join("/")),
  };
}

export function renderSizingReport(scope, generatedAt = new Date().toISOString()) {
  const rates = scope.rates;
  const effortScenario = rates ? {
    routeHours: scope.routeRegistrations * rates.routeRegistrationHours,
    databaseHours: scope.dbReferences * rates.databaseReferenceHours,
    fileReviewHours: scope.sourceFiles * rates.sourceFileReviewHours,
  } : null;
  if (effortScenario) effortScenario.totalHours = Object.values(effortScenario).reduce((sum, value) => sum + value, 0);
  return `# M2 scoped-access retrofit sizing input\n\n` +
    `Generated: ${generatedAt}\n\n` +
    `**Gate status: UNPROVEN.** This is a static code inventory, not a completed S1 estimate. ` +
    `It does not include every query hidden behind helpers, runtime route coverage, ` +
    `cross-cutting changes, review, migration, or leak-test effort. Do not compare these counts directly ` +
    `with the §3.5 threshold of 18 engineer-weeks.\n\n` +
    `## Measured source inventory\n\n` +
    `| Metric | Count |\n|---|---:|\n` +
    `| Production source files | ${scope.sourceFiles} |\n` +
    `| Nonblank source lines | ${scope.nonblankLines} |\n` +
    `| Route files (path heuristic) | ${scope.routeFiles} |\n` +
    `| Route registrations (syntax heuristic) | ${scope.routeRegistrations} |\n` +
    `| Database references (syntax heuristic) | ${scope.dbReferences} |\n` +
    `| Exported functions (syntax heuristic) | ${scope.exportedFunctions} |\n\n` +
    `## Optional calibrated scenario\n\n` +
    (effortScenario ? `Supplied rates: route registration ${rates.routeRegistrationHours} h, database reference ${rates.databaseReferenceHours} h, source-file review ${rates.sourceFileReviewHours} h.\n\n` +
      `| Scenario bucket | Hours |\n|---|---:|\n| Route registrations | ${effortScenario.routeHours} |\n| Database references | ${effortScenario.databaseHours} |\n| Source-file review | ${effortScenario.fileReviewHours} |\n| Total | ${effortScenario.totalHours} |\n\n` +
      `At 40 h/week this scenario is ${(effortScenario.totalHours / 40).toFixed(2)} engineer-weeks. This is a scenario from supplied rates; buckets may overlap and the delivery team must validate the model against S1 work before using it for the gate.\n\n` : `No team-calibrated rates supplied; engineer-week result is **UNPROVEN**.\n\n`) +
    `## Gate status\n\n` +
    `- S1 integrated scoped-access prototype and leak tests: **UNPROVEN**.\n` +
    `- M2 engineer-week estimate and §3.5 ≤18-week threshold: **UNPROVEN**; a rate scenario, if present, is not gate evidence by itself.\n` +
    `- Board scope decision for an 18–28-week estimate: **OPEN**.\n\n` +
    `## Interpretation\n\n` +
    `Counts use the tracked source under the selected root and simple text patterns. They are a repeatable ` +
    `starting inventory only. Complete the route/query inventory, apply S1 guard/query prototypes to projects, ` +
    `tasks and attachments, run leak tests, and have the delivery team estimate the remaining M2 work before ` +
    `recording a gate result.\n`;
}

function main(args) {
  const positional = args.filter((arg, index) => arg !== "--rates" && args[index - 1] !== "--rates");
  const ratesIndex = args.indexOf("--rates");
  let rates = null;
  if (ratesIndex >= 0) {
    const parsed = JSON.parse(readFileSync(resolve(args[ratesIndex + 1]), "utf8"));
    const keys = ["routeRegistrationHours", "databaseReferenceHours", "sourceFileReviewHours"];
    for (const key of keys) if (!Number.isFinite(parsed[key]) || parsed[key] < 0) throw new Error(`Invalid rate ${key}`);
    rates = parsed;
  }
  const root = resolve(repoRoot, positional[0] ?? "server/src");
  const reportPath = resolve(repoRoot, positional[1] ?? DEFAULT_REPORT);
  const scope = measureSourceScope(root);
  scope.rates = rates;
  const report = renderSizingReport(scope);
  writeFileSync(reportPath, report);
  console.log(`Wrote ${relative(repoRoot, reportPath)} (${scope.sourceFiles} source files, ${scope.routeRegistrations} route registrations).`);
  console.log("M2 gate result: UNPROVEN; any supplied-rate scenario is an input, not gate evidence.");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main(process.argv.slice(2));
