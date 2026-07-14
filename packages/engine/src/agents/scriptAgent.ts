import { llm, extractJson } from "../llm/client.ts";
import { scriptWriterSystem, voiceEditorSystem, FORMATS } from "../prompts/index.ts";
import { ScriptSchema, type BrandRow, type BriefRow, type Script } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

/**
 * Two-pass generation:
 *  1. Draft against a retention format template.
 *  2. Voice edit against the brand's voice card (separate call — this is
 *     what removes the AI smell; drafting and voice-matching in one call
 *     reliably underperforms).
 */
export async function generateScript(
  db: EngineDb,
  brand: BrandRow,
  brief: BriefRow,
  format: keyof typeof FORMATS = "explainer",
): Promise<{ contentId: string; script: Script }> {
  const draftReply = await llm({
    system: scriptWriterSystem(brand, FORMATS[format]),
    user: JSON.stringify({
      topic: brief.topic,
      summary: brief.summary,
      why_rising: brief.why_rising,
      angles: brief.angles,
      recommended_platform: brief.recommended_platform,
    }),
  });
  const draft = ScriptSchema.parse(extractJson(draftReply));

  const voicedReply = await llm({
    system: voiceEditorSystem(brand.voice_profile),
    user: JSON.stringify(draft),
  });
  const script = ScriptSchema.parse(extractJson(voicedReply));

  const contentId = db.insertContent(
    brand.id,
    brief.id,
    "script",
    brief.recommended_platform,
    script,
  );
  db.setBriefStatus(brief.id, "used");

  return { contentId, script };
}
