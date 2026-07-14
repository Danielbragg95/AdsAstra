import { postizConfig, isPostizLive, type PostizConfig } from "../publish/postiz.ts";
import type { ContentItemRow } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

export interface Metrics {
  impressions: number;
  likes: number;
  comments: number;
  shares: number;
  engagement_rate: number; // (likes+comments+shares)/impressions
}

/**
 * Fetches per-post metrics.
 * LIVE: GET {POSTIZ_URL}/api/posts/{id} and defensively reads whatever numeric
 *   insight fields Postiz returns for the connected network. NOTE: analytics
 *   field names vary by Postiz version/network — verify against your instance
 *   (see README "verify at home"). Unknown shapes fail soft, never corrupt state.
 * MOCK: deterministic metrics derived from the post id, so Pulse and the
 *   feedback loop are fully exercisable offline.
 */
export async function fetchPostMetrics(
  postizPostId: string,
  cfg: PostizConfig = postizConfig(),
): Promise<{ ok: boolean; metrics?: Metrics; error?: string; mode: "live" | "mock" }> {
  if (!isPostizLive(cfg)) {
    // deterministic pseudo-metrics from the id hash — stable across runs
    let h = 0;
    for (const c of postizPostId) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const impressions = 500 + (h % 9500);
    const likes = Math.round(impressions * (0.01 + (h % 70) / 1000));
    const comments = Math.round(likes * 0.15);
    const shares = Math.round(likes * 0.1);
    return {
      ok: true,
      mode: "mock",
      metrics: withRate({ impressions, likes, comments, shares }),
    };
  }
  try {
    const res = await fetch(
      `${cfg.url!.replace(/\/$/, "")}/api/posts/${encodeURIComponent(postizPostId)}`,
      { headers: { Authorization: `Bearer ${cfg.apiKey}` } },
    );
    if (!res.ok) {
      return { ok: false, error: `postiz ${res.status}`, mode: "live" };
    }
    const json = (await res.json()) as any;
    const src = json?.analytics ?? json?.insights ?? json ?? {};
    const num = (...keys: string[]) => {
      for (const k of keys) {
        const v = src[k];
        if (typeof v === "number" && Number.isFinite(v)) return v;
      }
      return 0;
    };
    return {
      ok: true,
      mode: "live",
      metrics: withRate({
        impressions: num("impressions", "views", "reach"),
        likes: num("likes", "favorites", "reactions"),
        comments: num("comments", "replies"),
        shares: num("shares", "reposts", "retweets"),
      }),
    };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), mode: "live" };
  }
}

function withRate(m: Omit<Metrics, "engagement_rate">): Metrics {
  const engagement_rate =
    m.impressions > 0
      ? Math.round(((m.likes + m.comments + m.shares) / m.impressions) * 10000) / 10000
      : 0;
  return { ...m, engagement_rate };
}

export interface SyncResult {
  synced: number;
  failed: number;
  errors: string[];
}

/** Syncs metrics for every scheduled/published item that has a Postiz id. */
export async function syncPerformance(db: EngineDb, brandId?: string): Promise<SyncResult> {
  const items = db
    .listContent(brandId ? { brandId } : {})
    .filter(
      (c) => (c.status === "scheduled" || c.status === "published") && c.postiz_post_id,
    );
  const result: SyncResult = { synced: 0, failed: 0, errors: [] };
  for (const item of items) {
    const r = await fetchPostMetrics(item.postiz_post_id!);
    if (r.ok && r.metrics) {
      db.setContentPerformance(item.id, { ...r.metrics });
      result.synced++;
    } else {
      result.failed++;
      if (r.error && result.errors.length < 3) result.errors.push(r.error);
    }
  }
  return result;
}

/**
 * The feedback loop: distills what performed for a brand into a short prompt
 * fragment the trend/script agents can condition on. Returns "" when there's
 * no data yet, so prompts stay clean for new brands.
 */
export function performanceContext(db: EngineDb, brandId: string, top = 3): string {
  const briefs = new Map(db.listBriefs(brandId).map((b) => [b.id, b]));
  const measured = db
    .listContent({ brandId })
    .filter((c) => c.performance && c.performance.impressions > 0)
    .sort((a, b) => b.performance!.engagement_rate - a.performance!.engagement_rate);
  if (measured.length === 0) return "";

  const lines = measured.slice(0, top).map((c) => {
    const topic = briefs.get(c.brief_id ?? "")?.topic ?? c.platform;
    const m = c.performance!;
    return `- [${c.kind} on ${c.platform}] "${topic}": ${m.impressions} impressions, ${(m.engagement_rate * 100).toFixed(1)}% engagement`;
  });
  const worst = measured[measured.length - 1];
  if (measured.length > top) {
    const m = worst.performance!;
    lines.push(
      `- weakest: [${worst.kind} on ${worst.platform}] "${briefs.get(worst.brief_id ?? "")?.topic ?? ""}": ${(m.engagement_rate * 100).toFixed(1)}% engagement`,
    );
  }
  return `PERFORMANCE CONTEXT (this brand's recent results — favor angles/formats like the top performers):\n${lines.join("\n")}`;
}
