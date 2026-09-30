import { copyFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const packageRoot = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(packageRoot, "dist/cliplab");

await mkdir(outputDirectory, { recursive: true });
for (const fileName of ["LICENSE", "PROVENANCE.md"]) {
  await copyFile(
    resolve(packageRoot, "src/cliplab", fileName),
    resolve(outputDirectory, fileName),
  );
}
