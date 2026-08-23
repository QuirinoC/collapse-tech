import { z } from "zod";

export const importRequestSchema = z.object({
  sourceUrl: z.url().max(500),
});

export const garmentSchema = z.object({
  category: z.string().min(1).max(60),
  subtype: z.string().min(1).max(100),
  colors: z.array(z.string().min(1).max(40)).min(1).max(5),
  materials: z.array(z.string().min(1).max(60)).max(5).default([]),
  pattern: z.string().min(1).max(80),
  fit: z.string().min(1).max(80),
  details: z.array(z.string().min(1).max(100)).max(8).default([]),
  brandEvidence: z.string().max(160).nullable(),
  confidence: z.number().min(0).max(1),
  searchQuery: z.string().min(3).max(220),
});

export const garmentExtractionSchema = z.object({
  summary: z.string().min(1).max(240),
  garments: z.array(garmentSchema).min(1).max(12),
});

export const garmentExtractionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "garments"],
  properties: {
    summary: { type: "string" },
    garments: {
      type: "array",
      minItems: 1,
      maxItems: 12,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "category",
          "subtype",
          "colors",
          "materials",
          "pattern",
          "fit",
          "details",
          "brandEvidence",
          "confidence",
          "searchQuery",
        ],
        properties: {
          category: { type: "string" },
          subtype: { type: "string" },
          colors: { type: "array", items: { type: "string" } },
          materials: { type: "array", items: { type: "string" } },
          pattern: { type: "string" },
          fit: { type: "string" },
          details: { type: "array", items: { type: "string" } },
          brandEvidence: { type: ["string", "null"] },
          confidence: { type: "number", minimum: 0, maximum: 1 },
          searchQuery: { type: "string" },
        },
      },
    },
  },
};
