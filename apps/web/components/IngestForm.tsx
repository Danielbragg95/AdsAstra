"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function IngestForm({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [transcript, setTranscript] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit() {
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/ingest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, title, transcript }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "ingestion failed");
      router.push(`/scripts/${json.contentId}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : "ingestion failed");
      setBusy(false);
    }
  }

  return (
    <section className="voice-card">
      <label className="field">
        <span className="field-label">Source title (optional)</span>
        <textarea rows={1} value={title} onChange={(e) => setTitle(e.target.value)} />
      </label>
      <label className="field">
        <span className="field-label">Transcript</span>
        <textarea
          rows={14}
          value={transcript}
          placeholder="Paste the full transcript here…"
          onChange={(e) => setTranscript(e.target.value)}
        />
      </label>
      <div className="brief-actions">
        <button className="act primary" onClick={submit} disabled={busy || transcript.length < 200}>
          {busy ? "Distilling…" : "Distill to beat sheet"}
        </button>
        <span className="sched-note">{transcript.length.toLocaleString()} chars</span>
        {error && <span style={{ color: "#ff6a3d", fontSize: 13 }}>{error}</span>}
      </div>
    </section>
  );
}
