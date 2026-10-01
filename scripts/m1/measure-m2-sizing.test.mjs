import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { measureSourceScope, renderSizingReport } from "./measure-m2-sizing.mjs";

test("measures static route and database source inventory", () => {
  const root = mkdtempSync(join(tmpdir(), "crewspan-m2-sizing-"));
  try {
    mkdirSync(join(root, "routes"));
    writeFileSync(join(root, "routes", "projects.ts"), 'router.get("/projects", handler);\napp.post("/projects", handler);\n');
    writeFileSync(join(root, "queries.ts"), "export function listProjects() { return db.select(); }\n");
    const scope = measureSourceScope(root);
    assert.equal(scope.sourceFiles, 2);
    assert.equal(scope.routeFiles, 1);
    assert.equal(scope.routeRegistrations, 2);
    assert.equal(scope.dbReferences, 1);
    assert.equal(scope.exportedFunctions, 1);
    const report = renderSizingReport(scope, "TEST-TIME");
    assert.match(report, /Gate status: UNPROVEN/);
    assert.match(report, /M2 engineer-week estimate.*UNPROVEN/);
    const scenario = renderSizingReport({ ...scope, rates: { routeRegistrationHours: 2, databaseReferenceHours: 4, sourceFileReviewHours: 1 } }, "TEST-TIME");
    assert.match(scenario, /At 40 h\/week this scenario is 0\.25 engineer-weeks/);
    assert.match(scenario, /buckets may overlap/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
