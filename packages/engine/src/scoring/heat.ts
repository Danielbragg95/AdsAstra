import type { TopicCluster } from "../types.ts";

const W = {
  velocity: 0.45,
  engagement: 0.2,
  crossPlatform: 0.2,
  ageDecay: 0.15,
};

function zscores(values: number[]): number[] {
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const sd =
    Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
  return values.map((v) => (v - mean) / sd);
}

const sigmoid = (x: number) => 1 / (1 + Math.exp(-x));

/**
 * Scores every cluster relative to its peers in this run, mutating `heat`
 * to a 0..1 value, and returns clusters sorted hottest-first.
 */
export function scoreClusters(clusters: TopicCluster[]): TopicCluster[] {
  if (clusters.length === 0) return clusters;
  const vz = zscores(clusters.map((c) => Math.log1p(c.stats.mentionVelocity)));
  const ez = zscores(clusters.map((c) => c.stats.engagementRate));

  clusters.forEach((c, i) => {
    const cross = Math.min(1, (c.stats.crossPlatform - 1) / 2); // 1 platform=0, 3+=1
    const decay = Math.min(1, c.stats.medianAgeHours / 72); // older than 3d = fully decayed
    const raw =
      W.velocity * vz[i] +
      W.engagement * ez[i] +
      W.crossPlatform * (cross * 2 - 1) -
      W.ageDecay * (decay * 2 - 1);
    c.heat = Math.round(sigmoid(raw * 1.5) * 100) / 100;
  });

  return [...clusters].sort((a, b) => b.heat - a.heat);
}

/** Per-platform heat inside one cluster: share of velocity by platform. */
export function platformHeat(cluster: TopicCluster): Record<string, number> {
  const byPlatform: Record<string, number> = {};
  let total = 0;
  for (const s of cluster.signals) {
    const v = s.engagement / Math.max(1, s.ageHours);
    byPlatform[s.platform] = (byPlatform[s.platform] ?? 0) + v;
    total += v;
  }
  for (const k of Object.keys(byPlatform)) {
    byPlatform[k] = Math.round((byPlatform[k] / (total || 1)) * 100) / 100;
  }
  return byPlatform;
}
