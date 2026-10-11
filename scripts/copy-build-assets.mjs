import { chmod, cp, lstat, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const args = process.argv.slice(2);
if (args.length === 0 || args.length % 2 !== 0) {
  throw new Error("Usage: node copy-build-assets.mjs <source> <destination> [...]");
}

// Like `cp -f`: a previous build may have left read-only files (for example a
// vendored image manifest), so make each existing destination file writable
// before it is overwritten.
async function makeWritable(_source, destination) {
  const stat = await lstat(destination).catch(() => null);
  if (stat?.isFile() && (stat.mode & 0o200) === 0) await chmod(destination, stat.mode | 0o200);
  return true;
}

for (let index = 0; index < args.length; index += 2) {
  const source = resolve(args[index]);
  const destination = resolve(args[index + 1]);
  await mkdir(dirname(destination), { recursive: true });
  await cp(source, destination, { recursive: true, force: true, filter: makeWritable });
}
