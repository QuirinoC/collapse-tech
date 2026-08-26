const DEFAULT_ALLOWED_ORIGIN = "https://health.collapsetechnologies.com";

function corsHeaders(request, env) {
  const origin = request.headers.get("origin");
  const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;
  const headers = {
    "content-type": "application/json",
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    vary: "Origin",
  };

  if (origin === allowedOrigin) {
    headers["access-control-allow-origin"] = origin;
  }

  return headers;
}

function json(body, status, headers) {
  return new Response(JSON.stringify(body), { status, headers });
}

const worker = {
  async fetch(request, env) {
    const headers = corsHeaders(request, env);
    const origin = request.headers.get("origin");
    const allowedOrigin = env.ALLOWED_ORIGIN || DEFAULT_ALLOWED_ORIGIN;

    if (request.method === "OPTIONS") {
      return origin === allowedOrigin
        ? new Response(null, { status: 204, headers })
        : json({ error: "origin_not_allowed" }, 403, headers);
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, headers);
    }

    if (origin && origin !== allowedOrigin) {
      return json({ error: "origin_not_allowed" }, 403, headers);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "invalid_json" }, 400, headers);
    }

    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return json({ error: "invalid_payload" }, 400, headers);
    }

    const name = String(body.name || "").slice(0, 120).trim();
    const email = String(body.email || "").slice(0, 200).trim().toLowerCase();
    const phone = String(body.phone || "").slice(0, 50).trim();
    const procedure = String(body.procedure || "").slice(0, 120).trim();
    const notes = String(body.notes ?? body.message ?? "").slice(0, 2000).trim();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: "invalid_email" }, 400, headers);
    }

    if (body.website) {
      return json({ ok: true }, 200, headers);
    }

    const emailKey = `email:${email}`;
    const existingId = await env.LEADS.get(emailKey);
    if (existingId) {
      return json({ ok: true, id: existingId, duplicate: true }, 200, headers);
    }

    const id = crypto.randomUUID();
    const record = {
      id,
      name,
      email,
      phone,
      procedure,
      notes,
      userAgent: request.headers.get("user-agent") || "",
      country: request.cf?.country || null,
      receivedAt: new Date().toISOString(),
    };

    await env.LEADS.put(`lead:${id}`, JSON.stringify(record));
    await env.LEADS.put(emailKey, id);

    return json({ ok: true, id }, 200, headers);
  },
};

export default worker;
