import { openDb } from "@signalwork/engine";
import { VoiceEditor } from "@/components/VoiceEditor";
import { CalibratePanel } from "@/components/CalibratePanel";
import { selectedBrandId } from "@/lib/brand";

export const dynamic = "force-dynamic";

export default async function VoicesPage() {
  const db = openDb();
  const all = db.listBrands();
  const selected = await selectedBrandId(all);
  const brands = selected ? all.filter((b) => b.id === selected) : all;
  db.close();

  return (
    <main>
      <h1 className="view-title">Voices</h1>
      <p className="view-sub">
        The voice card conditions every script and post. Edit it here; changes
        apply to the next generation.
      </p>
      {brands.length === 0 ? (
        <div className="empty">
          <p>No brands yet. Run <code>npm run seed</code>.</p>
        </div>
      ) : (
        brands.map((b) => (
          <div key={b.id}>
            <VoiceEditor brand={b} />
            <CalibratePanel brandId={b.id} />
          </div>
        ))
      )}
    </main>
  );
}
