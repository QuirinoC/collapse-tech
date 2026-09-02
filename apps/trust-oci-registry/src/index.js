const API_VERSION = { "Docker-Distribution-API-Version": "registry/2.0" };

function json(status, body, extra = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...API_VERSION,
      "Content-Type": "application/json",
      ...extra,
    },
  });
}

function registryError(status, code, message) {
  return json(status, { errors: [{ code, message }] });
}

function blobKey(digest) {
  const hex = digest.replace(/^sha256:/, "");
  return `blobs/sha256/${hex}`;
}

function tagKey(name, tag) {
  return `repos/${name}/tags/${tag}`;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";
    const method = request.method.toUpperCase();

    if (method === "GET" && (path === "/v2" || path === "/")) {
      return json(200, {});
    }

    const manifestMatch = path.match(/^\/v2\/(.+)\/manifests\/([^/]+)$/);
    if (manifestMatch && (method === "GET" || method === "HEAD")) {
      return serveManifest(env, method, manifestMatch[1], decodeURIComponent(manifestMatch[2]));
    }

    const blobMatch = path.match(/^\/v2\/(.+)\/blobs\/(sha256:[a-f0-9]+)$/);
    if (blobMatch && (method === "GET" || method === "HEAD")) {
      return serveBlob(env, request, method, blobMatch[2]);
    }

    return registryError(404, "UNSUPPORTED", "This registry is pull-only");
  },
};

async function resolveDigest(env, name, reference) {
  if (reference.startsWith("sha256:")) {
    return reference;
  }
  const tag = await env.BUCKET.get(tagKey(name, reference));
  if (!tag) {
    return null;
  }
  return (await tag.text()).trim();
}

async function serveManifest(env, method, name, reference) {
  const digest = await resolveDigest(env, name, reference);
  if (!digest) {
    return registryError(404, "MANIFEST_UNKNOWN", `manifest unknown: ${reference}`);
  }
  const object = await env.BUCKET.get(blobKey(digest));
  if (!object) {
    return registryError(404, "MANIFEST_UNKNOWN", `manifest unknown: ${digest}`);
  }
  const bytes = await object.arrayBuffer();
  let mediaType = object.httpMetadata?.contentType || "application/vnd.oci.image.manifest.v1+json";
  try {
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (parsed.mediaType) {
      mediaType = parsed.mediaType;
    }
  } catch {
    // keep stored content type
  }
  const headers = {
    ...API_VERSION,
    "Content-Type": mediaType,
    "Docker-Content-Digest": digest,
    "Content-Length": String(bytes.byteLength),
    ETag: `"${digest}"`,
  };
  if (method === "HEAD") {
    return new Response(null, { status: 200, headers });
  }
  return new Response(bytes, { status: 200, headers });
}

async function serveBlob(env, request, method, digest) {
  const key = blobKey(digest);
  if (method === "HEAD") {
    const object = await env.BUCKET.head(key);
    if (!object) {
      return registryError(404, "BLOB_UNKNOWN", `blob unknown: ${digest}`);
    }
    return new Response(null, {
      status: 200,
      headers: {
        ...API_VERSION,
        "Content-Type": "application/octet-stream",
        "Docker-Content-Digest": digest,
        "Content-Length": String(object.size),
        "Accept-Ranges": "bytes",
      },
    });
  }

  const range = parseRange(request.headers.get("Range"));
  const object = await env.BUCKET.get(key, range ? { range } : undefined);
  if (!object) {
    return registryError(404, "BLOB_UNKNOWN", `blob unknown: ${digest}`);
  }
  const size = object.size ?? object.range?.offset + object.range?.length;
  const headers = {
    ...API_VERSION,
    "Content-Type": "application/octet-stream",
    "Docker-Content-Digest": digest,
    "Accept-Ranges": "bytes",
  };
  if (range && object.range) {
    const start = object.range.offset;
    const end = object.range.offset + object.range.length - 1;
    headers["Content-Range"] = `bytes ${start}-${end}/${object.size}`;
    headers["Content-Length"] = String(object.range.length);
    return new Response(object.body, { status: 206, headers });
  }
  headers["Content-Length"] = String(object.size ?? size ?? "");
  return new Response(object.body, { status: 200, headers });
}

function parseRange(header) {
  if (!header) {
    return null;
  }
  const match = header.match(/^bytes=(\d+)-(\d+)?$/);
  if (!match) {
    return null;
  }
  const offset = Number(match[1]);
  if (match[2]) {
    const end = Number(match[2]);
    return { offset, length: end - offset + 1 };
  }
  return { offset };
}
