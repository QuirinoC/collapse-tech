const INSTAGRAM_HOSTS = new Set(["instagram.com", "www.instagram.com"]);
const IMAGE_HOST_SUFFIXES = [".cdninstagram.com", ".fbcdn.net"];
const MAX_HTML_BYTES = 2 * 1024 * 1024;
const MAX_IMAGE_BYTES = 12 * 1024 * 1024;

export function normalizeInstagramUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a complete Instagram post or reel URL.");
  }

  if (url.protocol !== "https:" || !INSTAGRAM_HOSTS.has(url.hostname)) {
    throw new Error("Only public instagram.com post and reel URLs are supported.");
  }

  const match = url.pathname.match(/^\/(p|reel)\/([A-Za-z0-9_-]+)\/?$/);
  if (!match) {
    throw new Error("Only individual Instagram post and reel URLs are supported.");
  }

  return `https://www.instagram.com/${match[1]}/${match[2]}/`;
}

export function isAllowedInstagramImageUrl(value) {
  try {
    const url = new URL(value);
    return (
      url.protocol === "https:" &&
      IMAGE_HOST_SUFFIXES.some(
        (suffix) =>
          url.hostname.endsWith(suffix) ||
          url.hostname === suffix.slice(1),
      )
    );
  } catch {
    return false;
  }
}

function decodeHtml(value) {
  return value
    .replaceAll("&amp;", "&")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">");
}

export function extractInstagramMetadata(html, canonicalUrl) {
  const getMeta = (property) => {
    const escaped = property.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const patterns = [
      new RegExp(
        `<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,
        "i",
      ),
      new RegExp(
        `<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,
        "i",
      ),
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match) return decodeHtml(match[1]);
    }
    return null;
  };

  const imageUrl = getMeta("og:image");
  if (!imageUrl || !isAllowedInstagramImageUrl(imageUrl)) {
    throw new Error(
      "Instagram did not expose a public image for this post. It may be private, removed, or login-gated.",
    );
  }

  return {
    canonicalUrl,
    imageUrl,
    caption: getMeta("og:description"),
    title: getMeta("og:title"),
  };
}

async function readBoundedResponse(response, maxBytes, asText = false) {
  const contentLength = Number(response.headers.get("content-length") || 0);
  if (contentLength > maxBytes) {
    throw new Error("The source response is larger than the allowed limit.");
  }

  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.byteLength > maxBytes) {
    throw new Error("The source response is larger than the allowed limit.");
  }
  return asText ? new TextDecoder().decode(bytes) : bytes;
}

export async function fetchInstagramMetadata(sourceUrl) {
  const canonicalUrl = normalizeInstagramUrl(sourceUrl);
  const response = await fetch(canonicalUrl, {
    headers: {
      accept: "text/html,application/xhtml+xml",
      "user-agent":
        "Mozilla/5.0 (compatible; DressLikeMe/1.0; +https://dresslikeme.collapsetechnologies.com/about)",
    },
    redirect: "manual",
    signal: AbortSignal.timeout(12_000),
  });

  if (response.status >= 300 && response.status < 400) {
    throw new Error("Instagram redirected this post to an unsupported page.");
  }
  if (!response.ok) {
    throw new Error(`Instagram returned ${response.status} for this public post.`);
  }
  if (!response.headers.get("content-type")?.includes("text/html")) {
    throw new Error("Instagram returned an unexpected response type.");
  }

  const html = await readBoundedResponse(response, MAX_HTML_BYTES, true);
  return extractInstagramMetadata(html, canonicalUrl);
}

export async function fetchInstagramImage(imageUrl) {
  if (!isAllowedInstagramImageUrl(imageUrl)) {
    throw new Error("Instagram returned an image from an unsupported host.");
  }

  const response = await fetch(imageUrl, {
    headers: { accept: "image/jpeg,image/png,image/webp" },
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) {
    throw new Error(`The source image returned ${response.status}.`);
  }

  const mimeType = response.headers.get("content-type")?.split(";")[0];
  if (!["image/jpeg", "image/png", "image/webp"].includes(mimeType)) {
    throw new Error("The source did not return a supported image.");
  }

  const bytes = await readBoundedResponse(response, MAX_IMAGE_BYTES);
  return { bytes, mimeType };
}
