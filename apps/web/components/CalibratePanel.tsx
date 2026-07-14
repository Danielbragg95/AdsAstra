"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { VoiceProfile } from "@signalwork/engine";

interface Variant {
  key: string;
  description: string;
  profile: VoiceProfile;
  sample: string;
}

export function CalibratePanel({ brandId }: { brandId: string }) {
  const router = useRouter();
  const [variants, setVariants] = useState<Variant[] | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function start() {
    setBusy(true);
    setError("");
    setPicked(null);
    try {
      const res = await fetch("/api/calibrate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "calibration failed");
      // shuffle so position never gives the variant away
      setVariants([...json.variants].sort(() => Math.random() - 0.5));
    } catch (e) {
      setError(e instanceof Error ? e.message : "calibration failed");
    } finally {
      setBusy(false);
    }
  }

  async function choose(v: Variant) {
    setBusy(true);
    try {
      const res = await fetch("/api/brands", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandId, voice_profile: v.profile }),
      });
      if (!res.ok) throw new Error("save failed");
      setPicked(v.key);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "save failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="calibrate">
      {!variants && (
        <div className="brief-actions">
          <button className="act quiet" onClick={start} disabled={busy}>
            {busy ? "Rendering variants…" : "Calibrate voice (blind A/B)"}
          </button>
          {error && <span style={{ color: "#ff6a3d", fontSize: 13 }}>{error}</span>}
        </div>
      )}
      {variants && (
        <>
          <p className="view-sub" style={{ marginBottom: 12 }}>
            Same intro, three voices. Pick the one that sounds most like you —
            what each changes is revealed after you choose.
          </p>
          <div className="calibrate-grid">
            {variants.map((v, i) => (
              <div className={`post-card${picked === v.key ? " picked" : ""}`} key={v.key}>
                <div className="post-card-head">
                  <span className="tag">Option {i + 1}</span>
                  {picked && (
                    <span className="sched-note">
                      {v.key === "A" ? "○ " : "● "}{v.description}
                    </span>
                  )}
                </div>
                <p className="post-body">{v.sample}</p>
                {!picked && (
                  <button className="act primary" onClick={() => choose(v)} disabled={busy}>
                    This one
                  </button>
                )}
                {picked === v.key && <span className="status status-scheduled">applied</span>}
              </div>
            ))}
          </div>
          {picked && (
            <button className="act quiet" onClick={start} disabled={busy} style={{ marginTop: 10 }}>
              Run another round
            </button>
          )}
        </>
      )}
    </div>
  );
}
