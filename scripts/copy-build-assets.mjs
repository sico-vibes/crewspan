import { cp, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  throw new Error("Usage: node copy-build-assets.mjs <source> <destination> [...]");
}

for (let index = 0; index < args.length; index += 2) {
  const source = resolve(args[index]);
  const destination = resolve(args[index + 1]);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true });
}
