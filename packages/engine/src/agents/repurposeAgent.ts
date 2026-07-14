import { llm, extractJson } from "../llm/client.ts";
import { platformWriterSystem } from "../prompts/platforms.ts";
import { voiceEditorSystem } from "../prompts/index.ts";
import {
  POST_KINDS,
  ScriptSchema,
  type BrandRow,
  type ContentItemRow,
  type PostKind,
} from "../types.ts";
import type { EngineDb } from "../db/index.ts";

export interface RepurposeResult {
  kind: PostKind;
  contentId: string;
  ok: boolean;
  error?: string;
}

/**
 * Fans one script out into platform-native posts. Each platform is a separate
 * call (regenerating one never touches the others), followed by the same
 * voice-edit pass scripts get. Failures are per-platform, never total.
 */
export async function repurposeScript(
  db: EngineDb,
  brand: BrandRow,
  scriptItem: ContentItemRow,
  kinds: PostKind[] = Object.keys(POST_KINDS) as PostKind[],
): Promise<RepurposeResult[]> {
  const script = ScriptSchema.parse(scriptItem.body);
  const source = JSON.stringify({
    title: script.title_options[0],
    hook: script.hook,
    beats: script.beats.map((b) => ({ heading: b.heading, vo_text: b.vo_text })),
    cta: script.cta,
  });

  const results: RepurposeResult[] = [];
  for (const kind of kinds) {
    try {
      const def = POST_KINDS[kind];

      const draftReply = await llm({
        system: platformWriterSystem(brand, kind),
        user: source,
      });
      const draft = def.schema.parse(extractJson(draftReply));

      const voicedReply = await llm({
        system: voiceEditorSystem(brand.voice_profile),
        user: JSON.stringify(draft),
      });
      const post = def.schema.parse(extractJson(voicedReply));

      const contentId = db.insertContent(
        brand.id,
        scriptItem.brief_id,
        kind,
        def.platform,
        post,
        scriptItem.id,
      );
      results.push({ kind, contentId, ok: true });
    } catch (e) {
      results.push({
        kind,
        contentId: "",
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  return results;
}

/** Renders a post body to the plain text Postiz/social APIs expect. */
export function renderPostBody(kind: string, body: any): string {
  switch (kind) {
    case "x_thread":
      return (body.tweets as string[]).join("\n\n---\n\n");
    case "li_post":
      return body.post;
    case "ig_caption":
      return [body.caption, (body.hashtags as string[]).map((h) => `#${h.replace(/^#/, "")}`).join(" ")]
        .filter(Boolean)
        .join("\n\n");
    case "tt_caption":
      return body.caption;
    default:
      return typeof body === "string" ? body : JSON.stringify(body);
  }
}
