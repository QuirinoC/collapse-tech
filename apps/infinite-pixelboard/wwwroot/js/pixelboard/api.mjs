export class ApiError extends Error {
  constructor(message, status, code = "unknown_error", payload = null) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.payload = payload;
  }
}

export class PixelboardApi {
  constructor({ baseUrl = "/api/v1", getToken = async () => null, onRequest } = {}) {
    this.baseUrl = baseUrl;
    this.getToken = getToken;
    this.onRequest = onRequest ?? (() => {});
  }

  metadata(signal) {
    return this.#request("/board", { signal });
  }

  tile(tileRow, tileColumn, signal) {
    return this.#request(`/tiles/${tileRow}/${tileColumn}`, { signal });
  }

  async account(signal) {
    const token = await this.getToken();
    if (!token) return null;
    return this.#request("/account", { signal, token });
  }

  async advertising(signal) {
    const token = await this.getToken();
    return this.#request("/advertising", { signal, token });
  }

  async acceptCommunityStandards(signal) {
    return this.#authorized("/account/community-standards", {
      method: "POST",
      signal,
    });
  }

  place({ row, column, color, idempotencyKey }, signal) {
    return this.#authorized("/placements", {
      method: "POST",
      signal,
      body: {
        row,
        column,
        color,
        idempotencyKey,
        client: { platform: "web", appVersion: "1.0" },
      },
    });
  }

  report({ region, reason, note }, signal) {
    return this.#authorized("/reports", {
      method: "POST",
      signal,
      body: {
        region,
        reason,
        note: note || null,
        client: { platform: "web", appVersion: "1.0" },
      },
    });
  }

  async #authorized(path, options) {
    const token = await this.getToken();
    if (!token) {
      throw new ApiError("Sign in to place pixels.", 401, "authentication_required");
    }
    return this.#request(path, { ...options, token });
  }

  async #request(path, { method = "GET", body, token, signal } = {}) {
    this.onRequest("start");
    try {
      const response = await fetch(`${this.baseUrl}${path}`, {
        method,
        signal,
        headers: {
          Accept: "application/json",
          ...(body ? { "Content-Type": "application/json" } : {}),
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: body ? JSON.stringify(body) : undefined,
      });
      const payload = response.status === 204 ? null : await readPayload(response);
      if (!response.ok) {
        const error = payload?.error ?? payload;
        throw new ApiError(
          error?.message ?? `Request failed with status ${response.status}.`,
          response.status,
          error?.code,
          payload,
        );
      }
      this.onRequest("success");
      return payload;
    } catch (error) {
      this.onRequest(error?.name === "AbortError" ? "abort" : "failure");
      throw error;
    }
  }
}

async function readPayload(response) {
  const contentType = response.headers.get("content-type") ?? "";
  return contentType.includes("application/json") ? response.json() : null;
}
