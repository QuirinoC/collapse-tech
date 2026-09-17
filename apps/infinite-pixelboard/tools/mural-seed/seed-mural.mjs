#!/usr/bin/env node
/**
 * Seed the shared mural with original CC0-style packs.
 *
 * Local (Development): POST /api/local/pixel-art (no auth)
 * Production: POST /api/v1/moderation/pixel-art with moderator Firebase ID token
 *
 * Usage:
 *   node apps/infinite-pixelboard/tools/mural-seed/seed-mural.mjs
 *   node apps/infinite-pixelboard/tools/mural-seed/seed-mural.mjs --pack geometric-sun
 *   PIXELBOARD_URL=https://pixelboard.collapsetechnologies.com \
 *     PIXELBOARD_ID_TOKEN='...' \
 *     node apps/infinite-pixelboard/tools/mural-seed/seed-mural.mjs --production
 */

import { readdir, readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const packsDir = join(__dirname, "packs");
const CHUNK = 4_000;

const options = parseArguments(process.argv.slice(2));
const baseUrl =
  options.url ?? process.env.PIXELBOARD_URL ?? "http://127.0.0.1:5262";
const production = options.production || !isLocalUrl(baseUrl);
const endpoint = production
  ? "/api/v1/moderation/pixel-art"
  : "/api/local/pixel-art";
const token = options.token ?? process.env.PIXELBOARD_ID_TOKEN;

if (production && !token) {
  console.error(
    "Production seeding requires PIXELBOARD_ID_TOKEN or --token (moderator Firebase ID token).",
  );
  console.error(
    "Packs are ready under tools/mural-seed/packs/. See tools/mural-seed/README.md.",
  );
  process.exit(1);
}

const packs = await loadPacks(options.pack);
let written = 0;

for (const pack of packs) {
  console.log(
    `Seeding ${pack.id} (${pack.pixels.length} px) at row ${pack.origin.row}, col ${pack.origin.column}…`,
  );
  for (let offset = 0; offset < pack.pixels.length; offset += CHUNK) {
    const chunk = pack.pixels.slice(offset, offset + CHUNK);
    const count = await postPixels(chunk);
    written += count;
  }
}

console.log(
  `Done. Wrote ${written} pixels across ${packs.length} pack(s) via ${new URL(endpoint, baseUrl)}.`,
);

async function loadPacks(onlyId) {
  const names = (await readdir(packsDir))
    .filter((name) => name.endsWith(".json"))
    .sort();
  const packs = [];
  for (const name of names) {
    const pack = JSON.parse(await readFile(join(packsDir, name), "utf8"));
    if (onlyId && pack.id !== onlyId) continue;
    if (!Array.isArray(pack.pixels) || pack.pixels.length === 0) {
      throw new Error(`Pack ${name} has no pixels.`);
    }
    packs.push(pack);
  }
  if (onlyId && packs.length === 0) {
    throw new Error(`Unknown pack "${onlyId}".`);
  }
  return packs;
}

async function postPixels(pixels) {
  const headers = { "content-type": "application/json" };
  if (token) headers.authorization = `Bearer ${token}`;

  const response = await fetch(new URL(endpoint, baseUrl), {
    method: "POST",
    headers,
    body: JSON.stringify({ pixels }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(`Pixel-art fill failed (${response.status}): ${body}`);
  }
  return JSON.parse(body).pixelsWritten ?? pixels.length;
}

function parseArguments(argumentsList) {
  const result = {};
  for (let index = 0; index < argumentsList.length; index++) {
    const argument = argumentsList[index];
    if (argument === "--production") {
      result.production = true;
      continue;
    }
    const [key, inlineValue] = argument.split("=", 2);
    if (!["--pack", "--url", "--token"].includes(key)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = inlineValue ?? argumentsList[++index];
    if (!value) throw new Error(`Missing value for ${key}.`);
    result[key.slice(2)] = value;
  }
  return result;
}

function isLocalUrl(url) {
  const parsed = new URL(url);
  return (
    parsed.hostname === "localhost" ||
    parsed.hostname === "127.0.0.1" ||
    parsed.hostname === "::1"
  );
}
