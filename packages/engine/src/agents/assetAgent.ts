import { llm, extractJson } from "../llm/client.ts";
import {
  CarouselSchema,
  HookCardSlots,
  renderCarousel,
  renderTemplate,
  type RenderedAsset,
  type SizeKey,
} from "../assets/render.ts";
import { ScriptSchema, type BrandRow, type ContentItemRow } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

function assetWriterSystem(brand: BrandRow, mode: "carousel" | "cover"): string {
  const shape =
    mode === "carousel"
      ? `{"brand": string, "slides": [{"kicker": string, "headline": string, "body": string}]}  (4-7 slides)`
      : `{"headline": string, "subhead": string, "brand": string}`;
  return `You are an ASSET WRITER [${mode}] turning a video script into on-image copy.

BRAND: ${brand.name}
POSITIONING: ${brand.positioning}

Return ONLY valid JSON: ${shape}

Rules:
- headline <= 8 words, punchy, no punctuation theatrics.
- body <= 30 words, one idea, plain language.
- Slide 1 hooks; final slide is the takeaway/CTA.
- kicker: 1-3 word category label, uppercase-friendly.
- No hashtags, no emoji.`;
}

export async function generateCarouselAssets(
  db: EngineDb,
  brand: BrandRow,
  scriptItem: ContentItemRow,
  size: SizeKey = "square",
): Promise<{ contentId: string; assets: RenderedAsset[] }> {
  const script = ScriptSchema.parse(scriptItem.body);
  const reply = await llm({
    system: assetWriterSystem(brand, "carousel"),
    user: JSON.stringify({
      title: script.title_options[0],
      hook: script.hook,
      beats: script.beats.map((b) => ({ heading: b.heading, vo_text: b.vo_text })),
      cta: script.cta,
    }),
  });
  const spec = CarouselSchema.parse(extractJson(reply));
  spec.brand ||= brand.name;

  const assets = await renderCarousel(spec, size);
  const contentId = db.insertContent(
    brand.id,
    scriptItem.brief_id,
    "carousel",
    "instagram",
    { spec, files: assets.map((a) => a.file), size },
    scriptItem.id,
  );
  return { contentId, assets };
}

export async function generateCoverAsset(
  db: EngineDb,
  brand: BrandRow,
  scriptItem: ContentItemRow,
  size: SizeKey = "wide",
): Promise<{ contentId: string; asset: RenderedAsset }> {
  const script = ScriptSchema.parse(scriptItem.body);
  const reply = await llm({
    system: assetWriterSystem(brand, "cover"),
    user: JSON.stringify({ title: script.title_options[0], hook: script.hook }),
  });
  const slots = HookCardSlots.parse(extractJson(reply));
  slots.brand ||= brand.name;

  const asset = await renderTemplate("hook_card", slots, size);
  const contentId = db.insertContent(
    brand.id,
    scriptItem.brief_id,
    "cover",
    scriptItem.platform,
    { slots, files: [asset.file], size },
    scriptItem.id,
  );
  return { contentId, asset };
}
