import assert from "node:assert/strict";
import test from "node:test";
import {
  buildShoppingQuery,
  normalizeShoppingResults,
} from "../src/lib/products.js";

test("builds a bounded shopping query", () => {
  const query = buildShoppingQuery({
    colors: ["olive"],
    pattern: "solid",
    fit: "wide",
    subtype: "fatigue trousers",
    category: "pants",
    searchQuery: "",
  });
  assert.equal(query, "olive wide fatigue trousers pants");
});

test("normalizes, validates, and deduplicates product results", () => {
  const results = normalizeShoppingResults([
    {
      title: "Canvas jacket",
      source: "Store",
      product_link: "https://store.example/jacket",
      price: "$40",
      product_id: "one",
    },
    {
      title: "Canvas jacket",
      source: "Store",
      product_link: "https://store.example/duplicate",
      price: "$42",
      product_id: "two",
    },
    {
      title: "Bad URL",
      source: "Store",
      product_link: "javascript:alert(1)",
    },
  ]);

  assert.equal(results.length, 1);
  assert.equal(results[0].providerId, "one");
});
