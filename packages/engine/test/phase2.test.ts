import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { openDb } from "../src/db/index.ts";
import { demoBrandSeed } from "../src/voice/default.ts";
import { generateScript } from "../src/agents/scriptAgent.ts";
import { repurposeScript, renderPostBody } from "../src/agents/repurposeAgent.ts";
import { POST_KINDS, XThreadSchema } from "../src/types.ts";

process.env.SIGNALWORK_MOCK = "1";

function freshDb() {
  return openDb(join(mkdtempSync(join(tmpdir(), "sw2-")), "test.db"));
}

function seedBrief(db: ReturnType<typeof openDb>, brandId: string) {
  return db.insertBrief(
    brandId,
    {
      topic: "Voice cloning for creators",
      summary: "s",
      why_rising: "w",
      angles: [{ angle: "Contrarian take on voice cloning", why_it_fits: "f" }],
      recommended_platform: "youtube",
      recommended_format: "long-form explainer",
      freshness: "this_week",
    },
    0.8,
    { youtube: 0.7 },
    [],
  );
}

test("repurpose fans a script into all four platform posts", async () => {
  const db = freshDb();
  const brand = db.createBrand(demoBrandSeed);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await generateScript(db, brand, brief);
  const scriptItem = db.getContent(contentId)!;

  const results = await repurposeScript(db, brand, scriptItem);
  assert.equal(results.length, 4);
  for (const r of results) {
    assert.ok(r.ok, `${r.kind} failed: ${r.error}`);
    const item = db.getContent(r.contentId)!;
    assert.equal(item.parent_id, contentId);
    assert.equal(item.brief_id, brief.id);
    assert.equal(item.status, "draft");
    assert.equal(item.platform, POST_KINDS[r.kind].platform);
    POST_KINDS[r.kind].schema.parse(item.body); // validates shape
  }

  // children discoverable via parent filter
  const children = db.listContent({ parentId: contentId });
  assert.equal(children.length, 4);
  db.close();
});

test("repurpose subset only generates requested kinds", async () => {
  const db = freshDb();
  const brand = db.createBrand(demoBrandSeed);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await generateScript(db, brand, brief);
  const results = await repurposeScript(db, brand, db.getContent(contentId)!, ["x_thread"]);
  assert.equal(results.length, 1);
  const thread = XThreadSchema.parse(db.getContent(results[0].contentId)!.body);
  assert.ok(thread.tweets.length >= 2);
  assert.ok(thread.tweets.every((t) => t.length <= 280));
  db.close();
});

test("migration is idempotent and preserves phase 1 rows", () => {
  const path = join(mkdtempSync(join(tmpdir(), "sw2m-")), "test.db");
  let db = openDb(path);
  const brand = db.createBrand(demoBrandSeed);
  const cid = db.insertContent(brand.id, null, "script", "youtube", { hook: "h" });
  db.close();

  db = openDb(path); // re-open: migrate() runs again on existing columns
  const item = db.getContent(cid)!;
  assert.equal(item.parent_id, null);
  assert.equal(item.scheduled_for, null);
  db.setContentStatus(cid, "scheduled", {
    scheduledFor: "2026-07-20T09:00:00Z",
    postizPostId: "pz_1",
  });
  const after = db.getContent(cid)!;
  assert.equal(after.status, "scheduled");
  assert.equal(after.postiz_post_id, "pz_1");
  db.close();
});

test("renderPostBody produces plain text per kind", () => {
  assert.equal(renderPostBody("x_thread", { tweets: ["a", "b"] }), "a\n\n---\n\nb");
  assert.equal(renderPostBody("li_post", { post: "hello" }), "hello");
  assert.equal(
    renderPostBody("ig_caption", { caption: "c", hashtags: ["one", "#two"] }),
    "c\n\n#one #two",
  );
  assert.equal(renderPostBody("tt_caption", { caption: "t", on_screen_hook: "x" }), "t");
});

// ---- asset rendering -------------------------------------------------------
import { renderTemplate, renderCarousel } from "../src/assets/render.ts";
import { generateCarouselAssets } from "../src/agents/assetAgent.ts";
import { generateScript as genScript2 } from "../src/agents/scriptAgent.ts";
import { readFileSync } from "node:fs";

process.env.SIGNALWORK_ASSETS = join(mkdtempSync(join(tmpdir(), "sw-assets-")), "a");

test("renderTemplate produces valid PNGs at requested dimensions", async () => {
  const a = await renderTemplate("hook_card", { headline: "Test headline", subhead: "sub", brand: "b" }, "wide");
  assert.equal(a.width, 1280);
  assert.equal(a.height, 720);
  const buf = readFileSync(a.path);
  assert.deepEqual([...buf.subarray(0, 4)], [0x89, 0x50, 0x4e, 0x47], "PNG magic bytes");
  assert.ok(a.bytes > 5000, "non-trivial image");
});

