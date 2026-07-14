import { NextResponse } from "next/server";
import { openDb, calibrationVariants } from "@signalwork/engine";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { brandId } = await req.json();
    const brand = brandId ? db.getBrand(brandId) : null;
    if (!brand) return NextResponse.json({ error: "brand not found" }, { status: 404 });
    const variants = await calibrationVariants(brand);
    return NextResponse.json({ variants });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "calibration failed" },
      { status: 500 },
    );
  } finally {
    db.close();
  }
}
