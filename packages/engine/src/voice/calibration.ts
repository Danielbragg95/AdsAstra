import { llm } from "../llm/client.ts";
import { VoiceProfileSchema, type BrandRow, type VoiceProfile } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

export interface CalibrationVariant {
  key: "A" | "B" | "C";
  /** what this variant changes — revealed only AFTER the user picks */
  description: string;
  profile: VoiceProfile;
  sample: string;
}

function clamp01(n: number) {
  return Math.max(0, Math.min(1, n));
}

function shiftAxes(v: VoiceProfile, deltas: Record<string, number>): VoiceProfile {
  const tone_axes = { ...v.tone_axes };
  for (const [k, d] of Object.entries(deltas)) {
    tone_axes[k] = clamp01((tone_axes[k] ?? 0.5) + d);
  }
  return { ...v, tone_axes };
}

function variantProfiles(current: VoiceProfile): Omit<CalibrationVariant, "sample">[] {
  return [
    { key: "A", description: "current voice, unchanged", profile: current },
    {
      key: "B",
      description: "punchier: bolder claims, shorter sentences",
      profile: {
        ...shiftAxes(current, { bold_measured: 0.2, formal_casual: 0.1 }),
        sentence_rhythm: "Short. Punchy. One long sentence per section, max. Fragments welcome.",
      },
    },
    {
      key: "C",
      description: "warmer: more playful, more direct address",
      profile: {
        ...shiftAxes(current, { playful_serious: 0.2 }),
        sentence_rhythm:
          (current.sentence_rhythm || "Varied.") + " Speak to 'you' directly; let warmth show.",
        signature_moves: [
          ...current.signature_moves,
          "address the reader as 'you' within the first two sentences",
        ].slice(0, 5),
      },
    },
  ];
}

function calibrationWriterSystem(brand: BrandRow, style: string, profile: VoiceProfile): string {
  return `You are a CALIBRATION WRITER [${style}]. Write ONE short paragraph
(60-90 words) introducing this brand to a new follower, in exactly this voice:

BRAND: ${brand.name}
POSITIONING: ${brand.positioning}

VOICE CARD:
${JSON.stringify(profile, null, 2)}

Return ONLY the paragraph, no preamble, no JSON.`;
}

/** Renders the same intro passage in 3 candidate voices. Blind by design:
 *  descriptions ship with the payload but the UI hides them until a pick. */
export async function calibrationVariants(brand: BrandRow): Promise<CalibrationVariant[]> {
  const variants = variantProfiles(brand.voice_profile);
  const out: CalibrationVariant[] = [];
  for (const v of variants) {
    const sample = (
      await llm({ system: calibrationWriterSystem(brand, v.key, v.profile), user: "write it" })
    ).trim();
    out.push({ ...v, sample });
  }
  return out;
}

/** Applies the chosen variant's profile to the brand. */
export function applyCalibration(
  db: EngineDb,
  brand: BrandRow,
  profile: unknown,
): VoiceProfile {
  const parsed = VoiceProfileSchema.parse(profile);
  db.updateBrandVoice(brand.id, parsed);
  return parsed;
}
