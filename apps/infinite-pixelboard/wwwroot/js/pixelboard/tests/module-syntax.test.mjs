import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const moduleDirectory = join(dirname(fileURLToPath(import.meta.url)), "..");

test("all production modules have valid JavaScript syntax", () => {
  const modules = readdirSync(moduleDirectory)
    .filter((name) => name.endsWith(".mjs"))
    .sort();

  assert.ok(modules.length > 0);
  for (const module of modules) {
    execFileSync(process.execPath, ["--check", join(moduleDirectory, module)]);
  }
});
