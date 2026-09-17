import { FEED_COOLDOWN_MS, INTERSTITIAL_SECONDS, MAX_UNEATEN_FOOD, type PublicConfig } from "./protocol";

const FLY_COOKIE = "fly_id";
const FLY_COOKIE_MAX_AGE = 34560000;
const FLY_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_STATE_BYTES = 32 * 1024;
const WRITE_THROTTLE_MS = 250;

const lastWriteAt = new Map<string, number>();

const SECURITY: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "X-Frame-Options": "DENY",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=(), interest-cohort=()",
};

function stateKey(id: string): string {
  return `fly:${id}`;
}

function flyIdentity(request: Request): { id: string; fresh: boolean } {
  const cookie = request.headers.get("Cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name !== FLY_COOKIE) continue;
    const value = decodeURIComponent(rest.join("="));
    if (FLY_ID_RE.test(value)) return { id: value, fresh: false };
  }
  return { id: crypto.randomUUID(), fresh: true };
}

function withFlyCookie(response: Response, identity: { id: string; fresh: boolean }): Response {
  if (!identity.fresh) return response;
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${FLY_COOKIE}=${identity.id}; Path=/; Max-Age=${FLY_COOKIE_MAX_AGE}; HttpOnly; Secure; SameSite=Lax`,
  );
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

async function handleState(request: Request, env: Env, id: string): Promise<Response> {
  if (request.method === "GET") {
    const raw = await env.FLY_STATE.get(stateKey(id));
    if (!raw) {
      return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
    }
    return new Response(raw, {
      headers: { "content-type": "application/json", "cache-control": "no-store" },
    });
  }

  if (request.method === "PUT") {
    const now = Date.now();
    const previous = lastWriteAt.get(id) ?? 0;
    if (now - previous < WRITE_THROTTLE_MS) {
      return json({ ok: true, throttled: true });
    }

    const declared = Number(request.headers.get("content-length") ?? 0);
    if (declared > MAX_STATE_BYTES) return json({ error: "too_large" }, 413);

    const body = await request.text();
    if (body.length > MAX_STATE_BYTES) return json({ error: "too_large" }, 413);

    let parsed: unknown;
    try {
      parsed = JSON.parse(body);
    } catch {
      return json({ error: "invalid" }, 400);
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return json({ error: "invalid" }, 400);
    }

    const snapshot = { ...(parsed as Record<string, unknown>), updatedAt: now };
    await env.FLY_STATE.put(stateKey(id), JSON.stringify(snapshot));
    lastWriteAt.set(id, now);
    return new Response(null, { status: 204, headers: { "cache-control": "no-store" } });
  }

  return json({ error: "method" }, 405);
}

function publicConfig(): PublicConfig {
  return {
    adsProvider: "mock",
    adsDisplayEnabled: false,
    adsensePublisherId: "",
    adsenseSlotId: "",
    interstitialSeconds: INTERSTITIAL_SECONDS,
    feedCooldownMs: FEED_COOLDOWN_MS,
    maxUneatenFood: MAX_UNEATEN_FOOD,
  };
}

function csp(): string {
  return [
    "default-src 'self'",
    "script-src 'self' https://static.cloudflareinsights.com",
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
    "img-src 'self' data: https:",
    "frame-src 'self'",
    "connect-src 'self' https://cloudflareinsights.com https://static.cloudflareinsights.com https://fonts.googleapis.com https://fonts.gstatic.com",
    "font-src 'self' https://fonts.gstatic.com",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

function json(data: unknown, status = 200): Response {
  return Response.json(data, {
    status,
    headers: { "cache-control": "no-store" },
  });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);
    const identity = flyIdentity(request);

    if (url.pathname === "/api/state") {
      return withFlyCookie(await handleState(request, env, identity.id), identity);
    }

    if (url.pathname === "/api/config") {
      if (request.method !== "GET") return json({ error: "method" }, 405);
      return withFlyCookie(json(publicConfig()), identity);
    }

    if (url.pathname === "/ads.txt") {
      return new Response(null, { status: 404 });
    }

    const asset = await env.ASSETS.fetch(request);
    const headers = new Headers(asset.headers);
    if (url.pathname.startsWith("/connectome/")) {
      headers.set("cache-control", "public, max-age=86400");
    }
    for (const [name, value] of Object.entries(SECURITY)) headers.set(name, value);
    headers.set("Content-Security-Policy", csp());
    if (url.hostname.endsWith("workers.dev")) {
      headers.set("X-Robots-Tag", "noindex, nofollow");
    }
    return withFlyCookie(
      new Response(asset.body, {
        status: asset.status,
        statusText: asset.statusText,
        headers,
      }),
      identity,
    );
  },
} satisfies ExportedHandler<Env>;
