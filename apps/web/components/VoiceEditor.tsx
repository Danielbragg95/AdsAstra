"use client";

import { useState } from "react";
import type { BrandRow, VoiceProfile } from "@signalwork/engine";

export function VoiceEditor({ brand }: { brand: BrandRow }) {
  const [v, setV] = useState<VoiceProfile>(brand.voice_profile);
  const [state, setState] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [error, setError] = useState("");

  function set<K extends keyof VoiceProfile>(key: K, value: VoiceProfile[K]) {
    setV((prev) => ({ ...prev, [key]: value }));
    setState("idle");
  }

  async function save() {
    setState("saving");
    try {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId: brand.id, voice_profile: v }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "save failed");
      setState("saved");
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
      setState("error");
    }
  }

  const lines = (arr: string[]) => arr.join("\n");
  const parseLines = (s: string) =>
    s.split("\n").map((x) => x.trim()).filter(Boolean);

  return (
    <section className="voice-card">
      <div className="post-card-head">
        <span className="brief-topic">{brand.name}</span>
        <span className={`status status-${state === "saved" ? "scheduled" : "draft"}`}>
          {state === "saving" ? "saving…" : state === "saved" ? "saved" : state === "error" ? "error" : "editing"}
        </span>
      </div>

      <label className="field">
        <span className="field-label">Identity</span>
        <textarea value={v.identity} rows={2} onChange={(e) => set("identity", e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Audience</span>
        <textarea value={v.audience} rows={2} onChange={(e) => set("audience", e.target.value)} />
      </label>

      <label className="field">
        <span className="field-label">Sentence rhythm</span>
        <textarea
          value={v.sentence_rhythm}
          rows={2}
          onChange={(e) => set("sentence_rhythm", e.target.value)}
        />
      </label>

      <div className="field-pair">
        <label className="field">
          <span className="field-label">Use (one per line)</span>
          <textarea
            value={lines(v.vocabulary.use)}
            rows={5}
            onChange={(e) => set("vocabulary", { ...v.vocabulary, use: parseLines(e.target.value) })}
          />
        </label>
        <label className="field">
          <span className="field-label">Banned (one per line)</span>
          <textarea
            value={lines(v.vocabulary.ban)}
            rows={5}
            onChange={(e) => set("vocabulary", { ...v.vocabulary, ban: parseLines(e.target.value) })}
          />
        </label>
      </div>

      <label className="field">
        <span className="field-label">Signature moves (one per line)</span>
        <textarea
          value={lines(v.signature_moves)}
          rows={3}
          onChange={(e) => set("signature_moves", parseLines(e.target.value))}
        />
      </label>

      <label className="field">
        <span className="field-label">Example passages (one per line)</span>
        <textarea
          value={lines(v.example_passages)}
          rows={4}
          onChange={(e) => set("example_passages", parseLines(e.target.value))}
        />
      </label>

      <div className="brief-actions">
        <button className="act primary" onClick={save} disabled={state === "saving"}>
          Save voice
        </button>
        {state === "error" && <span style={{ color: "#ff6a3d", fontSize: 13 }}>{error}</span>}
      </div>
    </section>
  );
}
