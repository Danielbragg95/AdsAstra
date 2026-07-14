import { NextResponse } from "next/server";
import { openDb } from "@signalwork/engine";

export const runtime = "nodejs";

export async function GET() {
  const db = openDb();
  try {
    return NextResponse.json({ briefs: db.listBriefs() });
  } finally {
    db.close();
  }
}

const ALLOWED = new Set(["new", "shortlisted", "used", "dismissed"]);

export async function PATCH(req: Request) {
  const db = openDb();
  try {
    const { briefId, status } = await req.json();
    if (!briefId || !ALLOWED.has(status)) {
      return NextResponse.json({ error: "briefId and valid status required" }, { status: 400 });
    }
    if (!db.getBrief(briefId)) {
      return NextResponse.json({ error: "brief not found" }, { status: 404 });
    }
    db.setBriefStatus(briefId, status);
    return NextResponse.json({ ok: true });
  } finally {
    db.close();
  }
}
