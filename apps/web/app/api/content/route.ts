import { NextResponse } from "next/server";
import { openDb, approveContent, scheduleContent } from "@signalwork/engine";

export const runtime = "nodejs";

export async function PATCH(req: Request) {
  const db = openDb();
  try {
    const { contentId, action, when } = await req.json();
    const item = contentId ? db.getContent(contentId) : null;
    if (!item) return NextResponse.json({ error: "content not found" }, { status: 404 });

    if (action === "approve") {
      approveContent(db, item);
      return NextResponse.json({ ok: true, status: "approved" });
    }
    if (action === "schedule") {
      const date = when ? new Date(when) : new Date(Date.now() + 3600e3);
      const res = await scheduleContent(db, item, date);
      if (!res.ok) return NextResponse.json({ error: res.error }, { status: 400 });
      return NextResponse.json({ ok: true, status: "scheduled", postizPostId: res.postizPostId, mode: res.mode });
    }
    return NextResponse.json({ error: "unknown action" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "update failed" },
      { status: 400 },
    );
  } finally {
    db.close();
  }
}
