import assert from "node:assert/strict";
import test from "node:test";
import {
  RequestBodyTooLargeError,
  readBoundedJson,
} from "../src/lib/json.js";

test("reads a small JSON request body", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    body: JSON.stringify({ sourceUrl: "https://www.instagram.com/p/ABC/" }),
  });

  assert.deepEqual(await readBoundedJson(request, 1024), {
    sourceUrl: "https://www.instagram.com/p/ABC/",
  });
});

test("rejects an oversized declared request body before reading it", async () => {
  const request = new Request("https://example.test", {
    method: "POST",
    headers: { "content-length": "129" },
    body: "{}",
  });

  await assert.rejects(
    readBoundedJson(request, 128),
    RequestBodyTooLargeError,
  );
});

test("rejects an oversized streamed JSON request body", async () => {
  const body = new ReadableStream({
    start(controller) {
      controller.enqueue(new TextEncoder().encode('{"sourceUrl":"'));
      controller.enqueue(new TextEncoder().encode("a".repeat(1024)));
      controller.enqueue(new TextEncoder().encode('"}'));
      controller.close();
    },
  });
  const request = new Request("https://example.test", {
    method: "POST",
    body,
    duplex: "half",
  });

  await assert.rejects(
    readBoundedJson(request, 128),
    RequestBodyTooLargeError,
  );
});
