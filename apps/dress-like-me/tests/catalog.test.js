import assert from "node:assert/strict";
import test from "node:test";
import { searchCatalog } from "../src/lib/catalog.js";

test("search resolves canonical names and aliases", () => {
  assert.equal(searchCatalog("Shia")[0].slug, "shia-labeouf");
  assert.equal(searchCatalog("a$ap")[0].slug, "asap-rocky");
});

test("search resolves style tags and rejects empty input", () => {
  assert.equal(searchCatalog("workwear")[0].slug, "shia-labeouf");
  assert.deepEqual(searchCatalog("  "), []);
});
