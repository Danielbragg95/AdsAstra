import { openDb } from "@signalwork/engine";
import { selectedBrandId } from "@/lib/brand";
import { IngestForm } from "@/components/IngestForm";

export const dynamic = "force-dynamic";

export default async function IngestPage() {
  const db = openDb();
  const brands = db.listBrands();
  const selected = await selectedBrandId(brands);
  db.close();
  const target = brands.find((b) => b.id === selected) ?? brands[0];

  return (
    <main>
      <h1 className="view-title">Ingest</h1>
      <p className="view-sub">
        Paste any video transcript — yours or a competitor&apos;s. It becomes a
        clean beat sheet in {target ? <strong>{target.name}</strong> : "your brand"}&apos;s
        voice, ready for the full Studio pipeline.
      </p>
      {target ? <IngestForm brandId={target.id} /> : (
        <div className="empty"><p>Create a brand first.</p></div>
      )}
    </main>
  );
}
