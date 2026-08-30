import assert from "node:assert/strict";
import test from "node:test";
import {
  EXPECTED_PROJECT_ID,
  OPERATOR_EMAIL,
  parseArguments,
  provisionModerator,
  validateTarget,
} from "./provision-moderator.mjs";

const confirmedArguments = [
  "--project",
  EXPECTED_PROJECT_ID,
  "--email",
  OPERATOR_EMAIL,
  "--confirm-email",
  OPERATOR_EMAIL,
];

function target(overrides = {}) {
  return {
    uid: "google-operator-uid",
    email: OPERATOR_EMAIL,
    emailVerified: true,
    disabled: false,
    providerData: [{ providerId: "google.com" }],
    customClaims: {},
    ...overrides,
  };
}

test("requires the production project and exact operator email", () => {
  const options = parseArguments([...confirmedArguments, "--dry-run"]);

  assert.equal(options.project, EXPECTED_PROJECT_ID);
  assert.equal(options.email, OPERATOR_EMAIL);
  assert.equal(options.apply, false);
  assert.equal(options.dryRun, true);
  assert.throws(
    () => parseArguments([
      ...confirmedArguments.slice(0, 2),
      "--email",
      "59v269rgt7@privaterelay.appleid.com",
      "--confirm-email",
      "59v269rgt7@privaterelay.appleid.com",
    ]),
    /--email must be exactly/,
  );
});

test("requires an explicit UID confirmation before applying", () => {
  assert.throws(
    () => parseArguments([...confirmedArguments, "--apply"]),
    /--apply requires --uid/,
  );
  assert.throws(
    () => parseArguments([
      ...confirmedArguments,
      "--uid",
      "uid-a",
      "--confirm-uid",
      "uid-b",
      "--apply",
    ]),
    /--confirm-uid must exactly match/,
  );

  const options = parseArguments([
    ...confirmedArguments,
    "--uid",
    "uid-a",
    "--confirm-uid",
    "uid-a",
    "--apply",
  ]);
  assert.equal(options.apply, true);
});

test("rejects accounts that are not the verified Google operator", () => {
  const options = parseArguments([...confirmedArguments, "--dry-run"]);
  assert.throws(
    () => validateTarget(target({ email: "other@example.com" }), options),
    /exact approved operator email/,
  );
  assert.throws(
    () => validateTarget(target({ providerData: [{ providerId: "apple.com" }] }), options),
    /not linked to Google/,
  );
});

test("dry run does not mutate Firebase", async () => {
  const options = parseArguments([...confirmedArguments, "--dry-run"]);
  let setClaimsCalls = 0;
  const output = { log() {}, error() {} };
  await provisionModerator({
    getUserByEmail: async () => target({ customClaims: { role: "operator" } }),
    setCustomUserClaims: async () => { setClaimsCalls += 1; },
  }, options, output);

  assert.equal(setClaimsCalls, 0);
});

test("apply preserves existing custom claims and adds only moderator", async () => {
  const options = parseArguments([
    ...confirmedArguments,
    "--uid",
    "google-operator-uid",
    "--confirm-uid",
    "google-operator-uid",
    "--apply",
  ]);
  let appliedClaims;
  await provisionModerator({
    getUserByEmail: async () => target({
      customClaims: { role: "operator", existing: true },
    }),
    setCustomUserClaims: async (_uid, claims) => { appliedClaims = claims; },
  }, options, { log() {}, error() {} });

  assert.deepEqual(appliedClaims, {
    role: "operator",
    existing: true,
    moderator: true,
  });
});