test("renderCarousel renders one slide per spec entry with correct indices", async () => {
  const assets = await renderCarousel({
    brand: "b",
    slides: [
      { kicker: "one", headline: "First", body: "" },
      { kicker: "two", headline: "Second", body: "x" },
      { kicker: "three", headline: "Third", body: "y" },
    ],
  });
  assert.equal(assets.length, 3);
  for (const a of assets) assert.equal(a.width, 1080);
});

test("template slots are validated (headline too long rejected)", async () => {
  await assert.rejects(
    renderTemplate("bold_stat", { stat: "x".repeat(50), headline: "h" }),
    /too_big|invalid/i,
  );
});

test("asset agent persists carousel content linked to script", async () => {
  const db = freshDb();
  const brand = db.createBrand(demoBrandSeed);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await genScript2(db, brand, brief);
  const { contentId: carId, assets } = await generateCarouselAssets(db, brand, db.getContent(contentId)!);
  const row = db.getContent(carId)!;
  assert.equal(row.kind, "carousel");
  assert.equal(row.parent_id, contentId);
  assert.equal((row.body as any).files.length, assets.length);
  assert.ok(assets.length >= 4);
  db.close();
});

// ---- publishing ------------------------------------------------------------
import { approveContent, scheduleContent, postizSchedule } from "../src/publish/postiz.ts";
import { repurposeScript as repurpose2 } from "../src/agents/repurposeAgent.ts";
import { createServer } from "node:http";

async function makeApprovedPost(db: ReturnType<typeof openDb>) {
  const brand = db.createBrand(demoBrandSeed);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await genScript2(db, brand, brief);
  const [r] = await repurpose2(db, brand, db.getContent(contentId)!, ["x_thread"]);
  const item = db.getContent(r.contentId)!;
  approveContent(db, item);
  return db.getContent(r.contentId)!;
}

test("workflow: draft→approved→scheduled with mock postiz", async () => {
  const db = freshDb();
  const item = await makeApprovedPost(db);
  assert.equal(item.status, "approved");

  const when = new Date(Date.now() + 3600e3);
  const res = await scheduleContent(db, item, when);
  assert.ok(res.ok, res.error);
  assert.equal(res.mode, "mock");

  const after = db.getContent(item.id)!;
  assert.equal(after.status, "scheduled");
  assert.equal(after.scheduled_for, when.toISOString());
  assert.ok(after.postiz_post_id!.startsWith("mock_"));
  db.close();
});

test("guardrails: cannot schedule drafts, past times, or non-post kinds", async () => {
  const db = freshDb();
  const brand = db.createBrand(demoBrandSeed);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await genScript2(db, brand, brief);

  // script kind is not schedulable even if approved
  const script = db.getContent(contentId)!;
  const r1 = await scheduleContent(db, script, new Date(Date.now() + 1e6));
  assert.equal(r1.ok, false);
  assert.match(r1.error!, /approve first|not schedulable/);

  // draft post cannot schedule
  const [rp] = await repurpose2(db, brand, script, ["li_post"]);
  const draft = db.getContent(rp.contentId)!;
  const r2 = await scheduleContent(db, draft, new Date(Date.now() + 1e6));
  assert.equal(r2.ok, false);
  assert.match(r2.error!, /approve first/);

  // approved but past time
  approveContent(db, draft);
  const r3 = await scheduleContent(db, db.getContent(rp.contentId)!, new Date(Date.now() - 1e6));
  assert.equal(r3.ok, false);
  assert.match(r3.error!, /future/);

  // double-approve rejected
  assert.throws(() => approveContent(db, db.getContent(rp.contentId)!), /cannot approve/);
  db.close();
});

