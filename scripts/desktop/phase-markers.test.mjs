import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

test("startup phase markers remain present in the server startup logs", () => {
  const markersPath = path.join(repoRoot, "desktop/sidecar-core/src/phase-markers.json");
  const markers = JSON.parse(fs.readFileSync(markersPath, "utf8"));
  const server = fs.readFileSync(path.join(repoRoot, "server/src/index.ts"), "utf8");
  for (const marker of markers) {
    assert.ok(server.includes(marker), `server startup marker drifted: ${marker}`);
  }
});
