import assert from "node:assert/strict";
import test from "node:test";
import { compareChangedFiles, renderSyncReport } from "./measure-upstream-sync.mjs";

test("compares file overlap without assigning unsupported time cost", () => {
  const comparison = compareChangedFiles(["a.ts", "shared.ts"], ["b.ts", "shared.ts"]);
  assert.deepEqual(comparison.overlap, ["shared.ts"]);
  assert.deepEqual(comparison.upstreamOnly, ["a.ts"]);
  assert.deepEqual(comparison.forkOnly, ["b.ts"]);
  const report = renderSyncReport({ base: "base", upstreamRef: "upstream", forkRef: "fork", comparison }, "TEST-TIME");
 assert.match(report, /Status: UNPROVEN/);
  assert.match(report, /Changed-file overlap/);
  assert.match(report, /S2 real merge rehearsal and recorded effort: \*\*UNPROVEN\*\*/);
  assert.match(report, /`shared\.ts`/);
});

test("missing refs keep overlap unavailable and gate unproven", () => {
  const report = renderSyncReport({ base: null, upstreamRef: null, forkRef: "HEAD", unavailable: ["upstream"] }, "TEST-TIME");
  assert.match(report, /UNAVAILABLE/);
  assert.match(report, /S2 real merge rehearsal and recorded effort: \*\*UNPROVEN\*\*/);
});
