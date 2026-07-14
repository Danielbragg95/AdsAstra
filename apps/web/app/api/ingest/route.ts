import { NextResponse } from "next/server";
import { openDb, ingestTranscript } from "@signalwork/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { brandId, title, transcript } = await req.json();
    const brand = brandId ? db.getBrand(brandId) : db.listBrands()[0];
    if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });
    const { contentId } = await ingestTranscript(db, brand, { title, transcript });
    return NextResponse.json({ contentId });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "ingestion failed";
    const status = /too short|too long/.test(msg) ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  } finally {
    db.close();
  }
}
