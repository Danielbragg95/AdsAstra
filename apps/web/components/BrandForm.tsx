"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { BrandRow } from "@signalwork/engine";

const PLATFORMS = ["x", "linkedin", "instagram", "tiktok"] as const;

const EMPTY = {
  name: "",
  positioning: "",
  subreddits: "",
  ytKeywords: "",
  keywords: "",
  integrations: Object.fromEntries(PLATFORMS.map((p) => [p, ""])) as Record<string, string>,
};

function fromBrand(b: BrandRow) {
  return {
    name: b.name,
    positioning: b.positioning,
    subreddits: b.sources.subreddits.join(", "),
    ytKeywords: b.sources.ytKeywords.join(", "),
    keywords: b.sources.keywords.join(", "),
    integrations: {
      ...Object.fromEntries(PLATFORMS.map((p) => [p, ""])),
      ...b.postiz_integrations,
    },
  };
}

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);

export function BrandForm({ brand }: { brand?: BrandRow }) {
  const router = useRouter();
  const [f, setF] = useState(brand ? fromBrand(brand) : EMPTY);
  const [state, setState] = useState<"idle" | "busy" | "error">("idle");
  const [error, setError] = useState("");

  async function save() {
    setState("busy");
    setError("");
    const payload = {
      name: f.name,
      positioning: f.positioning,
      sources: {
        subreddits: csv(f.subreddits),
        ytKeywords: csv(f.ytKeywords),
        keywords: csv(f.keywords),
      },
      voice_profile: brand?.voice_profile ?? {
        identity: "First-person expert, specific and warm.",
        audience: "Describe who this brand talks to in Voices.",
      },
      postiz_integrations: Object.fromEntries(
        Object.entries(f.integrations).filter(([, v]) => v.trim()),
      ),
    };
    try {
      const res = await fetch("/api/brands", {
        method: brand ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(brand ? { brandId: brand.id, brand: payload } : payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      if (!brand) setF(EMPTY);
      setState("idle");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setState("error");
    }
  }

  async function archive() {
    if (!brand) return;
    setState("busy");
    await fetch("/api/brands", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ brandId: brand.id, action: "archive" }),
    });
    router.refresh();
  }

  return (
    <section className="voice-card">
      <div className="post-card-head">
        <span className="brief-topic">{brand ? brand.name : "New brand"}</span>
        {brand && (
          <button className="act quiet" onClick={archive} disabled={state === "busy"}>
            Archive
          </button>
        )}
      </div>

      <div className="field-pair">
        <label className="field">
          <span className="field-label">Name</span>
          <textarea rows={1} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">Subreddits (comma-separated)</span>
          <textarea rows={1} value={f.subreddits} onChange={(e) => setF({ ...f, subreddits: e.target.value })} />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Positioning — what you sell, to whom, your POV</span>
        <textarea rows={3} value={f.positioning} onChange={(e) => setF({ ...f, positioning: e.target.value })} />
      </label>

      <div className="field-pair">
        <label className="field">
          <span className="field-label">YouTube keywords</span>
          <textarea rows={2} value={f.ytKeywords} onChange={(e) => setF({ ...f, ytKeywords: e.target.value })} />
        </label>
        <label className="field">
          <span className="field-label">General keywords</span>
          <textarea rows={2} value={f.keywords} onChange={(e) => setF({ ...f, keywords: e.target.value })} />
        </label>
      </div>

      <div className="field">
        <span className="field-label">Postiz integration ids — this brand&apos;s own accounts</span>
        <div className="integration-grid">
          {PLATFORMS.map((p) => (
            <label className="integration-row" key={p}>
              <span className="ph-name">{p}</span>
              <input
                value={f.integrations[p]}
                placeholder="int_…"
                onChange={(e) =>
                  setF({ ...f, integrations: { ...f.integrations, [p]: e.target.value } })
                }
              />
            </label>
          ))}
        </div>
      </div>

      <div className="brief-actions">
        <button className="act primary" onClick={save} disabled={state === "busy"}>
          {state === "busy" ? "Saving…" : brand ? "Save brand" : "Create brand"}
        </button>
        {error && <span style={{ color: "#ff6a3d", fontSize: 13 }}>{error}</span>}
      </div>
    </section>
  );
}