test("live mode sends the exact payload Postiz expects", async () => {
  let captured: any = null;
  let auth = "";
  const server = createServer((req, res) => {
    auth = req.headers.authorization ?? "";
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = { url: req.url, method: req.method, body: JSON.parse(body) };
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "pz_real_123" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;

  const res = await postizSchedule(
    { integrationId: "int_42", content: "hello world", date: "2026-08-01T09:00:00.000Z" },
    { url: `http://localhost:${port}`, apiKey: "secret-key" },
  );
  server.close();

  assert.ok(res.ok);
  assert.equal(res.mode, "live");
  assert.equal(res.postizPostId, "pz_real_123");
  assert.equal(auth, "Bearer secret-key");
  assert.equal(captured.url, "/api/posts");
  assert.equal(captured.method, "POST");
  assert.equal(captured.body.type, "post");
  assert.equal(captured.body.date, "2026-08-01T09:00:00.000Z");
  assert.deepEqual(captured.body.posts, [{ id: "int_42", content: "hello world" }]);
});

test("live mode surfaces http errors without corrupting state", async () => {
  const server = createServer((_req, res) => {
    res.writeHead(401);
    res.end("bad key");
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;

  const db = freshDb();
  const item = await makeApprovedPost(db);
  process.env.POSTIZ_URL = `http://localhost:${port}`;
  process.env.POSTIZ_API_KEY = "wrong";
  // explicit integration id so we get past mapping resolution to the HTTP error
  const res = await scheduleContent(db, item, new Date(Date.now() + 1e6), "int_explicit");
  delete process.env.POSTIZ_URL;
  delete process.env.POSTIZ_API_KEY;
  server.close();

  assert.equal(res.ok, false);
  assert.match(res.error!, /401/);
  assert.equal(db.getContent(item.id)!.status, "approved"); // unchanged
  db.close();
});

// ---- phase 2.1: multi-brand ------------------------------------------------
import { BrandInputSchema } from "../src/types.ts";

const guitarBrand = {
  ...demoBrandSeed,
  name: "Fretwork — Guitar Lessons",
  positioning: "We teach working adults to actually finish learning guitar with 15-minute structured daily practice systems.",
  postiz_integrations: { x: "int_guitar_x", instagram: "int_guitar_ig" },
};

test("brands are isolated: briefs, content, and updates don't cross", async () => {
  const db = freshDb();
  const a = db.createBrand(demoBrandSeed);
  const b = db.createBrand(guitarBrand);

  const briefA = seedBrief(db, a.id);
  seedBrief(db, b.id);
  assert.equal(db.listBriefs(a.id).length, 1);
  assert.equal(db.listBriefs(b.id).length, 1);
  assert.equal(db.listBriefs().length, 2);

  const { contentId } = await genScript2(db, a, db.getBrief(briefA)!);
  assert.equal(db.listContent({ brandId: a.id }).length, 1);
  assert.equal(db.listContent({ brandId: b.id }).length, 0);

  db.updateBrand(b.id, { ...b, positioning: b.positioning + " Updated." });
  assert.ok(db.getBrand(b.id)!.positioning.endsWith("Updated."));
  assert.ok(!db.getBrand(a.id)!.positioning.endsWith("Updated."));

  db.archiveBrand(b.id);
  assert.equal(db.listBrands().length, 1);
  assert.equal(db.listBrands()[0].id, a.id);
  void contentId;
  db.close();
});

test("brand postiz mapping survives roundtrip + migration adds column to old DBs", () => {
  const path = join(mkdtempSync(join(tmpdir(), "sw21-")), "test.db");
  let db = openDb(path);
  const b = db.createBrand(guitarBrand);
  db.close();
  db = openDb(path); // migrate() re-runs
  assert.deepEqual(db.getBrand(b.id)!.postiz_integrations, {
    x: "int_guitar_x",
    instagram: "int_guitar_ig",
  });
  db.close();
});

test("scheduleContent uses the owning brand's integration id in live mode", async () => {
  let captured: any = null;
  const server = createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      captured = JSON.parse(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ id: "pz_9" }));
    });
  });
  await new Promise<void>((r) => server.listen(0, r));
  const port = (server.address() as any).port;

  const db = freshDb();
  const brand = db.createBrand(guitarBrand);
  const brief = db.getBrief(seedBrief(db, brand.id))!;
  const { contentId } = await genScript2(db, brand, brief);
  const [r] = await repurpose2(db, brand, db.getContent(contentId)!, ["x_thread"]);
  approveContent(db, db.getContent(r.contentId)!);

  process.env.POSTIZ_URL = `http://localhost:${port}`;
  process.env.POSTIZ_API_KEY = "k";
  const res = await scheduleContent(db, db.getContent(r.contentId)!, new Date(Date.now() + 1e6));

  assert.ok(res.ok, res.error);
  assert.equal(captured.posts[0].id, "int_guitar_x"); // the brand's own account

  // platform with NO mapping must refuse in live mode
  const [r2] = await repurpose2(db, brand, db.getContent(contentId)!, ["li_post"]);
  approveContent(db, db.getContent(r2.contentId)!);
  const res2 = await scheduleContent(db, db.getContent(r2.contentId)!, new Date(Date.now() + 1e6));
  assert.equal(res2.ok, false);
  assert.match(res2.error!, /no Postiz integration configured/);

  delete process.env.POSTIZ_URL;
  delete process.env.POSTIZ_API_KEY;
  server.close();
  db.close();
});

test("BrandInputSchema rejects junk and fills defaults", () => {
  assert.throws(() => BrandInputSchema.parse({ name: "x", positioning: "short" }));
  const ok = BrandInputSchema.parse({
    name: "Allez French",
    positioning: "French for busy anglophones through daily micro-immersion videos.",
    sources: { subreddits: ["French"], ytKeywords: [], keywords: [] },
    voice_profile: { identity: "warm tutor", audience: "adult learners" },
  });
  assert.deepEqual(ok.postiz_integrations, {});
});
