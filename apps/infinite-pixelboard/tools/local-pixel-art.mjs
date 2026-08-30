#!/usr/bin/env node

import { readFile } from "node:fs/promises";

const presets = {
  p: [
    { row: -2, column: -2, color: "#D3523C" },
    { row: -2, column: -1, color: "#D3523C" },
    { row: -2, column: 0, color: "#D3523C" },
    { row: -1, column: -2, color: "#D3523C" },
    { row: -1, column: 0, color: "#DC9B32" },
    { row: 0, column: -2, color: "#D3523C" },
    { row: 0, column: -1, color: "#D3523C" },
    { row: 0, column: 0, color: "#D3523C" },
    { row: 1, column: -2, color: "#D3523C" },
    { row: 2, column: -2, color: "#D3523C" },
  ],
};

const options = parseArguments(process.argv.slice(2));
const baseUrl = options.url ?? process.env.PIXELBOARD_URL ?? "http://127.0.0.1:5262";
const production = options.production || !isLocalUrl(baseUrl);
const endpoint = production
  ? "/api/v1/moderation/pixel-art"
  : "/api/local/pixel-art";
const pixels = await loadPixels(options);
const headers = { "content-type": "application/json" };
const token = options.token ?? process.env.PIXELBOARD_ID_TOKEN;
if (token) {
  headers.authorization = `Bearer ${token}`;
}

const response = await fetch(new URL(endpoint, baseUrl), {
  method: "POST",
  headers,
  body: JSON.stringify({ pixels }),
});
const body = await response.text();
if (!response.ok) {
  throw new Error(`Pixel-art fill failed (${response.status}): ${body}`);
}

const result = JSON.parse(body);
console.log(`Filled ${result.pixelsWritten} pixels at ${new URL(endpoint, baseUrl)}.`);
if (!production) {
  console.log("Reload the local board to view the artwork.");
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
    if (!["--preset", "--file", "--url", "--token"].includes(key)) {
      throw new Error(`Unknown option: ${argument}`);
    }
    const value = inlineValue ?? argumentsList[++index];
    if (!value) {
      throw new Error(`Missing value for ${key}.`);
    }
    result[key.slice(2)] = value;
  }
  return result;
}

async function loadPixels(options) {
  if (options.file) {
    const parsed = JSON.parse(await readFile(options.file, "utf8"));
    return Array.isArray(parsed) ? parsed : parsed.pixels;
  }
  const preset = options.preset ?? "p";
  if (!presets[preset]) {
    throw new Error(`Unknown preset "${preset}". Available presets: ${Object.keys(presets).join(", ")}.`);
  }
  return presets[preset];
}

function isLocalUrl(url) {
  const parsed = new URL(url);
  return parsed.hostname === "localhost"
    || parsed.hostname === "127.0.0.1"
    || parsed.hostname === "::1";
}
