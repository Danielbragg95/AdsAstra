import { fetchReddit } from "../sources/reddit.ts";
import { fetchYouTube } from "../sources/youtube.ts";
import { clusterTopics } from "../scoring/cluster.ts";
import { scoreClusters, platformHeat } from "../scoring/heat.ts";
import { llm, extractJson } from "../llm/client.ts";
import { briefWriterSystem, briefWriterUser } from "../prompts/index.ts";
import { BriefListSchema, type BrandRow, type Signal } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

export interface RadarResult {
  brand: string;
  signals: number;
  clusters: number;
  briefsWritten: number;
  briefIds: string[];
}

/** One radar sweep for one brand. */
export async function runTrendRadar(db: EngineDb, brand: BrandRow): Promise<RadarResult> {
  const settled = await Promise.allSettled([
    fetchReddit(brand.sources.subreddits),
    fetchYouTube(brand.sources.ytKeywords),
  ]);
  const signals: Signal[] = settled.flatMap((r) =>
    r.status === "fulfilled" ? r.value : [],
  );

  const clusters = scoreClusters(clusterTopics(signals));
  const top = clusters.slice(0, 15);

  if (top.length === 0) {
    return { brand: brand.name, signals: 0, clusters: 0, briefsWritten: 0, briefIds: [] };
  }

  const reply = await llm({
    system: briefWriterSystem(brand),
    user: briefWriterUser(top),
  });
  const { briefs } = BriefListSchema.parse(extractJson(reply));

  const briefIds: string[] = [];
  for (const brief of briefs) {
    // re-attach the numeric evidence from the matching cluster
    const cluster =
      top.find((c) =>
        c.label.toLowerCase().includes(brief.topic.toLowerCase().split(" ")[0]),
      ) ?? bestClusterFor(brief.topic, top);
    const id = db.insertBrief(
      brand.id,
      brief,
      cluster?.heat ?? 0.5,
      cluster ? platformHeat(cluster) : {},
      (cluster?.signals ?? []).slice(0, 6).map((s: Signal) => ({
        title: s.title,
        url: s.url,
        platform: s.platform,
      })),
    );
    briefIds.push(id);
  }

  return {
    brand: brand.name,
    signals: signals.length,
    clusters: clusters.length,
    briefsWritten: briefs.length,
    briefIds,
  };
}

function bestClusterFor(topic: string, clusters: { label: string }[]) {
  const words = new Set(topic.toLowerCase().split(/\s+/));
  let best: any = null;
  let bestScore = 0;
  for (const c of clusters) {
    const score = c.label
      .toLowerCase()
      .split(/\s+/)
      .filter((w) => words.has(w)).length;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
}
