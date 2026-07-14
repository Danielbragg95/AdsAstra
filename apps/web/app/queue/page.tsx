import Link from "next/link";
import { openDb } from "@signalwork/engine";
import { selectedBrandId } from "@/lib/brand";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  x_thread: "X thread",
  li_post: "LinkedIn",
  ig_caption: "Instagram",
  tt_caption: "TikTok",
};

export default async function QueuePage() {
  const db = openDb();
  const selected = await selectedBrandId(db.listBrands());
  const items = db
    .listContent(selected ? { brandId: selected } : {})
    .filter((c) => c.status === "approved" || c.status === "scheduled" || c.status === "published");
  const briefs = new Map(db.listBriefs().map((b) => [b.id, b]));
  db.close();

  const scheduled = items
    .filter((i) => i.status === "scheduled")
    .sort((a, b) => (a.scheduled_for ?? "").localeCompare(b.scheduled_for ?? ""));
  const approved = items.filter((i) => i.status === "approved");

  return (
    <main>
      <h1 className="view-title">Queue</h1>
      <p className="view-sub">
        {scheduled.length} scheduled · {approved.length} approved and waiting
      </p>

      {items.length === 0 && (
        <div className="empty">
          <p>Nothing queued. Approve posts from a script&apos;s Studio.</p>
        </div>
      )}

      {scheduled.map((i) => (
        <div className="queue-row" key={i.id}>
          <span className="queue-time">
            {i.scheduled_for ? new Date(i.scheduled_for).toLocaleString() : "—"}
          </span>
          <span className="tag">{KIND_LABEL[i.kind] ?? i.kind}</span>
          <span className="queue-topic">
            {i.parent_id ? (
              <Link href={`/scripts/${i.parent_id}`}>
                {briefs.get(i.brief_id ?? "")?.topic ?? i.platform}
              </Link>
            ) : (
              briefs.get(i.brief_id ?? "")?.topic ?? i.platform
            )}
          </span>
          <span className="status status-scheduled">scheduled</span>
        </div>
      ))}

      {approved.map((i) => (
        <div className="queue-row" key={i.id}>
          <span className="queue-time">—</span>
          <span className="tag">{KIND_LABEL[i.kind] ?? i.kind}</span>
          <span className="queue-topic">
            {i.parent_id ? (
              <Link href={`/scripts/${i.parent_id}`}>
                {briefs.get(i.brief_id ?? "")?.topic ?? i.platform}
              </Link>
            ) : (
              briefs.get(i.brief_id ?? "")?.topic ?? i.platform
            )}
          </span>
          <span className="status status-approved">approved</span>
        </div>
      ))}
    </main>
  );
}
