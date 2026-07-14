import { cookies } from "next/headers";
import type { BrandRow } from "@signalwork/engine";

export const BRAND_COOKIE = "sw_brand";

/** Returns the selected brand id from the cookie, or null for "all brands".
 *  Falls back to null if the cookie points at a brand that no longer exists. */
export async function selectedBrandId(brands: BrandRow[]): Promise<string | null> {
  const jar = await cookies();
  const id = jar.get(BRAND_COOKIE)?.value ?? null;
  if (!id || id === "all") return null;
  return brands.some((b) => b.id === id) ? id : null;
}
