import type { BrandRow, VoiceProfile } from "../types.ts";

export const defaultVoice: VoiceProfile = {
  identity:
    "First-person builder documenting the journey. Confident, specific, never salesy.",
  audience: "Solo founders and indie hackers, technical-adjacent.",
  tone_axes: { formal_casual: 0.8, playful_serious: 0.6, bold_measured: 0.7 },
  sentence_rhythm:
    "Mostly short. Occasional long sentence for payoff. Fragments allowed.",
  vocabulary: {
    use: ["ship", "wire up", "the math on this", "here's the catch"],
    ban: [
      "delve",
      "game-changer",
      "in today's fast-paced world",
      "unlock",
      "leverage",
      "revolutionize",
      "seamlessly",
    ],
  },
  signature_moves: [
    "open with a specific number or moment, never a question",
    "one self-deprecating aside per piece, max",
  ],
  example_passages: [
    "Three weeks ago I had zero automation. Today an agent hands me five trend briefs before my coffee's done. The setup took one weekend and about forty dollars in API credits — here's exactly where the money went.",
  ],
};

export const demoBrandSeed: Omit<BrandRow, "id"> = {
  name: "Demo Brand — AI Content Ops",
  positioning:
    "We teach solo creators to run a one-person media company with AI agents: trend research, scripting, repurposing, and publishing without a team.",
  sources: {
    subreddits: ["SaaS", "NewTubers", "Entrepreneur", "artificial"],
    ytKeywords: ["ai content automation", "faceless youtube", "ai agents creator"],
    keywords: ["ai content engine", "faceless channel", "voice cloning"],
  },
  voice_profile: defaultVoice,
  postiz_integrations: {},
};
