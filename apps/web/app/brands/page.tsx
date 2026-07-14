import { openDb } from "@signalwork/engine";
import { BrandForm } from "@/components/BrandForm";

export const dynamic = "force-dynamic";

export default function BrandsPage() {
  const db = openDb();
  const brands = db.listBrands();
  db.close();

  return (
    <main>
      <h1 className="view-title">Brands</h1>
      <p className="view-sub">
        Each brand has its own positioning, trend sources, voice, and social
        accounts. The radar sweeps every active brand separately.
      </p>
      {brands.map((b) => (
        <BrandForm key={b.id} brand={b} />
      ))}
      <BrandForm />
    </main>
  );
}
