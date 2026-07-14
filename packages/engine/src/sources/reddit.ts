import { readFileSync } from "node:fs";
import { fixturePath, isMock } from "./mock.ts";
import { SignalSchema, type Signal } from "../types.ts";

/**
 * Fetches hot posts from a list of subreddits.
 * Uses Reddit's public JSON endpoints (no OAuth needed for read-only, low volume).
 * For production volume, switch to OAuth: https://www.reddit.com/dev/api/
 * Mock mode reads fixtures/reddit.json instead of the network.
 */
export async function fetchReddit(subreddits: string[]): Promise<Signal[]> {
  if (isMock()) {
    const raw = JSON.parse(readFileSync(fixturePath("reddit.json"), "utf8"));
    return raw.map((s: unknown) => SignalSchema.parse(s));
  }

  const out: Signal[] = [];
  for (const sub of subreddits) {
    try {
      const res = await fetch(`https://www.reddit.com/r/${sub}/hot.json?limit=25`, {
        headers: { "User-Agent": "signalwork/0.1 (trend research)" },
      });
      if (!res.ok) continue;
      const json = (await res.json()) as any;
      const now = Date.now() / 1000;
      for (const child of json?.data?.children ?? []) {
        const p = child.data;
        if (!p || p.stickied) continue;
        out.push(
          SignalSchema.parse({
            platform: "reddit",
            title: p.title,
            url: `https://www.reddit.com${p.permalink}`,
            engagement: p.ups ?? 0,
            discussion: p.num_comments ?? 0,
            ageHours: Math.max(0, (now - p.created_utc) / 3600),
          }),
        );
      }
    } catch {
      // one bad subreddit shouldn't kill the run
    }
  }
  return out;
}
