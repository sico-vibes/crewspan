import { copyFile, mkdir, readdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const sourceDirectory = resolve(packageRoot, "src/migrations");
const outputDirectory = resolve(packageRoot, "dist/migrations");

await rm(outputDirectory, { recursive: true, force: true });
await mkdir(resolve(outputDirectory, "meta"), { recursive: true });

for (const fileName of await readdir(sourceDirectory)) {
  if (fileName.endsWith(".sql")) {
    await copyFile(
      resolve(sourceDirectory, fileName),
      resolve(outputDirectory, fileName),
    );
  }
}

await copyFile(
  resolve(sourceDirectory, "meta/_journal.json"),
  resolve(outputDirectory, "meta/_journal.json"),
);
