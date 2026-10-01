import assert from "node:assert/strict";
import test from "node:test";
import { evaluateProbeReport, makeFixtureReport, REQUIRED_PROBES } from "./probe-suite.mjs";

test("§9.14 fake complete fixture has every required probe but remains shape-only", () => {
  const result = evaluateProbeReport(makeFixtureReport("complete"));
  assert.equal(REQUIRED_PROBES.length, 28);
  assert.equal(result.status, "SHAPE_VALIDATION_ONLY");
  assert.deepEqual(result.problems, []);
});

test("missing probe blocks the suite", () => {
  const result = evaluateProbeReport(makeFixtureReport("incomplete"));
  assert.equal(result.status, "BLOCKED");
  assert.match(result.problems.join("\n"), /missing probe filesystem\.home/);
});

test("permitted network escape blocks the suite", () => {
  const result = evaluateProbeReport(makeFixtureReport("failed"));
  assert.equal(result.status, "BLOCKED");
  assert.match(result.problems.join("\n"), /network\.metadata-ip: expected blocked, received allowed/);
});

test("report cannot omit the explicit no-real-data assertion", () => {
  const report = makeFixtureReport();
  delete report.realDataUsed;
  assert.equal(evaluateProbeReport(report).status, "BLOCKED");
});

test("unknown probes fail closed", () => {
  const report = makeFixtureReport();
  report.probes.extra = { outcome: "blocked", evidence: "fake" };
  assert.equal(evaluateProbeReport(report).status, "BLOCKED");
});
