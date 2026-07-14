"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { ContentItemRow } from "@signalwork/engine";

const KIND_LABEL: Record<string, string> = {
  x_thread: "X thread",
  li_post: "LinkedIn",
  ig_caption: "Instagram",
  tt_caption: "TikTok",
  carousel: "Carousel",
  cover: "Cover",
};

function previewText(kind: string, body: any): string {
  switch (kind) {
    case "x_thread":
      return (body.tweets as string[]).map((t, i) => `${i + 1}. ${t}`).join("\n\n");
    case "li_post":
      return body.post;
    case "ig_caption":
      return `${body.caption}\n\n${(body.hashtags ?? []).map((h: string) => `#${h}`).join(" ")}`;
    case "tt_caption":
      return `${body.caption}\n\n[on-screen: ${body.on_screen_hook}]`;
    default:
      return "";
  }
}

export function Studio({
  scriptId,
  initialPosts,
}: {
  scriptId: string;
  initialPosts: ContentItemRow[];
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function call(url: string, payload: unknown, tag: string) {
    setBusy(tag);
    setError(null);
    try {
      const res = await fetch(url, {
        method: url === "/api/content" ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error ?? "request failed");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "request failed");
    } finally {
      setBusy(null);
    }
  }

  const posts = initialPosts.filter(
    (p) => !["carousel", "cover", "voiceover"].includes(p.kind),
  );
  const assets = initialPosts.filter((p) => p.kind === "carousel" || p.kind === "cover");
  const voiceovers = initialPosts.filter((p) => p.kind === "voiceover");

  return (
    <section className="studio">
      <div className="studio-head">
        <h2 className="studio-title">Studio</h2>
        <div className="studio-actions">
          <button
            className="act primary"
            disabled={busy !== null}
            onClick={() => call("/api/repurpose", { scriptId }, "repurpose")}
          >
            {busy === "repurpose" ? "Writing posts…" : posts.length ? "Regenerate posts" : "Repurpose → 4 platforms"}
          </button>
          <button
            className="act quiet"
            disabled={busy !== null}
            onClick={() => call("/api/generate-assets", { scriptId, mode: "carousel" }, "carousel")}
          >
            {busy === "carousel" ? "Rendering…" : "Generate carousel"}
          </button>
          <button
            className="act quiet"
            disabled={busy !== null}
            onClick={() => call("/api/generate-assets", { scriptId, mode: "cover" }, "cover")}
          >
            {busy === "cover" ? "Rendering…" : "Generate cover"}
          </button>
          <button
            className="act quiet"
            disabled={busy !== null}
            onClick={() => call("/api/voiceover", { scriptId }, "vo")}
          >
            {busy === "vo" ? "Synthesizing…" : "Generate voiceover"}
          </button>
        </div>
        {error && <p className="studio-error">{error}</p>}
      </div>

      {posts.length > 0 && (
        <div className="post-grid">
          {posts.map((p) => (
            <article className="post-card" key={p.id}>
              <div className="post-card-head">
                <span className="tag">{KIND_LABEL[p.kind] ?? p.kind}</span>
                <span className={`status status-${p.status}`}>{p.status}</span>
              </div>
              <pre className="post-body">{previewText(p.kind, p.body)}</pre>
              <div className="brief-actions">
                {p.status === "draft" && (
                  <button
                    className="act primary"
                    disabled={busy !== null}
                    onClick={() => call("/api/content", { contentId: p.id, action: "approve" }, p.id)}
                  >
                    Approve
                  </button>
                )}
                {p.status === "approved" && (
                  <button
                    className="act primary"
                    disabled={busy !== null}
                    onClick={() =>
                      call(
                        "/api/content",
                        { contentId: p.id, action: "schedule", when: new Date(Date.now() + 3600e3).toISOString() },
                        p.id,
                      )
                    }
                  >
                    Schedule +1h
                  </button>
                )}
                {p.status === "scheduled" && (
                  <span className="sched-note">
                    {p.scheduled_for ? new Date(p.scheduled_for).toLocaleString() : ""} · {p.postiz_post_id}
                  </span>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      {voiceovers.map((v) => (
        <div className="asset-strip" key={v.id}>
          <div className="post-card-head">
            <span className="tag">Voiceover · {(v.body as any).provider}</span>
            <span className="tag">~{(v.body as any).total_seconds}s total</span>
          </div>
          {((v.body as any).segments as any[]).map((seg) => (
            <div className="vo-row" key={seg.file}>
              <span className="vo-label">{seg.label}</span>
              <audio controls preload="none" src={`/api/assets/${seg.file}`} />
              <span className="sched-note">{seg.seconds}s</span>
            </div>
          ))}
        </div>
      ))}

      {assets.map((a) => (
        <div className="asset-strip" key={a.id}>
          <div className="post-card-head">
            <span className="tag">{KIND_LABEL[a.kind]}</span>
            <span className="tag">{((a.body as any).files ?? []).length} image(s)</span>
          </div>
          <div className="asset-row">
            {((a.body as any).files as string[]).map((f) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img key={f} src={`/api/assets/${f}`} alt={a.kind} className="asset-thumb" />
            ))}
          </div>
        </div>
      ))}
    </section>
  );
}
