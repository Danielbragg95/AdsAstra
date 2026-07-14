import { renderPostBody } from "../agents/repurposeAgent.ts";
import type { ContentItemRow } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

/**
 * Publishing goes through Postiz (self-hosted or cloud): users connect socials
 * to Postiz via each platform's official OAuth; we only talk to Postiz's API.
 *
 * Modes:
 *  - LIVE:  POSTIZ_URL + POSTIZ_API_KEY set → real HTTP calls.
 *  - MOCK:  neither set → returns deterministic fake ids so the whole
 *           approve→schedule flow works offline.
 */
export interface PostizConfig {
  url?: string;
  apiKey?: string;
}

export function postizConfig(): PostizConfig {
  return { url: process.env.POSTIZ_URL, apiKey: process.env.POSTIZ_API_KEY };
}

export function isPostizLive(cfg: PostizConfig = postizConfig()): boolean {
  return Boolean(cfg.url && cfg.apiKey);
}

export interface ScheduleRequest {
  integrationId: string;   // Postiz integration id for the target account
  content: string;
  date: string;            // ISO 8601
}

export interface ScheduleResult {
  ok: boolean;
  postizPostId?: string;
  error?: string;
  mode: "live" | "mock";
}

export async function postizSchedule(
  req: ScheduleRequest,
  cfg: PostizConfig = postizConfig(),
): Promise<ScheduleResult> {
  if (!isPostizLive(cfg)) {
    return { ok: true, postizPostId: `mock_${req.integrationId}_${Date.now()}`, mode: "mock" };
  }
  try {
    const res = await fetch(`${cfg.url!.replace(/\/$/, "")}/api/posts`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${cfg.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        type: "post",
        date: req.date,
        shortLink: false,
        posts: [{ id: req.integrationId, content: req.content }],
      }),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      return { ok: false, error: `postiz ${res.status}: ${text.slice(0, 200)}`, mode: "live" };
    }
    const json = (await res.json()) as any;
    const id = json?.id ?? json?.postId ?? json?.posts?.[0]?.id;
    return { ok: true, postizPostId: String(id ?? "unknown"), mode: "live" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e), mode: "live" };
  }
}

// ---- workflow --------------------------------------------------------------

const SCHEDULABLE = new Set(["x_thread", "li_post", "ig_caption", "tt_caption"]);

/** draft → approved. Only human review moves content past draft. */
export function approveContent(db: EngineDb, item: ContentItemRow): void {
  if (item.status !== "draft") throw new Error(`cannot approve from status '${item.status}'`);
  db.setContentStatus(item.id, "approved");
}

/** approved → scheduled via Postiz. Never schedules unapproved content.
 *  The integration id is resolved from the OWNING BRAND's platform mapping,
 *  so each brand publishes to its own social accounts. */
export async function scheduleContent(
  db: EngineDb,
  item: ContentItemRow,
  when: Date,
  integrationId?: string,
): Promise<ScheduleResult> {
  if (item.status !== "approved") {
    return { ok: false, error: `cannot schedule from status '${item.status}' — approve first`, mode: "mock" };
  }
  if (!SCHEDULABLE.has(item.kind)) {
    return { ok: false, error: `kind '${item.kind}' is not schedulable`, mode: "mock" };
  }
  if (Number.isNaN(when.getTime()) || when.getTime() < Date.now() - 60_000) {
    return { ok: false, error: "schedule time must be in the future", mode: "mock" };
  }

  // resolve integration: explicit arg > brand's platform mapping > mock fallback
  let integration = integrationId;
  if (!integration) {
    const brand = db.getBrand(item.brand_id);
    integration = brand?.postiz_integrations?.[item.platform];
  }
  if (!integration) {
    if (isPostizLive()) {
      return {
        ok: false,
        error: `no Postiz integration configured for platform '${item.platform}' on this brand — add it in Brands`,
        mode: "live",
      };
    }
    integration = `mock-${item.platform}`;
  }

  const result = await postizSchedule({
    integrationId: integration,
    content: renderPostBody(item.kind, item.body),
    date: when.toISOString(),
  });

  if (result.ok) {
    db.setContentStatus(item.id, "scheduled", {
      scheduledFor: when.toISOString(),
      postizPostId: result.postizPostId,
    });
  }
  return result;
}
