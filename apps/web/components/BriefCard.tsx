"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BriefRow } from "@signalwork/engine";

const FRESHNESS_LABEL: Record<string, string> = {
  act_within_24h: "act within 24h",
  this_week: "this week",
  evergreen: "evergreen",
};

export function BriefCard({ brief, brandName }: { brief: BriefRow; brandName?: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/scripts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ briefId: brief.id }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "generation failed");
      router.push(`/scripts/${json.contentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "generation failed");
      setBusy(false);
    }
  }

  async function dismiss() {
    setDismissed(true);
    await fetch(`/api/briefs`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ briefId: brief.id, status: "dismissed" }),
    });
    router.refresh();
  }

  const heatPct = Math.round(brief.heat_score * 100);
  const platforms = Object.entries(brief.platform_heat).sort((a, b) => b[1] - a[1]);

  return (
    <article className={`brief-card${dismissed ? " dismissed" : ""}`}>
      <div className="heat-dial" title={`heat ${brief.heat_score}`}>
        <span className={`heat-num${brief.heat_score >= 0.7 ? " hot" : ""}`}>
          {heatPct}
        </span>
        <div className="heat-track">
          <div className="heat-fill" style={{ height: `${heatPct}%` }} />
        </div>
      </div>

      <div>
        <h2 className="brief-topic">{brief.topic}</h2>
        <p className="brief-summary">{brief.summary}</p>

        <div className="brief-tags">
          {brandName && <span className="tag brand-tag">{brandName}</span>}
          <span className="tag">→ {brief.recommended_platform}</span>
          {brief.recommended_format && <span className="tag">{brief.recommended_format}</span>}
          <span className={`tag${brief.freshness === "act_within_24h" ? " fresh" : ""}`}>
            {FRESHNESS_LABEL[brief.freshness] ?? brief.freshness}
          </span>
          {brief.status === "used" && <span className="tag">scripted</span>}
        </div>

        {platforms.length > 0 && (
          <div className="platform-heat">
            {platforms.map(([name, share]) => (
              <div className="ph-row" key={name}>
                <span className="ph-name">{name}</span>
                <div className="ph-track">
                  <div className="ph-fill" style={{ width: `${Math.round(share * 100)}%` }} />
                </div>
                <span className="ph-val">{Math.round(share * 100)}%</span>
              </div>
            ))}
          </div>
        )}

        <ul className="angles">
          {brief.angles.map((a, i) => (
            <li key={i}>{a.angle}</li>
          ))}
        </ul>

        <div className="brief-actions">
          <button className="act primary" onClick={generate} disabled={busy || dismissed}>
            {busy ? "Writing script…" : "Generate script"}
          </button>
          <button className="act quiet" onClick={dismiss} disabled={busy || dismissed}>
            Dismiss
          </button>
          {error && <span style={{ color: "#ff6a3d", fontSize: 13 }}>{error}</span>}
        </div>

        {brief.sources.length > 0 && (
          <div className="sources">
            {brief.sources.slice(0, 3).map((s, i) => (
              <a key={i} href={s.url} target="_blank" rel="noreferrer">
                {s.platform}: {s.title.slice(0, 48)}
                {s.title.length > 48 ? "…" : ""}
              </a>
            ))}
          </div>
        )}
      </div>
    </article>
  );
}
