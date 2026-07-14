import type { BrandRow, Brief, VoiceProfile } from "../types.ts";
import type { TopicCluster } from "../types.ts";

export function briefWriterSystem(brand: BrandRow): string {
  return `You are a TREND ANALYST for a content brand.

BRAND: ${brand.name}
POSITIONING: ${brand.positioning}

You receive topic clusters with heat statistics gathered from social platforms.
For the strongest clusters (max 6), write trend briefs SPECIFIC to this brand.

Return ONLY valid JSON matching:
{"briefs": [{
  "topic": string,                 // short, plain-language topic name
  "summary": string,               // 1-2 sentences, what is happening
  "why_rising": string,            // 1 sentence, the mechanism behind the rise
  "angles": [{"angle": string, "why_it_fits": string}],  // 3 angles FOR THIS BRAND
  "recommended_platform": string,  // where the heat is + where the brand can win
  "recommended_format": string,    // e.g. "long-form explainer", "short", "text thread", "carousel"
  "freshness": "act_within_24h" | "this_week" | "evergreen"
}]}

Rules: no hashtag ideas, no generic angles that would fit any brand,
skip clusters that are noise or off-positioning.`;
}

export function briefWriterUser(clusters: TopicCluster[]): string {
  // strip raw signals down to what the model needs
  return JSON.stringify(
    clusters.map((c) => ({
      label: c.label,
      platforms: c.platforms,
      heat: c.heat,
      stats: c.stats,
      top_titles: c.signals
        .slice(0, 5)
        .map((s) => ({ platform: s.platform, title: s.title })),
    })),
  );
}

export function scriptWriterSystem(brand: BrandRow, formatTemplate: string): string {
  return `You are a SCRIPT WRITER for retention-optimized video.

BRAND: ${brand.name}
POSITIONING: ${brand.positioning}

FORMAT TEMPLATE (follow the structure, not the words):
${formatTemplate}

You receive a trend brief. Write a complete script using the brief's FIRST angle
unless another clearly fits the brand better.

Return ONLY valid JSON matching:
{"title_options": [string x3],
 "hook": string,                       // first 15 seconds, spoken text
 "beats": [{"heading": string, "vo_text": string, "broll_suggestion": string}],
 "cta": string,
 "estimated_runtime_sec": number,
 "shorts_cutdowns": [{"hook": string, "vo_text": string}]}

Write vo_text for the EAR: contractions, short sentences, spoken rhythm.`;
}

export function voiceEditorSystem(voice: VoiceProfile): string {
  return `You are a ruthless VOICE EDITOR. You rewrite scripts to match a voice
card exactly. You never add new factual claims. You keep the JSON structure
identical and only rewrite the text values.

VOICE CARD:
${JSON.stringify(voice, null, 2)}

Hard rules:
- Remove every banned phrase; prefer words from the "use" list where natural.
- Follow sentence_rhythm. Vary sentence length. Read it aloud in your head.
- Apply signature_moves where they fit; never force all of them.
- Return ONLY the rewritten JSON, same schema as the input.`;
}

export const FORMATS: Record<string, string> = {
  explainer: `1. COLD-OPEN HOOK: answer "why should I keep watching" in 15s, open a loop.
2. STAKES: what the viewer gains or avoids.
3. 3-5 BEATS: each with a mini-payoff; place one open loop before the midpoint.
4. PAYOFF: close the loop opened in the hook.
5. CTA: one ask, matched to the platform.`,
  listicle: `1. HOOK: promise N concrete items, tease the best one ("number 4 changed how I work").
2. ITEMS: strongest first and last; each item = claim, proof, takeaway.
3. CTA: one ask.`,
  hot_take: `1. HOOK: state the contrarian claim in one sentence.
2. STEELMAN: the common view, fairly.
3. TURN: why it breaks, with evidence.
4. IMPLICATION: what to do differently.
5. CTA: invite disagreement.`,
};
