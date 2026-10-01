import assert from "node:assert/strict";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import test from "node:test";

const script = fileURLToPath(new URL("./check-node-version-policy.mjs", import.meta.url));

test("Node policy gate ignores local Cargo caches", () => {
  const source = fs.readFileSync(script, "utf8");
  assert.match(source, /"\.cargo-home"/);
  assert.match(source, /"\.cargo-target"/);
});
