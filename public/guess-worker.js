let running = false;
let commitmentHex = "";
let batchSize = 5000;

self.onmessage = (event) => {
  const { type } = event.data || {};
  if (type === "start") {
    commitmentHex = event.data.commitmentHex;
    batchSize = event.data.batchSize || batchSize;
    if (!running) {
      running = true;
      loop();
    }
  }
  if (type === "stop") {
    running = false;
  }
};

async function loop() {
  let attemptsSinceReport = 0;
  while (running) {
    const guessBytes = new Uint8Array(32);
    self.crypto.getRandomValues(guessBytes);
    const hashBuffer = await self.crypto.subtle.digest("SHA-256", guessBytes);
    const hashHex = bytesToHex(new Uint8Array(hashBuffer));

    attemptsSinceReport += 1;
    if (hashHex === commitmentHex) {
      self.postMessage({
        type: "win",
        guessHex: bytesToHex(guessBytes),
        attempts: attemptsSinceReport,
      });
      running = false;
      return;
    }

    if (attemptsSinceReport >= batchSize) {
      self.postMessage({ type: "progress", attempts: attemptsSinceReport });
      attemptsSinceReport = 0;
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }
}

function bytesToHex(bytes) {
  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
