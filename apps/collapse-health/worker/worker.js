const DEFAULT_ALLOWED_ORIGIN = "https://health.collapsetechnologies.com";

function response(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

function headersFor(request, env) {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const headers = {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    allow: "POST, OPTIONS",
    vary: "Origin",
  };

  if (origin === allowedOrigin) {
    headers["access-control-allow-origin"] = origin;
    headers["access-control-allow-methods"] = "POST, OPTIONS";
    headers["access-control-allow-headers"] = "content-type";
  }

  return headers;
}

const worker = {
  async fetch(request, env) {
    const headers = headersFor(request, env);
    const origin = request.headers.get("origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return origin === allowedOrigin
        ? new Response(null, { status: 204, headers })
        : response({ error: "origin_not_allowed" }, 403, headers);
    }

    if (request.method !== "POST") {
      return response({ error: "method_not_allowed" }, 405, headers);
    }

    if (origin !== allowedOrigin) {
      return response({ error: "origin_not_allowed" }, 403, headers);
    }

    return response({ error: "not_available" }, 503, headers);
  },
};

export default worker;
