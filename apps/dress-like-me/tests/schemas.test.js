import assert from "node:assert/strict";
import test from "node:test";
import { garmentExtractionSchema } from "../src/lib/schemas.js";

const validGarment = {
  category: "outerwear",
  subtype: "work jacket",
  colors: ["brown"],
  materials: ["canvas"],
  pattern: "solid",
  fit: "boxy",
  details: ["cropped"],
  brandEvidence: null,
  confidence: 0.91,
  searchQuery: "brown canvas boxy work jacket",
};

test("accepts structured garment extraction", () => {
  const value = garmentExtractionSchema.parse({
    summary: "Layered workwear",
    garments: [validGarment],
  });
  assert.equal(value.garments[0].subtype, "work jacket");
});

test("rejects confidence outside the valid range", () => {
  assert.throws(() =>
    garmentExtractionSchema.parse({
      summary: "Layered workwear",
      garments: [{ ...validGarment, confidence: 2 }],
    }),
  );
});
