export function isProTier(tier) {
  return tier === 1 || String(tier).toLowerCase() === "pro";
}

export class AdController {
  constructor(container, {
    documentRef = globalThis.document,
    windowRef = globalThis,
  } = {}) {
    this.container = container;
    this.document = documentRef;
    this.window = windowRef;
    this.loaded = false;
    this.scriptLoaded = false;
    this.adRequested = false;
    this.authorized = false;
  }

  update(tier, allowedByPolicy = true) {
    if (!this.container) return;
    this.authorized = !isProTier(tier) && allowedByPolicy;
    this.container.hidden = !this.authorized;
    if (!this.authorized) return;
    if (this.scriptLoaded) {
      this.#requestAd();
      return;
    }
    if (this.loaded) return;

    const client = this.container.dataset.adClient;
    const slot = this.container.dataset.adSlot;
    if (!client || !slot) {
      this.container.hidden = true;
      return;
    }

    this.loaded = true;
    const script = this.document.createElement("script");
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src =
      `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${encodeURIComponent(client)}`;
    script.addEventListener("load", () => {
      this.scriptLoaded = true;
      this.#requestAd();
    }, { once: true });
    script.addEventListener("error", () => {
      if (!this.authorized) return;
      const fallback = this.container.querySelector("[data-ad-fallback]");
      if (fallback) fallback.hidden = false;
    }, { once: true });
    this.document.head.append(script);
  }

  #requestAd() {
    if (!this.authorized || this.adRequested) return;
    this.window.adsbygoogle = this.window.adsbygoogle || [];
    this.window.adsbygoogle.push({});
    this.adRequested = true;
  }
}
