import { z } from "zod";

/** A raw signal scraped from any platform before clustering. */
export const SignalSchema = z.object({
  platform: z.enum(["reddit", "youtube", "x", "tiktok", "trends", "web"]),
  title: z.string(),
  url: z.string(),
  /** engagement units native to the platform (upvotes, views, likes) */
  engagement: z.number().nonnegative(),
  /** comments/replies where available */
  discussion: z.number().nonnegative().default(0),
  ageHours: z.number().nonnegative(),
});
export type Signal = z.infer<typeof SignalSchema>;

/** A cluster of signals believed to be the same topic. */
export interface TopicCluster {
  label: string;
  signals: Signal[];
  platforms: string[];
  heat: number;
  stats: {
    mentionVelocity: number;
    engagementRate: number;
    crossPlatform: number;
    medianAgeHours: number;
  };
}

export const VoiceProfileSchema = z.object({
  identity: z.string(),
  audience: z.string(),
  tone_axes: z.record(z.number().min(0).max(1)).default({}),
  sentence_rhythm: z.string().default("Mostly short. Vary length. Fragments allowed."),
  vocabulary: z
    .object({
      use: z.array(z.string()).default([]),
      ban: z.array(z.string()).default([]),
    })
    .default({ use: [], ban: [] }),
  signature_moves: z.array(z.string()).default([]),
  example_passages: z.array(z.string()).default([]),
});
export type VoiceProfile = z.infer<typeof VoiceProfileSchema>;

export const AngleSchema = z.object({
  angle: z.string(),
  why_it_fits: z.string(),
});

export const BriefSchema = z.object({
  topic: z.string(),
  summary: z.string(),
  why_rising: z.string(),
  angles: z.array(AngleSchema).min(1).max(5),
  recommended_platform: z.string(),
  recommended_format: z.string(),
  freshness: z.enum(["act_within_24h", "this_week", "evergreen"]),
});
export type Brief = z.infer<typeof BriefSchema>;
export const BriefListSchema = z.object({ briefs: z.array(BriefSchema) });

export const ScriptBeatSchema = z.object({
  heading: z.string(),
  vo_text: z.string(),
  broll_suggestion: z.string(),
});

export const ScriptSchema = z.object({
  title_options: z.array(z.string()).min(1),
  hook: z.string(),
  beats: z.array(ScriptBeatSchema).min(2),
  cta: z.string(),
  estimated_runtime_sec: z.number().positive(),
  shorts_cutdowns: z
    .array(z.object({ hook: z.string(), vo_text: z.string() }))
    .default([]),
});
export type Script = z.infer<typeof ScriptSchema>;

export interface BrandRow {
  id: string;
  name: string;
  positioning: string;
  sources: {
    subreddits: string[];
    ytKeywords: string[];
    keywords: string[];
  };
  voice_profile: VoiceProfile;
  /** platform -> Postiz integration id for THIS brand's social account
   *  (e.g. {"x": "int_abc", "instagram": "int_def"}) */
  postiz_integrations: Record<string, string>;
}

export const BrandInputSchema = z.object({
  name: z.string().min(2).max(80),
  positioning: z.string().min(10).max(2000),
  sources: z.object({
    subreddits: z.array(z.string()).default([]),
    ytKeywords: z.array(z.string()).default([]),
    keywords: z.array(z.string()).default([]),
  }),
  voice_profile: VoiceProfileSchema,
  postiz_integrations: z.record(z.string()).default({}),
});
export type BrandInput = z.infer<typeof BrandInputSchema>;

export interface BriefRow extends Brief {
  id: string;
  brand_id: string;
  heat_score: number;
  platform_heat: Record<string, number>;
  sources: { title: string; url: string; platform: string }[];
  status: "new" | "shortlisted" | "used" | "dismissed";
  created_at: string;
}

export interface ContentItemRow {
  id: string;
  brand_id: string;
  brief_id: string | null;
  parent_id: string | null;
  kind: string;
  platform: string;
  body: unknown;
  status: "draft" | "approved" | "scheduled" | "published";
  scheduled_for: string | null;
  postiz_post_id: string | null;
  performance: Record<string, number> | null;
  performance_synced_at: string | null;
  created_at: string;
}

// ---- repurposed post shapes (one schema per platform kind) ----------------

export const XThreadSchema = z.object({
  tweets: z.array(z.string().min(1)).min(2).max(12),
});
export const LinkedInPostSchema = z.object({
  post: z.string().min(1),
});
export const IgCaptionSchema = z.object({
  caption: z.string().min(1),
  hashtags: z.array(z.string()).max(8).default([]),
});
export const TikTokCaptionSchema = z.object({
  caption: z.string().min(1),
  on_screen_hook: z.string().min(1),
});

export const POST_KINDS = {
  x_thread: { platform: "x", label: "X thread", schema: XThreadSchema },
  li_post: { platform: "linkedin", label: "LinkedIn post", schema: LinkedInPostSchema },
  ig_caption: { platform: "instagram", label: "IG caption", schema: IgCaptionSchema },
  tt_caption: { platform: "tiktok", label: "TikTok caption", schema: TikTokCaptionSchema },
} as const;
export type PostKind = keyof typeof POST_KINDS;
