import { NextResponse } from "next/server";
import { openDb, generateCarouselAssets, generateCoverAsset } from "@signalwork/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { scriptId, mode } = await req.json();
    const item = scriptId ? db.getContent(scriptId) : null;
    if (!item || item.kind !== "script") {
      return NextResponse.json({ error: "script not found" }, { status: 404 });
    }
    const brand = db.getBrand(item.brand_id)!;
    if (mode === "cover") {
      const { contentId, asset } = await generateCoverAsset(db, brand, item);
      return NextResponse.json({ contentId, files: [asset.file] });
    }
    const { contentId, assets } = await generateCarouselAssets(db, brand, item);
    return NextResponse.json({ contentId, files: assets.map((a) => a.file) });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "asset generation failed" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
