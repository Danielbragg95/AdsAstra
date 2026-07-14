import { readFileSync } from "node:fs";
import { fixturePath, isMock } from "./mock.ts";
import { SignalSchema, type Signal } from "../types.ts";

/**
 * Searches recent YouTube uploads per keyword via Data API v3 and computes
 * view velocity. Requires YOUTUBE_API_KEY (free quota: 10k units/day).
 * Mock mode reads fixtures/youtube.json.
 */
export async function fetchYouTube(keywords: string[]): Promise<Signal[]> {
  if (isMock()) {
    const raw = JSON.parse(readFileSync(fixturePath("youtube.json"), "utf8"));
    return raw.map((s: unknown) => SignalSchema.parse(s));
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) return [];

  const out: Signal[] = [];
  const publishedAfter = new Date(Date.now() - 72 * 3600e3).toISOString();

  for (const kw of keywords) {
    try {
      const searchUrl = new URL("https://www.googleapis.com/youtube/v3/search");
      searchUrl.search = new URLSearchParams({
        key,
        q: kw,
        part: "snippet",
        type: "video",
        order: "viewCount",
        publishedAfter,
        maxResults: "15",
      }).toString();
      const search = (await (await fetch(searchUrl)).json()) as any;
      const ids: string[] = (search.items ?? [])
        .map((i: any) => i?.id?.videoId)
        .filter(Boolean);
      if (!ids.length) continue;

      const statsUrl = new URL("https://www.googleapis.com/youtube/v3/videos");
      statsUrl.search = new URLSearchParams({
        key,
        id: ids.join(","),
        part: "snippet,statistics",
      }).toString();
      const stats = (await (await fetch(statsUrl)).json()) as any;

      for (const v of stats.items ?? []) {
        const ageHours = Math.max(
          0.5,
          (Date.now() - new Date(v.snippet.publishedAt).getTime()) / 3600e3,
        );
        out.push(
          SignalSchema.parse({
            platform: "youtube",
            title: v.snippet.title,
            url: `https://www.youtube.com/watch?v=${v.id}`,
            engagement: Number(v.statistics?.viewCount ?? 0),
            discussion: Number(v.statistics?.commentCount ?? 0),
            ageHours,
          }),
        );
      }
    } catch {
      // continue with other keywords
    }
  }
  return out;
}
