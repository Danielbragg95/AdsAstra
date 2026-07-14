import Link from "next/link";
import { openDb } from "@signalwork/engine";
import { selectedBrandId } from "@/lib/brand";
import { SyncButton } from "@/components/SyncButton";

export const dynamic = "force-dynamic";

const KIND_LABEL: Record<string, string> = {
  x_thread: "X thread",
  li_post: "LinkedIn",
  ig_caption: "Instagram",
  tt_caption: "TikTok",
};

export default async function PulsePage() {
  const db = openDb();
  const brands = db.listBrands();
  const selected = await selectedBrandId(brands);
  const items = db
    .listContent(selected ? { brandId: selected } : {})
    .filter((c) => c.performance);
  const briefs = new Map(db.listBriefs(selected ?? undefined).map((b) => [b.id, b]));
  db.close();

  const measured = items.sort(
    (a, b) => b.performance!.engagement_rate - a.performance!.engagement_rate,
  );
  const maxEng = Math.max(0.0001, ...measured.map((m) => m.performance!.engagement_rate));

  return (
    <main>
      <h1 className="view-title">Pulse</h1>
      <p className="view-sub">
        {measured.length} measured posts <SyncButton brandId={selected} />
      </p>

      {measured.length === 0 ? (
        <div className="empty">
          <p>No performance data yet.</p>
          <p style={{ marginTop: 8 }}>
            Schedule posts from a script&apos;s Studio, then hit <code>Sync metrics</code>.
          </p>
        </div>
      ) : (
        measured.map((i) => {
          const m = i.performance!;
          return (
            <div className="pulse-row" key={i.id}>
              <div className="pulse-meta">
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
              </div>
              <div className="pulse-bar-wrap">
                <div className="ph-track">
                  <div
                    className="ph-fill"
                    style={{ width: `${Math.round((m.engagement_rate / maxEng) * 100)}%` }}
                  />
                </div>
              </div>
              <div className="pulse-nums">
                <span>{m.impressions.toLocaleString()} impr</span>
                <span className="pulse-eng">{(m.engagement_rate * 100).toFixed(1)}%</span>
              </div>
            </div>
          );
        })
      )}
    </main>
  );
}
