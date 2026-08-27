import { isHexString, normalizeHex } from "../shared/hex.js";

export const MAX_JSON_BODY_BYTES = 16 * 1024;
export const MAX_ATTEMPTS_PER_BATCH = 100_000;

export class InvalidJsonBodyError extends Error {
  constructor() {
    super("Invalid JSON");
  }
}

export class RequestBodyTooLargeError extends Error {
  constructor() {
    super("Request body exceeds the allowed size");
  }
}

export async function readJsonBody(request) {
  const contentLength = request.headers.get("content-length");
  if (contentLength && Number(contentLength) > MAX_JSON_BODY_BYTES) {
    throw new RequestBodyTooLargeError();
  }

  if (!request.body) {
    throw new InvalidJsonBodyError();
  }

  const reader = request.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      totalBytes += value.byteLength;
      if (totalBytes > MAX_JSON_BODY_BYTES) {
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      throw error;
    }
    throw new InvalidJsonBodyError();
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }

  try {
    return JSON.parse(new TextDecoder().decode(bytes));
  } catch {
    throw new InvalidJsonBodyError();
  }
}

export function parseClaimPayload(payload) {
  if (!isPlainObject(payload)) return null;

  const guessHex = normalizeHex(payload.guessHex);
  return isHexString(guessHex, 64) ? { guessHex } : null;
}

export function parseTelemetryPayload(payload) {
  if (!isPlainObject(payload)) return null;

  const attemptsTotal = parseAttemptCount(payload.attemptsTotal);
  const attemptsAuto = parseAttemptCount(payload.attemptsAuto);
  const attemptsManual = parseAttemptCount(payload.attemptsManual);

  if (
    attemptsTotal === null ||
    attemptsAuto === null ||
    attemptsManual === null ||
    attemptsTotal !== attemptsAuto + attemptsManual
  ) {
    return null;
  }

  return { attemptsTotal, attemptsAuto, attemptsManual };
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

function parseAttemptCount(value) {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > MAX_ATTEMPTS_PER_BATCH
  ) {
    return null;
  }
  return value;
}
