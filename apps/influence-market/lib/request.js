export const MAX_JSON_BODY_BYTES = 32 * 1024;

export class RequestBodyError extends Error {
  constructor(message, statusCode = 400) {
    super(message);
    this.name = "RequestBodyError";
    this.statusCode = statusCode;
  }
}

export async function parseJsonBody(request) {
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyError(
      "Request body exceeds the 32 KiB limit.",
      413,
    );
  }
  if (!request.body) {
    throw new RequestBodyError("Invalid JSON body.");
  }

  const reader = request.body.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_JSON_BODY_BYTES) {
      await reader.cancel();
      throw new RequestBodyError(
        "Request body exceeds the 32 KiB limit.",
        413,
      );
    }
    chunks.push(value);
  }

  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  let text;
  try {
    text = new TextDecoder("utf-8", { fatal: true }).decode(bytes);
  } catch {
    throw new RequestBodyError("Invalid JSON body.");
  }
  try {
    return JSON.parse(text);
  } catch {
    throw new RequestBodyError("Invalid JSON body.");
  }
}

export function requestError(error) {
  const issue = error?.issues?.[0];
  return {
    message:
      error instanceof RequestBodyError
        ? error.message
        : issue
          ? `${issue.path?.length ? `${issue.path.join(".")}: ` : ""}${issue.message}`
          : "Invalid request.",
    status: error instanceof RequestBodyError ? error.statusCode : 400,
  };
}
