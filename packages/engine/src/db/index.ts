import { DatabaseSync } from "node:sqlite";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import type { BrandRow, Brief, BriefRow, ContentItemRow, VoiceProfile } from "../types.ts";

// repo root = packages/engine/src/db → four levels up
const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");

const DDL = `
create table if not exists brands (
  id text primary key,
  name text not null,
  positioning text not null,
  sources text not null,        -- json
  voice_profile text not null,  -- json
  active integer not null default 1,
  created_at text not null default (datetime('now'))
);

create table if not exists trend_briefs (
  id text primary key,
  brand_id text not null references brands(id),
  topic text not null,
  summary text not null,
  why_rising text not null default '',
  angles text not null,          -- json
  heat_score real not null,
  platform_heat text not null,   -- json
  recommended_platform text not null,
  recommended_format text not null default '',
  freshness text not null,
  sources text not null,         -- json
  status text not null default 'new',
  created_at text not null default (datetime('now'))
);

create table if not exists content_items (
  id text primary key,
  brand_id text not null references brands(id),
  brief_id text references trend_briefs(id),
  kind text not null,            -- script | x_thread | li_post | ...
  platform text not null,
  body text not null,            -- json
  status text not null default 'draft',
  created_at text not null default (datetime('now'))
);
`;

export type EngineDb = ReturnType<typeof openDb>;

export function dbPath(): string {
  return resolve(process.env.SIGNALWORK_DB ?? resolve(REPO_ROOT, "data/signalwork.db"));
}

export function openDb(path = dbPath()) {
  mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec("pragma journal_mode = wal;");
  db.exec(DDL);
  migrate(db);

  return {
    raw: db,

    // ---- brands -------------------------------------------------------
    createBrand(input: Omit<BrandRow, "id">): BrandRow {
      const id = randomUUID();
      db.prepare(
        `insert into brands (id, name, positioning, sources, voice_profile, postiz_integrations)
         values (?, ?, ?, ?, ?, ?)`,
      ).run(
        id,
        input.name,
        input.positioning,
        JSON.stringify(input.sources),
        JSON.stringify(input.voice_profile),
        JSON.stringify(input.postiz_integrations ?? {}),
      );
      return { id, ...input };
    },

    updateBrand(id: string, input: Omit<BrandRow, "id">): void {
      db.prepare(
        `update brands set name = ?, positioning = ?, sources = ?,
           voice_profile = ?, postiz_integrations = ? where id = ?`,
      ).run(
        input.name,
        input.positioning,
        JSON.stringify(input.sources),
        JSON.stringify(input.voice_profile),
        JSON.stringify(input.postiz_integrations ?? {}),
        id,
      );
    },

    archiveBrand(id: string): void {
      db.prepare(`update brands set active = 0 where id = ?`).run(id);
    },

    listBrands(): BrandRow[] {
      const rows = db.prepare(`select * from brands where active = 1`).all() as any[];
      return rows.map(hydrateBrand);
    },

    getBrand(id: string): BrandRow | null {
      const row = db.prepare(`select * from brands where id = ?`).get(id) as any;
      return row ? hydrateBrand(row) : null;
    },

    // ---- briefs -------------------------------------------------------
    insertBrief(
      brandId: string,
      brief: Brief,
      heat: number,
      platformHeat: Record<string, number>,
      sources: { title: string; url: string; platform: string }[],
    ): string {
      const id = randomUUID();
      db.prepare(
        `insert into trend_briefs
           (id, brand_id, topic, summary, why_rising, angles, heat_score,
            platform_heat, recommended_platform, recommended_format, freshness, sources)
         values (?,?,?,?,?,?,?,?,?,?,?,?)`,
      ).run(
        id,
        brandId,
        brief.topic,
        brief.summary,
        brief.why_rising,
        JSON.stringify(brief.angles),
        heat,
        JSON.stringify(platformHeat),
        brief.recommended_platform,
        brief.recommended_format,
        brief.freshness,
        JSON.stringify(sources),
      );
      return id;
    },

    listBriefs(brandId?: string): BriefRow[] {
      const rows = (
        brandId
          ? db
              .prepare(
                `select * from trend_briefs where brand_id = ? order by heat_score desc`,
              )
              .all(brandId)
          : db.prepare(`select * from trend_briefs order by heat_score desc`).all()
      ) as any[];
      return rows.map(hydrateBrief);
    },

    getBrief(id: string): BriefRow | null {
      const row = db.prepare(`select * from trend_briefs where id = ?`).get(id) as any;
      return row ? hydrateBrief(row) : null;
    },

    setBriefStatus(id: string, status: BriefRow["status"]): void {
      db.prepare(`update trend_briefs set status = ? where id = ?`).run(status, id);
    },

    // ---- content ------------------------------------------------------
    insertContent(
      brandId: string,
      briefId: string | null,
      kind: string,
      platform: string,
      body: unknown,
      parentId: string | null = null,
    ): string {
      const id = randomUUID();
      db.prepare(
        `insert into content_items (id, brand_id, brief_id, kind, platform, body, parent_id)
         values (?,?,?,?,?,?,?)`,
      ).run(id, brandId, briefId, kind, platform, JSON.stringify(body), parentId);
      return id;
    },

    updateContentBody(id: string, body: unknown): void {
      db.prepare(`update content_items set body = ? where id = ?`).run(
        JSON.stringify(body),
        id,
      );
    },

    setContentStatus(
      id: string,
      status: "draft" | "approved" | "scheduled" | "published",
      extra: { scheduledFor?: string; postizPostId?: string } = {},
    ): void {
      db.prepare(
        `update content_items set status = ?,
           scheduled_for = coalesce(?, scheduled_for),
           postiz_post_id = coalesce(?, postiz_post_id)
         where id = ?`,
      ).run(status, extra.scheduledFor ?? null, extra.postizPostId ?? null, id);
    },

    updateBrandVoice(brandId: string, voice: VoiceProfile): void {
      db.prepare(`update brands set voice_profile = ? where id = ?`).run(
        JSON.stringify(voice),
        brandId,
      );
    },

    getContent(id: string): ContentItemRow | null {
      const row = db.prepare(`select * from content_items where id = ?`).get(id) as any;
      if (!row) return null;
      return { ...row, body: JSON.parse(row.body) };
    },

    listContent(filter: { briefId?: string; parentId?: string; kind?: string; brandId?: string } = {}): ContentItemRow[] {
      const where: string[] = [];
      const args: string[] = [];
      if (filter.briefId) { where.push("brief_id = ?"); args.push(filter.briefId); }
      if (filter.parentId) { where.push("parent_id = ?"); args.push(filter.parentId); }
      if (filter.kind) { where.push("kind = ?"); args.push(filter.kind); }
      if (filter.brandId) { where.push("brand_id = ?"); args.push(filter.brandId); }
      const sql =
        `select * from content_items` +
        (where.length ? ` where ${where.join(" and ")}` : "") +
        ` order by created_at desc`;
      const rows = db.prepare(sql).all(...args) as any[];
      return rows.map((r) => ({ ...r, body: JSON.parse(r.body) }));
    },

    close() {
      db.close();
    },
  };
}

