import { NextResponse } from "next/server";
import { openDb, runTrendRadar } from "@signalwork/engine";

export const runtime = "nodejs";
export const maxDuration = 120;

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { brandId } = await req.json().catch(() => ({}));
    const brands = brandId
      ? [db.getBrand(brandId)].filter((b) => b !== null)
      : db.listBrands();
    if (brands.length === 0) {
      return NextResponse.json({ error: "no brands to sweep" }, { status: 404 });
    }
    const results = [];
    for (const brand of brands) results.push(await runTrendRadar(db, brand!));
    return NextResponse.json({ results });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "radar failed" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
