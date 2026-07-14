import { llm, extractJson } from "../llm/client.ts";
import { voiceEditorSystem } from "../prompts/index.ts";
import { ScriptSchema, type BrandRow, type Script } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

function transcriptAnalystSystem(brand: BrandRow): string {
  return `You are a TRANSCRIPT ANALYST. You turn a raw video transcript into a
clean, retention-structured beat sheet the brand can repurpose.

BRAND: ${brand.name}
POSITIONING: ${brand.positioning}

Rules:
- Extract the REAL claims and structure of the transcript; add nothing new.
- Rewrite for clarity; drop filler, sponsor reads, and tangents.
- 3-6 beats, each with the transcript's supporting point in vo_text.
- broll_suggestion: what visual would support each beat.

Return ONLY valid JSON matching:
{"title_options": [string x3],
 "hook": string,
 "beats": [{"heading": string, "vo_text": string, "broll_suggestion": string}],
 "cta": string,
 "estimated_runtime_sec": number,
 "shorts_cutdowns": [{"hook": string, "vo_text": string}]}`;
}

export interface IngestInput {
  title?: string;
  transcript: string;
}

/**
 * Paste-a-transcript path: any video (yours or a competitor's) becomes a
 * structured script content item, which unlocks the whole existing pipeline —
 * repurposing, assets, voiceover — with zero new UI surface.
 */
export async function ingestTranscript(
  db: EngineDb,
  brand: BrandRow,
  input: IngestInput,
): Promise<{ contentId: string; script: Script }> {
  const transcript = input.transcript.trim();
  if (transcript.length < 200) {
    throw new Error("transcript too short — paste at least a few paragraphs");
  }
  if (transcript.length > 120_000) {
    throw new Error("transcript too long — split it or trim to the segment you care about");
  }

  const draftReply = await llm({
    system: transcriptAnalystSystem(brand),
    user: JSON.stringify({ title: input.title ?? "", transcript }),
    maxTokens: 6000,
  });
  const draft = ScriptSchema.parse(extractJson(draftReply));

  const voicedReply = await llm({
    system: voiceEditorSystem(brand.voice_profile),
    user: JSON.stringify(draft),
  });
  const script = ScriptSchema.parse(extractJson(voicedReply));

  const contentId = db.insertContent(brand.id, null, "script", "youtube", script);
  return { contentId, script };
}
