const FIREBASE_CONFIG = Object.freeze({
  apiKey: "AIzaSyAQyBTp_0z7f-ZrAA0zHTXg-HCvRIu_lNs",
  authDomain: "collapse-technologies.firebaseapp.com",
  projectId: "collapse-technologies",
  storageBucket: "collapse-technologies.firebasestorage.app",
  messagingSenderId: "241184054384",
  appId: "1:241184054384:web:43e604d7dd692e3210e8b5",
  measurementId: "G-DER2RGSVQP",
});

const FIREBASE_VERSION = "11.10.0";
const APP_SDK_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-app.js`;
const AUTH_SDK_URL =
  `https://www.gstatic.com/firebasejs/${FIREBASE_VERSION}/firebase-auth.js`;

export class FirebaseAuthClient {
  #auth;
  #sdk;

  constructor(auth, sdk) {
    this.#auth = auth;
    this.#sdk = sdk;
  }

  get currentUser() {
    return this.#auth.currentUser;
  }

  async getToken(forceRefresh = false) {
    return this.#auth.currentUser?.getIdToken(forceRefresh) ?? null;
  }

  subscribe(listener) {
    return this.#sdk.onAuthStateChanged(this.#auth, listener);
  }

  async signIn(providerName) {
    const Provider = {
      google: this.#sdk.GoogleAuthProvider,
      apple: this.#sdk.OAuthProvider,
    }[providerName];
    if (!Provider) throw new Error("That sign-in provider is not supported.");

    const provider = providerName === "apple" ? new Provider("apple.com") : new Provider();
    provider.setCustomParameters?.({ prompt: providerName === "google" ? "select_account" : "login" });
    return this.#sdk.signInWithPopup(this.#auth, provider);
  }

  signOut() {
    return this.#sdk.signOut(this.#auth);
  }
}

export async function createFirebaseAuthClient({
  config = FIREBASE_CONFIG,
  loadSdk = loadFirebaseSdk,
} = {}) {
  const sdk = await loadSdk();
  const app = sdk.getApps().length ? sdk.getApp() : sdk.initializeApp(config);
  const auth = sdk.getAuth(app);
  await sdk.setPersistence(auth, sdk.browserLocalPersistence);
  return new FirebaseAuthClient(auth, sdk);
}

export function authErrorMessage(error) {
  return {
    "auth/popup-closed-by-user": "Sign-in was canceled.",
    "auth/cancelled-popup-request": "Only one sign-in window can be open at a time.",
    "auth/popup-blocked": "Your browser blocked the sign-in window. Allow popups and try again.",
    "auth/account-exists-with-different-credential":
      "This email already uses another sign-in method. Sign in with that provider first.",
    "auth/network-request-failed": "Authentication could not reach Firebase. Check your connection.",
    "auth/operation-not-allowed": "This sign-in method is not enabled yet.",
    "auth/unauthorized-domain": "This domain is not authorized for Pixelboard sign-in.",
  }[error?.code] ?? "Sign-in could not be completed.";
}

async function loadFirebaseSdk() {
  const [appSdk, authSdk] = await Promise.all([
    import(APP_SDK_URL),
    import(AUTH_SDK_URL),
  ]);
  return { ...appSdk, ...authSdk };
}
