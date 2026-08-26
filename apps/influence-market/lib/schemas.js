import { z } from "zod";
import {
  MIN_CAMPAIGN_BUDGET_CENTS,
  MAX_CAMPAIGN_BUDGET_CENTS,
} from "./money.js";

export const PLATFORMS = [
  "instagram",
  "tiktok",
  "youtube",
  "facebook",
  "x",
  "twitch",
];

export const NICHES = [
  "fitness",
  "beauty",
  "fashion",
  "food",
  "travel",
  "gaming",
  "tech",
  "finance",
  "lifestyle",
  "education",
  "music",
  "sports",
  "automotive",
  "home",
  "pets",
];

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10).max(200),
  role: z.enum(["brand", "creator"]),
  name: z.string().min(2).max(120),
  company: z.string().max(160).optional(),
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export const channelSchema = z.object({
  platform: z.enum(PLATFORMS),
  handle: z.string().min(1).max(80),
  followers: z.number().int().min(0).max(500000000),
  topics: z.array(z.enum(NICHES)).min(1).max(5),
});

export const profileSchema = z.object({
  bio: z.string().max(600).optional(),
  niches: z.array(z.enum(NICHES)).max(6).optional(),
  channels: z.array(channelSchema).max(8).optional(),
  minBudgetCents: z.number().int().min(0).optional(),
});

export const campaignSchema = z.object({
  title: z.string().min(4).max(120),
  brandName: z.string().min(2).max(80),
  brief: z.string().min(30).max(4000),
  productInfo: z.string().max(1500).optional(),
  platforms: z.array(z.enum(PLATFORMS)).min(1),
  niches: z.array(z.enum(NICHES)).min(1).max(4),
  demographics: z.string().max(300).optional(),
  followerMin: z.number().int().min(0).optional(),
  followerMax: z.number().int().min(0).optional(),
  slots: z.number().int().min(1).max(50),
  budgetCents: z
    .number()
    .int()
    .min(MIN_CAMPAIGN_BUDGET_CENTS)
    .max(MAX_CAMPAIGN_BUDGET_CENTS),
});

export const applicationSchema = z.object({
  pitch: z.string().min(20).max(1200),
});

export const applicationDecisionSchema = z.object({
  applicationId: z.string().uuid(),
  decision: z.enum(["accept", "decline"]),
});

export const submissionSchema = z.object({
  contentUrl: z.string().url().max(500),
});

export const reviewSchema = z.object({
  decision: z.enum(["approve", "reject"]),
});

export const contactSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  kind: z.enum(["brand", "creator", "other"]),
  message: z.string().min(10).max(4000),
});

export function firstIssue(error) {
  const issue = error?.issues?.[0];
  if (!issue) return "Invalid request.";
  const path = issue.path?.length ? `${issue.path.join(".")}: ` : "";
  return `${path}${issue.message}`;
}
