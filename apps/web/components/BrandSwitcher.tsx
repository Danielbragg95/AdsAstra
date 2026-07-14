"use client";

import { useRouter } from "next/navigation";
import type { BrandRow } from "@signalwork/engine";

export function BrandSwitcher({
  brands,
  selected,
}: {
  brands: Pick<BrandRow, "id" | "name">[];
  selected: string | null;
}) {
  const router = useRouter();

  function choose(id: string) {
    document.cookie = `sw_brand=${id}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  }

  return (
    <select
      className="brand-switcher"
      value={selected ?? "all"}
      onChange={(e) => choose(e.target.value)}
      aria-label="Active brand"
    >
      <option value="all">All brands</option>
      {brands.map((b) => (
        <option key={b.id} value={b.id}>
          {b.name}
        </option>
      ))}
    </select>
  );
}
