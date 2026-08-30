import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const testsDirectory = fileURLToPath(new URL(".", import.meta.url));
const webRoot = join(testsDirectory, "../../../..");
const razor = readFileSync(join(webRoot, "Pages/Shared/_Pixelboard.cshtml"), "utf8");
const app = readFileSync(join(webRoot, "wwwroot/js/pixelboard/app.mjs"), "utf8");
const iosAccount = readFileSync(
  join(webRoot, "../infinite-pixelboard-ios/Sources/InfinitePixelboardApp/AccountView.swift"),
  "utf8",
);
const localizationDirectory = join(
  webRoot,
  "../infinite-pixelboard-ios/Resources",
);

test("web keeps compact auth controls without an account status panel", () => {
  assert.match(razor, /data-login-provider/);
  assert.match(razor, /data-sign-out/);
  assert.match(razor, /data-delete-account/);
  assert.doesNotMatch(razor, /data-auth-note/);
  assert.doesNotMatch(razor, /data-account-section|data-account-state|data-cooldown|data-boost-state/);
  assert.doesNotMatch(app, /authNote|Signing out|Board service unavailable|Painting is paused/);
  assert.doesNotMatch(app, /Viewing anonymously|Signed in as|Account action required/);
  assert.doesNotMatch(iosAccount, /authNote|authNotice|Accept the community standards before placing/);
});

test("web palette exposes the Pro color-grid affordance", () => {
  assert.match(razor, /data-pro-color/);
  assert.match(app, /elements\.proColor\.hidden = isPro/);
});

test("web repeats Apple restore and transfer safety copy", () => {
  assert.match(razor, /Restore Purchases.*re-syncs/s);
  assert.match(razor, /does not move it between Apple IDs, Google/);
  assert.match(razor, /previous Pixelboard account/);
  assert.match(razor, /hello@collapsetechnologies\.com/);
});

test("iOS localization omits removed account status copy", () => {
  const files = readdirSync(localizationDirectory)
    .filter((name) => name.endsWith(".lproj"))
    .map((name) => readFileSync(join(localizationDirectory, name, "Localizable.strings"), "utf8"));
  assert.ok(files.length > 0);
  for (const contents of files) {
    assert.doesNotMatch(contents, /"(state|cooldown|paint_boost|anonymous|viewing_anonymously|board_ready)"\s*=/);
  }
});
