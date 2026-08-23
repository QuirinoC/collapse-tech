// Minimal analytics shim replacing @vercel/analytics after the Cloudflare
// migration. Events are queued on window.dataLayer (console.debug in dev)
// so a real analytics provider can be wired in later without touching
// call sites.
export function track(eventName, payload) {
  if (typeof window === "undefined") return;
  const event = { name: eventName, ...(payload ? { payload } : {}) };
  if (typeof window.dataLayer !== "undefined") {
    window.dataLayer.push(event);
  } else if (process.env.NODE_ENV !== "production") {
    console.debug("[analytics]", event);
  }
}
