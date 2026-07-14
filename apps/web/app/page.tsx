import { openDb } from "@signalwork/engine";
import { BriefCard } from "@/components/BriefCard";
import { RunRadarButton } from "@/components/RunRadarButton";
import { selectedBrandId } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function RadarPage() {
  const db = openDb();
  const brands = db.listBrands();
  const selected = await selectedBrandId(brands);
  const briefs = db
    .listBriefs(selected ?? undefined)
    .filter((b) => b.status !== "dismissed");
  db.close();

  const brandNames = new Map(brands.map((b) => [b.id, b.name]));
  const scopeLabel = selected ? brandNames.get(selected) : `all ${brands.length} brands`;

  return (
    <main>
      <h1 className="view-title">Radar</h1>
      <p className="view-sub">
        {briefs.length} live trend briefs · {scopeLabel}{" "}
        <RunRadarButton brandId={selected} />
      </p>

      {briefs.length === 0 ? (
        <div className="empty">
          <p>No briefs yet.</p>
          <p style={{ marginTop: 8 }}>
            Run <code>npm run seed</code> in the repo root, then refresh.
          </p>
        </div>
      ) : (
        <div className="brief-list">
          {briefs.map((b) => (
            <BriefCard
              key={b.id}
              brief={b}
              brandName={selected ? undefined : brandNames.get(b.brand_id)}
            />
          ))}
        </div>
      )}
    </main>
  );
}
