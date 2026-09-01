import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(testsDirectory, "../../../..");
const appSource = readFileSync(join(webRoot, "wwwroot/js/pixelboard/app.mjs"), "utf8");
const razor = readFileSync(join(webRoot, "Pages/Shared/_Pixelboard.cshtml"), "utf8");

function extractCollectElementsObjectBody(source) {
  const fnStart = source.indexOf("function collectElements");
  assert.notEqual(fnStart, -1, "collectElements not found in app.mjs");
  const returnStart = source.indexOf("return {", fnStart);
  assert.notEqual(returnStart, -1, "collectElements return object not found");

  let depth = 0;
  let objectStart = -1;
  for (let index = returnStart; index < source.length; index += 1) {
    const character = source[index];
    if (character === "{") {
      if (depth === 0) objectStart = index + 1;
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
      if (depth === 0) return source.slice(objectStart, index);
    }
  }

  throw new Error("Could not parse collectElements return object");
}

function extractCollectElementsKeys(objectBody) {
  return [...objectBody.matchAll(/^\s*(\w+)\s*:/gm)].map((match) => match[1]);
}

function extractCollectElementsSelectors(objectBody) {
  const selectors = {};
  for (const line of objectBody.split("\n")) {
    const single = line.match(/^\s*(\w+)\s*:\s*app\.querySelector\(([^)]+)\)/);
    if (single) {
      selectors[single[1]] = single[2].trim();
      continue;
    }
    const multi = line.match(/^\s*(\w+)\s*:\s*\[\.\.\.app\.querySelectorAll\(([^)]+)\)\]/);
    if (multi) selectors[multi[1]] = multi[2].trim();
  }
  return selectors;
}

function extractElementsReferences(source) {
  const beforeCollectElements = source.indexOf("function collectElements");
  const usageSource = beforeCollectElements === -1 ? source : source.slice(0, beforeCollectElements);
  return [...usageSource.matchAll(/elements\.(\w+)/g)].map((match) => match[1]);
}

function dataAttributeFromSelector(selector) {
  const match = selector.match(/\[data-([\w-]+)\]/);
  return match ? `data-${match[1]}` : null;
}

test("every elements.* reference in app.mjs is bound in collectElements()", () => {
  const objectBody = extractCollectElementsObjectBody(appSource);
  const boundKeys = new Set(extractCollectElementsKeys(objectBody));
  const referencedKeys = [...new Set(extractElementsReferences(appSource))];
  const missing = referencedKeys.filter((key) => !boundKeys.has(key));

  assert.deepEqual(
    missing,
    [],
    missing.length > 0
      ? `collectElements() is missing bindings used in app.mjs: ${missing.join(", ")}`
      : undefined,
  );
});

test("auth-related collectElements selectors exist in _Pixelboard.cshtml", () => {
  const objectBody = extractCollectElementsObjectBody(appSource);
  const selectors = extractCollectElementsSelectors(objectBody);
  const authKeys = ["loginButtons", "signOut", "deleteAccount"];

  for (const key of authKeys) {
    assert.ok(selectors[key], `collectElements() has no selector for ${key}`);
    const attribute = dataAttributeFromSelector(selectors[key]);
    assert.ok(attribute, `${key} selector does not use a data-* attribute: ${selectors[key]}`);
    assert.match(
      razor,
      new RegExp(attribute),
      `_Pixelboard.cshtml is missing ${attribute} for ${key}`,
    );
  }
});
