import assert from "node:assert/strict";
import test from "node:test";
import {
  authErrorMessage,
  createFirebaseAuthClient,
} from "../firebase-auth.mjs";

function sdkFixture() {
  const calls = [];
  const user = {
    getIdToken: async (forceRefresh) => `token:${forceRefresh}`,
  };
  const auth = { currentUser: user };
  class GoogleProvider {
    setCustomParameters(parameters) {
      calls.push(["parameters", parameters]);
    }
  }
  class AppleProvider {
    constructor(id) {
      calls.push(["provider", id]);
    }
    setCustomParameters(parameters) {
      calls.push(["parameters", parameters]);
    }
  }
  return {
    calls,
    user,
    auth,
    sdk: {
      getApps: () => [],
      initializeApp: (config) => {
        calls.push(["initialize", config]);
        return "app";
      },
      getApp: () => "existing-app",
      getAuth: (app) => {
        calls.push(["auth", app]);
        return auth;
      },
      setPersistence: async (...arguments_) => calls.push(["persistence", ...arguments_]),
      browserLocalPersistence: "local",
      getIdTokenResult: async (_user, forceRefresh) => ({
        claims: { moderator: forceRefresh },
      }),
      GoogleAuthProvider: GoogleProvider,
      OAuthProvider: AppleProvider,
      signInWithPopup: async (...arguments_) => calls.push(["sign-in", ...arguments_]),
      signInWithRedirect: async (...arguments_) => calls.push(["redirect", ...arguments_]),
      signOut: async (...arguments_) => calls.push(["sign-out", ...arguments_]),
      deleteUser: async (...arguments_) => calls.push(["delete-user", ...arguments_]),
      onIdTokenChanged: (_auth, listener) => {
        listener(user);
        return "unsubscribe";
      },
    },
  };
}

test("initializes Firebase once and returns ID tokens", async () => {
  const fixture = sdkFixture();
  const client = await createFirebaseAuthClient({
    config: { projectId: "test" },
    loadSdk: async () => fixture.sdk,
  });

  assert.equal(await client.getToken(), "token:false");
  assert.equal(await client.getToken(true), "token:true");
  assert.deepEqual(await client.getTokenClaims(), { moderator: false });
  assert.deepEqual(await client.getTokenClaims(true), { moderator: true });
  assert.deepEqual(fixture.calls.slice(0, 3), [
    ["initialize", { projectId: "test" }],
    ["auth", "app"],
    ["persistence", fixture.auth, "local"],
  ]);
});

test("uses the Firebase Google and Apple popup providers", async () => {
  const fixture = sdkFixture();
  const client = await createFirebaseAuthClient({ loadSdk: async () => fixture.sdk });

  await client.signIn("google");
  await client.signIn("apple");

  assert.equal(fixture.calls.filter(([name]) => name === "sign-in").length, 2);
  assert.ok(fixture.calls.some((call) => call[0] === "provider" && call[1] === "apple.com"));
});

test("falls back to redirect when the browser blocks a sign-in popup", async () => {
  const fixture = sdkFixture();
  fixture.sdk.signInWithPopup = async () => {
    throw { code: "auth/popup-blocked" };
  };
  const client = await createFirebaseAuthClient({ loadSdk: async () => fixture.sdk });

  await client.signIn("google");

  assert.equal(fixture.calls.filter(([name]) => name === "redirect").length, 1);
});

test("publishes auth changes and signs out", async () => {
  const fixture = sdkFixture();
  const client = await createFirebaseAuthClient({ loadSdk: async () => fixture.sdk });
  let observedUser = null;

  assert.equal(client.subscribe((user) => { observedUser = user; }), "unsubscribe");
  await client.signOut();

  assert.equal(observedUser, fixture.user);
  assert.ok(fixture.calls.some(([name]) => name === "sign-out"));
});

test("deletes the current Firebase user only after the server operation", async () => {
  const fixture = sdkFixture();
  const client = await createFirebaseAuthClient({ loadSdk: async () => fixture.sdk });

  await client.deleteAccount();

  assert.ok(fixture.calls.some(([name, value]) => name === "delete-user" && value === fixture.user));
});

test("returns actionable Firebase errors without exposing provider details", () => {
  assert.equal(
    authErrorMessage({ code: "auth/unauthorized-domain" }),
    "This domain is not authorized for Pixelboard sign-in.",
  );
  assert.equal(authErrorMessage({ code: "auth/internal-error" }), "Sign-in could not be completed.");
});
