"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SyncButton({ brandId }: { brandId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function sync() {
    setBusy(true);
    try {
      await fetch("/api/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brandId ? { brandId } : {}),
      });
      router.refresh();
    } finally {
      setBusy(false);
    }
  }

  return (
    <button className="act quiet radar-btn" onClick={sync} disabled={busy}>
      {busy ? "Syncing…" : "Sync metrics"}
    </button>
  );
}
