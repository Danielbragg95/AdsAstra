import { NextResponse } from "next/server";
import { openDb, syncPerformance } from "@signalwork/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const db = openDb();
  try {
    const { brandId } = await req.json().catch(() => ({}));
    const result = await syncPerformance(db, brandId ?? undefined);
    return NextResponse.json(result);
  } finally {
    db.close();
  }
}
