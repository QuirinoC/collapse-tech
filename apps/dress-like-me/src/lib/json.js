export class RequestBodyTooLargeError extends Error {}

export class InvalidJsonBodyError extends Error {}

export async function readBoundedJson(request, maxBytes) {
  const contentLength = request.headers.get("content-length");
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    throw new RequestBodyTooLargeError("Request body exceeds the allowed limit.");
  }

  if (!request.body) {
    throw new InvalidJsonBodyError("Request body is required.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let byteLength = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    byteLength += value.byteLength;
    if (byteLength > maxBytes) {
      throw new RequestBodyTooLargeError("Request body exceeds the allowed limit.");
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(byteLength);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new InvalidJsonBodyError("Request body must be valid JSON.");
  }
}
