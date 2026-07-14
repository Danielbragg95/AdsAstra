import { NextResponse } from "next/server";
import { openDb, synthesizeScript } from "@signalwork/engine";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { scriptId } = await req.json();
    const item = scriptId ? db.getContent(scriptId) : null;
    if (!item || item.kind !== "script") {
      return NextResponse.json({ error: "script not found" }, { status: 404 });
    }
    const brand = db.getBrand(item.brand_id)!;
    const { contentId, result } = await synthesizeScript(db, brand, item);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 502 });
    return NextResponse.json({
      contentId,
      provider: result.provider,
      segments: result.segments.length,
    });
  } finally {
    db.close();
  }
}
