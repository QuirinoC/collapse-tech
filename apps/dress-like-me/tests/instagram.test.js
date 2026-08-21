import assert from "node:assert/strict";
import test from "node:test";
import {
  extractInstagramMetadata,
  isAllowedInstagramImageUrl,
  normalizeInstagramUrl,
} from "../src/lib/instagram.js";

test("normalizes supported public Instagram URLs", () => {
  assert.equal(
    normalizeInstagramUrl("https://instagram.com/p/ABC_123/?utm_source=test"),
    "https://www.instagram.com/p/ABC_123/",
  );
  assert.equal(
    normalizeInstagramUrl("https://www.instagram.com/reel/xyz-99/"),
    "https://www.instagram.com/reel/xyz-99/",
  );
});

test("rejects profiles, insecure URLs, and lookalike hosts", () => {
  assert.throws(() => normalizeInstagramUrl("https://instagram.com/person/"));
  assert.throws(() => normalizeInstagramUrl("http://instagram.com/p/ABC/"));
  assert.throws(() =>
    normalizeInstagramUrl("https://instagram.com.evil.example/p/ABC/"),
  );
});

test("only accepts Instagram image CDN hosts", () => {
  assert.equal(
    isAllowedInstagramImageUrl("https://scontent.cdninstagram.com/image.jpg"),
    true,
  );
  assert.equal(
    isAllowedInstagramImageUrl("https://scontent-lax3-2.xx.fbcdn.net/image.jpg"),
    true,
  );
  assert.equal(
    isAllowedInstagramImageUrl("https://fbcdn.net.evil.example/image.jpg"),
    false,
  );
});

test("extracts and decodes public metadata", () => {
  const metadata = extractInstagramMetadata(
    [
      '<meta property="og:title" content="A look">',
      '<meta property="og:description" content="Jacket &amp; trousers">',
      '<meta property="og:image" content="https://scontent.cdninstagram.com/look.jpg?x=1&amp;y=2">',
    ].join(""),
    "https://www.instagram.com/p/ABC/",
  );

  assert.equal(metadata.caption, "Jacket & trousers");
  assert.equal(
    metadata.imageUrl,
    "https://scontent.cdninstagram.com/look.jpg?x=1&y=2",
  );
});
