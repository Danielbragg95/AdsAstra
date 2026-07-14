import { NextResponse } from "next/server";
import { openDb, repurposeScript } from "@signalwork/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { scriptId, kinds } = await req.json();
    const item = scriptId ? db.getContent(scriptId) : null;
    if (!item || item.kind !== "script") {
      return NextResponse.json({ error: "script not found" }, { status: 404 });
    }
    const brand = db.getBrand(item.brand_id);
    if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });
    const results = await repurposeScript(db, brand, item, kinds);
    const failed = results.filter((r) => !r.ok);
    return NextResponse.json(
      { results },
      { status: failed.length === results.length ? 500 : 200 },
    );
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "repurpose failed" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
