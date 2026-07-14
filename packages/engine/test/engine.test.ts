import { test } from "node:test";
import assert from "node:assert/strict";
import { unlinkSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { clusterTopics, tokenize } from "../src/scoring/cluster.ts";
import { scoreClusters, platformHeat } from "../src/scoring/heat.ts";
import { extractJson } from "../src/llm/client.ts";
import { openDb } from "../src/db/index.ts";
import { demoBrandSeed } from "../src/voice/default.ts";
import type { Signal } from "../src/types.ts";

const sig = (p: Signal["platform"], title: string, eng: number, age: number): Signal => ({
  platform: p,
  title,
  url: "https://x.test/" + Math.random(),
  engagement: eng,
  discussion: Math.round(eng * 0.1),
  ageHours: age,
});

test("tokenize stems consistently and drops stopwords", () => {
  const a = tokenize("Voice clones are getting scary good");
  const b = tokenize("Voice cloning is everywhere");
  const c = tokenize("My favorite voice clone");
  // all three inflections share one stem token
  const shared = [...a].filter((t) => b.has(t) && c.has(t));
  assert.ok(shared.some((t) => t.startsWith("clon")), `shared=${shared}`);
  assert.ok(a.has("scary"));
  assert.ok(!a.has("are"));
});

test("clusterTopics groups same-topic signals across platforms", () => {
  const clusters = clusterTopics([
    sig("reddit", "ElevenLabs voice clones are getting scary good", 5000, 8),
    sig("youtube", "Voice Clone vs Real Voice blind test - scary good", 300000, 10),
    sig("reddit", "TikTok creator fund changes explained", 1400, 12),
    sig("youtube", "TikTok Creator Fund Changes in 6 minutes", 90000, 18),
    sig("reddit", "Completely unrelated sourdough starter tips", 200, 5),
  ]);
  const labels = clusters.map((c) => c.signals.length).sort();
  assert.deepEqual(labels, [1, 2, 2]);
  const voiceCluster = clusters.find((c) => c.label.toLowerCase().includes("voice"))!;
  assert.equal(voiceCluster.platforms.length, 2);
});

test("scoreClusters produces 0..1 heat, hotter for fresh multi-platform velocity", () => {
  const clusters = clusterTopics([
    sig("reddit", "AI agents run my content calendar", 4000, 4),
    sig("youtube", "AI agents content calendar 30 days", 500000, 6),
    sig("reddit", "Old slow topic nobody cares about anymore", 50, 70),
  ]);
  const scored = scoreClusters(clusters);
  for (const c of scored) {
    assert.ok(c.heat >= 0 && c.heat <= 1, `heat in range, got ${c.heat}`);
  }
  assert.ok(scored[0].heat > scored[scored.length - 1].heat);
  assert.ok(scored[0].label.toLowerCase().includes("agent"));
});

test("platformHeat shares sum to ~1", () => {
  const clusters = clusterTopics([
    sig("reddit", "voice clone test alpha", 1000, 5),
    sig("youtube", "voice clone test beta", 100000, 5),
  ]);
  const ph = platformHeat(clusters[0]);
  const total = Object.values(ph).reduce((a, b) => a + b, 0);
  assert.ok(Math.abs(total - 1) < 0.05, `shares≈1, got ${total}`);
  assert.ok(ph.youtube > ph.reddit);
});

test("extractJson handles fences, prose, and nested braces", () => {
  assert.deepEqual(extractJson('```json\n{"a":1}\n```'), { a: 1 });
  assert.deepEqual(extractJson('Sure! Here you go: {"a":{"b":"}tricky{"}} done'), {
    a: { b: "}tricky{" },
  });
  assert.deepEqual(extractJson("[1,2,3]"), [1, 2, 3]);
  assert.throws(() => extractJson("no json here"));
});

test("db roundtrip: brand → brief → content", () => {
  const path = join(mkdtempSync(join(tmpdir(), "sw-")), "test.db");
  const db = openDb(path);
  const brand = db.createBrand(demoBrandSeed);
  const briefId = db.insertBrief(
    brand.id,
    {
      topic: "Voice cloning",
      summary: "s",
      why_rising: "w",
      angles: [{ angle: "a", why_it_fits: "f" }],
      recommended_platform: "youtube",
      recommended_format: "long-form explainer",
      freshness: "this_week",
    },
    0.8,
    { youtube: 0.7, reddit: 0.3 },
    [{ title: "t", url: "u", platform: "reddit" }],
  );
  const brief = db.getBrief(briefId)!;
  assert.equal(brief.topic, "Voice cloning");
  assert.equal(brief.platform_heat.youtube, 0.7);

  const cid = db.insertContent(brand.id, briefId, "script", "youtube", { hook: "h" });
  assert.equal((db.getContent(cid)!.body as any).hook, "h");

  db.setBriefStatus(briefId, "used");
  assert.equal(db.getBrief(briefId)!.status, "used");
  db.close();
  unlinkSync(path);
});
