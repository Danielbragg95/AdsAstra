"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function RunRadarButton({ brandId }: { brandId: string | null }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function run() {
    setBusy(true);
    try {
      await fetch("/api/radar", {
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
    <button className="act quiet radar-btn" onClick={run} disabled={busy}>
      {busy ? "Sweeping…" : "Run radar"}
    </button>
  );
}
