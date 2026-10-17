import { copyFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const check = process.argv.includes("--check");
const shared = "shared/design/";
const pixelboard = "apps/infinite-pixelboard/wwwroot/design/";
const files = [
  "roman.css",
  "mark.svg",
  "fonts/Marcellus-Regular.ttf",
  "fonts/OFL-Marcellus.txt",
];
const copies = files.map((file) => [shared + file, pixelboard + file]);

for (const directory of [
  "apps/collapse-technologies/public",
  "apps/collapse-health/public",
  "apps/dress-like-me/public",
  "apps/asymmetric-challenge/public",
  "apps/infinite-pixelboard/wwwroot",
]) {
  copies.push([
    shared + "fonts/OFL-Marcellus.txt",
    directory + "/licenses/Marcellus.txt",
  ]);
}

let stale = false;
for (const [source, destination] of copies) {
  const sourceBytes = await readFile(resolve(root, source));
  const destinationBytes = await readFile(resolve(root, destination)).catch(
    (error) => {
      if (error.code === "ENOENT") return null;
      throw error;
    },
  );
  if (destinationBytes?.equals(sourceBytes)) continue;
  if (check) {
    console.error(`Design asset needs synchronization: ${destination}`);
    stale = true;
    continue;
  }
  await mkdir(dirname(resolve(root, destination)), { recursive: true });
  await copyFile(resolve(root, source), resolve(root, destination));
  console.log(`Synchronized ${destination}`);
}

if (stale) process.exitCode = 1;
else
  console.log(
    check
      ? "Shared design assets are current."
      : "Shared design assets synchronized.",
  );
