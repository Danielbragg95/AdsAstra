import type { Signal, TopicCluster } from "../types.ts";

const STOP = new Set(
  `a an and are as at be by for from has have how i in is it its my of on or
   the to was we what when why will with you your this that just now new full
   me vs let day days`.split(/\s+/),
);

export function tokenize(title: string): Set<string> {
  return new Set(
    title
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, " ")
      .split(/\s+/)
      .filter((t) => t.length > 2 && !STOP.has(t))
      .map(stem),
  );
}

/** Very light stemmer. Goal is consistency, not linguistics: all inflections
 *  of a word must map to the SAME token ("clone/clones/cloning" → "clon"). */
function stem(t: string): string {
  if (t.endsWith("ies") && t.length > 4) t = t.slice(0, -3) + "y";
  else if (t.endsWith("ing") && t.length > 5) t = t.slice(0, -3);
  else if (t.endsWith("ed") && t.length > 4) t = t.slice(0, -2);
  else if (t.endsWith("s") && !t.endsWith("ss")) t = t.slice(0, -1);
  // final e-drop makes "clone" and "clon(ing)" converge
  if (t.endsWith("e") && t.length > 3) t = t.slice(0, -1);
  return t;
}

/** Overlap coefficient: |A∩B| / min(|A|,|B|). Unlike Jaccard, it doesn't
 *  degrade as a cluster's vocabulary grows, which was splitting topics. */
function overlap(a: Set<string>, b: Set<string>): { sim: number; inter: number } {
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  const denom = Math.min(a.size, b.size);
  return { sim: denom === 0 ? 0 : inter / denom, inter };
}

/**
 * Greedy single-pass clustering by token overlap. Requires at least 2 shared
 * tokens to prevent single-common-word merges ("content" alone won't merge).
 * Good enough for signals within one niche; swap for embedding similarity
 * when scale demands it.
 */
export function clusterTopics(signals: Signal[], threshold = 0.3): TopicCluster[] {
  const clusters: { tokens: Set<string>; signals: Signal[] }[] = [];

  for (const s of signals) {
    const toks = tokenize(s.title);
    let best: { c: (typeof clusters)[number]; sim: number } | null = null;
    for (const c of clusters) {
      const { sim, inter } = overlap(toks, c.tokens);
      if (sim >= threshold && inter >= 2 && (!best || sim > best.sim)) best = { c, sim };
    }
    if (best) {
      best.c.signals.push(s);
      for (const t of toks) best.c.tokens.add(t); // grow the cluster vocabulary
    } else {
      clusters.push({ tokens: new Set(toks), signals: [s] });
    }
  }

  return clusters.map((c) => {
    const platforms = [...new Set(c.signals.map((s) => s.platform))];
    // label = highest-engagement signal's title
    const label = [...c.signals].sort((a, b) => b.engagement - a.engagement)[0].title;
    return {
      label,
      signals: c.signals,
      platforms,
      heat: 0, // filled by heatScore
      stats: computeStats(c.signals, platforms.length),
    };
  });
}

function computeStats(signals: Signal[], crossPlatform: number) {
  // velocity = engagement per hour, summed across the cluster
  const mentionVelocity = signals.reduce(
    (acc, s) => acc + s.engagement / Math.max(1, s.ageHours),
    0,
  );
  const engagementRate =
    signals.reduce((acc, s) => acc + s.discussion / Math.max(1, s.engagement), 0) /
    signals.length;
  const ages = signals.map((s) => s.ageHours).sort((a, b) => a - b);
  const medianAgeHours = ages[Math.floor(ages.length / 2)];
  return { mentionVelocity, engagementRate, crossPlatform, medianAgeHours };
}