/** Idempotent column additions for databases created by phase 1. */
function migrate(db: DatabaseSync) {
  const cols = new Set(
    (db.prepare(`pragma table_info(content_items)`).all() as any[]).map((c) => c.name),
  );
  const add = (name: string, ddl: string) => {
    if (!cols.has(name)) db.exec(`alter table content_items add column ${ddl}`);
  };
  add("parent_id", "parent_id text");            // posts link to their source script
  add("scheduled_for", "scheduled_for text");
  add("postiz_post_id", "postiz_post_id text");

  const brandCols = new Set(
    (db.prepare(`pragma table_info(brands)`).all() as any[]).map((c) => c.name),
  );
  if (!brandCols.has("postiz_integrations")) {
    db.exec(`alter table brands add column postiz_integrations text not null default '{}'`);
  }
}

function hydrateBrand(row: any): BrandRow {
  return {
    id: row.id,
    name: row.name,
    positioning: row.positioning,
    sources: JSON.parse(row.sources),
    voice_profile: JSON.parse(row.voice_profile) as VoiceProfile,
    postiz_integrations: JSON.parse(row.postiz_integrations ?? "{}"),
  };
}

function hydrateBrief(row: any): BriefRow {
  return {
    id: row.id,
    brand_id: row.brand_id,
    topic: row.topic,
    summary: row.summary,
    why_rising: row.why_rising,
    angles: JSON.parse(row.angles),
    heat_score: row.heat_score,
    platform_heat: JSON.parse(row.platform_heat),
    recommended_platform: row.recommended_platform,
    recommended_format: row.recommended_format,
    freshness: row.freshness,
    sources: JSON.parse(row.sources),
    status: row.status,
    created_at: row.created_at,
  };
}
