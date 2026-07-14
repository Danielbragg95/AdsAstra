import { NextResponse } from "next/server";
import { openDb, generateScript } from "@signalwork/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { briefId } = await req.json();
    if (!briefId) {
      return NextResponse.json({ error: "briefId required" }, { status: 400 });
    }
    const brief = db.getBrief(briefId);
    if (!brief) {
      return NextResponse.json({ error: "brief not found" }, { status: 404 });
    }
    const brand = db.getBrand(brief.brand_id);
    if (!brand) {
      return NextResponse.json({ error: "brand not found" }, { status: 404 });
    }
    const { contentId } = await generateScript(db, brand, brief);
    return NextResponse.json({ contentId });
  } catch (e) {
    console.error(e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "generation failed" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
