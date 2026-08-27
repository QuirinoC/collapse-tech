import assert from "node:assert/strict";
import test from "node:test";
import { AdController, isProTier } from "../ads.mjs";

test("Pro tiers never load or display an ad", () => {
  let appended = false;
  const container = {
    hidden: false,
    dataset: { adClient: "ca-pub-123456", adSlot: "123456" },
  };
  const controller = new AdController(container, {
    documentRef: {
      createElement() {
        throw new Error("script should not be created");
      },
      head: { append() { appended = true; } },
    },
  });

  controller.update(1);

  assert.equal(isProTier("Pro"), true);
  assert.equal(container.hidden, true);
  assert.equal(appended, false);
});

test("free and anonymous sessions load one manual AdSense script", () => {
  let appended = 0;
  let loadHandler;
  const script = {
    addEventListener(event, handler) {
      if (event === "load") loadHandler = handler;
    },
  };
  const windowRef = {};
  const container = {
    hidden: true,
    dataset: { adClient: "ca-pub-123456", adSlot: "123456" },
  };
  const controller = new AdController(container, {
    documentRef: {
      createElement() {
        return script;
      },
      head: { append() { appended += 1; } },
    },
    windowRef,
  });

  controller.update(null);
  controller.update("Free");
  loadHandler();

  assert.equal(container.hidden, false);
  assert.equal(appended, 1);
  assert.equal(script.async, true);
  assert.equal(script.crossOrigin, "anonymous");
  assert.equal(windowRef.adsbygoogle.length, 1);
});

test("failed Google requests fall back to a first-party Pro promotion", () => {
  let errorHandler;
  const fallback = { hidden: true };
  const controller = new AdController({
    hidden: true,
    dataset: { adClient: "ca-pub-123456", adSlot: "123456" },
    querySelector: () => fallback,
  }, {
    documentRef: {
      createElement: () => ({
        addEventListener(event, handler) {
          if (event === "error") errorHandler = handler;
        },
      }),
      head: { append() {} },
    },
  });

  controller.update("Free");
  errorHandler();

  assert.equal(fallback.hidden, false);
});

test("runtime safety policy suppresses ads before loading Google", () => {
  let appended = false;
  const container = {
    hidden: false,
    dataset: { adClient: "ca-pub-123456", adSlot: "123456" },
  };
  const controller = new AdController(container, {
    documentRef: {
      createElement() {
        throw new Error("script should not be created");
      },
      head: { append() { appended = true; } },
    },
  });

  controller.update("Free", false);

  assert.equal(container.hidden, true);
  assert.equal(appended, false);
});

test("late Google load cannot bypass a newer deny decision", () => {
  let loadHandler;
  const windowRef = {};
  const container = {
    hidden: true,
    dataset: { adClient: "ca-pub-123456", adSlot: "123456" },
  };
  const controller = new AdController(container, {
    documentRef: {
      createElement: () => ({
        addEventListener(event, handler) {
          if (event === "load") loadHandler = handler;
        },
      }),
      head: { append() {} },
    },
    windowRef,
  });

  controller.update("Free", true);
  controller.update("Free", false);
  loadHandler();

  assert.equal(container.hidden, true);
  assert.equal(windowRef.adsbygoogle, undefined);
});
