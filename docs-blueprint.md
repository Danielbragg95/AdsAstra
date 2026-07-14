# Signalwork — AI Content & Marketing Engine Blueprint

*A trend-to-published-content pipeline you can run for your own projects first, then package as a product.*

---

## 1. What this is

Signalwork (working name — rename freely) reproduces and improves on the Chase-style workflow: agents watch what's trending in a niche, decide which platform has heat right now, write a video script in a specific brand voice, repurpose it into platform-native posts and visuals, and queue everything into a review dashboard where a human approves and ships. One engine, multiple "brands," each with its own voice, sources, and publishing accounts — which is exactly the shape a multi-tenant SaaS needs later.

The design principle throughout: **every stage produces a reviewable artifact, and nothing publishes without approval.** That's the difference between a marketing engine and a slop cannon, and it's also your legal/platform-ToS safety net.

The second design principle: **the voice system is the moat.** Trend scrapers and schedulers are commodities. The thing that makes output not sound like AI is a structured, per-brand voice profile that conditions every generation step. Build that as a first-class object from day one.

---

## 2. System architecture

```
                        ┌─────────────────────────────────────────┐
                        │              DASHBOARD (Next.js)         │
                        │  Trends · Scripts · Posts · Calendar     │
                        │  Voice Studio · Review Queue · Analytics │
                        └───────────────▲─────────────────────────┘
                                        │ Postgres (Supabase)
 ┌──────────────┐   ┌───────────────┐  │  ┌────────────────┐   ┌─────────────┐
 │ TREND AGENT  │──▶│ SCRIPT AGENT  │──┼─▶│ REPURPOSE AGENT│──▶│ ASSET AGENT │
 │ (scheduled)  │   │ (on demand /  │  │  │ (per platform) │   │ (images,    │
 │ Reddit, YT,  │   │  on approval) │  │  │ X, LI, IG, TT, │   │ carousels,  │
 │ X, TikTok,   │   │ voice-        │  │  │ Shorts, Reddit │   │ thumbnails, │
 │ Google Trends│   │ conditioned   │  │  │                │   │ TTS, video) │
 └──────────────┘   └───────────────┘  │  └────────────────┘   └─────────────┘
        all agents = Claude API + tools, orchestrated by Trigger.dev jobs
                                        │
                        ┌───────────────▼─────────────────────────┐
                        │        PUBLISHER (Postiz, self-hosted)   │
                        │  OAuth per platform · schedule · publish │
                        │  · pull analytics back into dashboard    │
                        └─────────────────────────────────────────┘
```

Everything is one TypeScript monorepo. Agents are background jobs, not chat sessions — they run on schedules or triggers, write their outputs to Postgres, and the dashboard is just a nice window onto that database plus buttons that fire the next job.

### Why these choices

**Claude API for all agent reasoning.** Tool use, long context for digesting scraped content, and strong writing. Use Sonnet for research/repurposing volume work and Opus-tier only for final script drafts if you find Sonnet's scripts lacking. Verify current model names and pricing at docs.claude.com when you build — they change.

**Trigger.dev for orchestration** (alternative: Inngest). You get cron schedules, retries, long-running jobs, human-in-the-loop "wait for approval" primitives, and a run dashboard for free. This beats hand-rolling queues, and beats n8n for your purposes because the product you eventually ship is code, not a workflow file. If you want to prototype a stage in n8n first to validate it, fine — but build the real thing in code.

**Postiz for publishing.** Open-source, self-hostable, and this matters enormously for packaging: it supports X, Bluesky, Mastodon, Discord and other platforms, users authenticate directly with each social platform via official OAuth flows, and it exposes a public API, SDK, and MCP server so you can drive it from automations or build your own posting app on top of it. You never touch the nightmare of maintaining five platform APIs and app-review processes yourself. Self-hosted on a small VPS or Railway it runs on the order of $5–10/month. Ayrshare is the paid managed alternative if you'd rather not host it.

**Supabase (Postgres) for state.** Auth, row-level security for multi-tenancy later, storage for generated images, realtime for live dashboard updates.

**Next.js + Tailwind + shadcn/ui for the dashboard.** Boring and correct. The Obsidian dashboard in Chase's setup is a symptom of not having a product — you're building the product, so build a real UI, and offer an optional "export to Obsidian vault" as a nice-to-have (it's trivial: write markdown files to a folder).

---

## 3. The six modules, stage by stage

### Module A — Trend Research Agent

**Job:** every N hours per brand, gather signals, score them, and write 3–7 "trend briefs" to the database, each with a recommended platform and angle.

Sources, in order of value-per-dollar:

| Source | How | Cost | Notes |
|---|---|---|---|
| Reddit | Official API (OAuth, free tier) | Free | Best signal for niche communities. Pull hot/top from subreddits per brand + keyword search. |
| YouTube | Data API v3 | Free (10k units/day quota) | Search recent uploads by keyword, sort by view velocity (views ÷ hours since publish). Also `mostPopular` per category. |
| Google Trends | `pytrends`-style unofficial libs or SerpAPI | Free–$ | Rising queries confirm whether a topic is climbing or fading. |
| X/Twitter | Official API basic tier OR Apify actor | $$$ or ~$ | Official API is expensive for read access; an Apify scraper actor is the pragmatic start. Revisit for the packaged product (ToS exposure). |
| TikTok | TikTok Creative Center trends via Apify actor | ~$ | No good official trends API. Creative Center is the richest public trend surface. |
| General web | Exa or Tavily search API | ~$5–20/mo | Lets the agent ask open questions like "what happened in <niche> this week." |

The agent loop: fetch raw signals → deduplicate/cluster by topic → for each cluster compute a heat score → have Claude rank and write briefs. Heat scoring should be mostly mechanical (the LLM is bad at math, good at judgment):

```
heat = w1·zscore(mention_velocity) + w2·zscore(engagement_rate)
     + w3·cross_platform_count + w4·trends_rising_flag − w5·age_decay
```

Then Claude gets the top ~15 clusters with their stats and writes briefs:

```
Trend Brief
- topic, one-line summary, why it's rising
- heat score + per-platform activity breakdown  ← "where is the heat right now"
- recommended primary platform + format (long-form YT, Short, X thread, carousel)
- 3 candidate angles for THIS brand (uses the brand's positioning doc)
- freshness window estimate (act within 24h / this week / evergreen)
- source links
```

**Key schema:**

```sql
create table brands (
  id uuid primary key default gen_random_uuid(),
  name text, positioning text,          -- what we sell, to whom, POV
  sources jsonb,                        -- subreddits, YT keywords, X queries…
  voice_profile jsonb,                  -- see Module F
  created_at timestamptz default now()
);

create table trend_briefs (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands,
  topic text, summary text, angles jsonb,
  heat_score numeric, platform_heat jsonb,   -- {"tiktok": 0.9, "yt": 0.6, ...}
  recommended_platform text, freshness text,
  sources jsonb, status text default 'new',  -- new|shortlisted|used|dismissed
  created_at timestamptz default now()
);
```

### Module B — Script Agent

**Job:** turn an approved trend brief into a ready-to-record (or ready-to-TTS) video script.

This is a two-pass generation, and the second pass is what kills the AI smell:

1. **Draft pass.** Claude gets: the trend brief, the brand positioning, the voice profile (Module F), and a *format template* — a proven retention structure, e.g. for faceless YouTube: cold-open hook (first 15s answers "why should I keep watching"), stakes, 3–5 beats each with a mini-payoff, open loop before the midpoint, CTA that matches the platform. Store several templates (explainer, listicle, story-driven, hot-take/reaction) as prompt fragments.
2. **Voice pass.** A second Claude call whose *only* job is editing: "Rewrite to match this voice card. Kill every phrase on the banned list. Vary sentence length. Read it aloud in your head — flag anything a human wouldn't say." Separating drafting from voice-editing consistently outperforms doing both at once.

Output structure (store as JSON, render as markdown in the dashboard):

```json
{
  "title_options": ["...", "...", "..."],
  "hook": "...",
  "beats": [{ "heading": "...", "vo_text": "...", "broll_suggestion": "..." }],
  "cta": "...",
  "estimated_runtime_sec": 480,
  "shorts_cutdowns": [{ "hook": "...", "vo_text": "..." }]
}
```

The `broll_suggestion` per beat is what makes the faceless/headless format cheap to produce — it feeds Module D's video assembly and Pexels/Storyblocks search.

### Module C — Repurpose Agent

**Job:** one approved script (or an existing published video) fans out into platform-native posts.

Two entry points:

*From your own script:* the script JSON is already structured; each platform generator is a separate Claude call with a platform brief ("X thread: 5–9 tweets, hook tweet must work standalone, no hashtags, one idea per tweet…"). Never generate all platforms in one call — quality drops and you can't regenerate one without regenerating all.

*From an existing video (yours or a competitor's):* pull the transcript with `youtube-transcript-api` (or run Whisper on your own file), summarize to a beat sheet, then run the same per-platform generators. This gives you the "summarize videos and draft posts" capability in the original workflow.

Each generated post row carries `status: draft → approved → scheduled → published` and a `platform_payload` matching what Postiz's API expects, so approval in the dashboard is literally one API call away from scheduled.

```sql
create table content_items (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid references brands,
  brief_id uuid references trend_briefs,
  kind text,              -- script|x_thread|li_post|ig_caption|tt_caption|short
  platform text, body jsonb, assets jsonb,
  status text default 'draft',
  postiz_post_id text, scheduled_for timestamptz,
  performance jsonb,      -- backfilled from analytics
  created_at timestamptz default now()
);
```

### Module D — Asset Agent (images, carousels, voice, video)

**Covers, thumbnails, carousel slides — use templates, not raw image-gen, as the default.** Brand consistency comes from deterministic rendering: define 4–6 branded layouts as React components, render them to PNG with **Satori** (or `@vercel/og`) or Puppeteer. Claude's job is only to fill the template slots (headline ≤ 8 words, subhead, slide-by-slide copy for carousels). This is faster, free, and always on-brand. Layer AI image generation (Flux via **fal.ai** or **Replicate**; **Ideogram** when you need legible text baked into the image) on top for hero imagery when a template isn't enough.

Carousel = JSON in, PNGs out:

```json
{ "template": "bold-stat", "slides": [
  { "headline": "...", "body": "...", "accent_stat": "73%" }, ...
]}
```

**Voice (TTS) — this is the "feed the tool good voice" step.** ElevenLabs remains the quality leader: clone your own voice (or design a brand voice) once, then every script's `vo_text` renders to audio via API. Alternatives worth benchmarking at build time: OpenAI TTS (cheap), Cartesia (fast/cheap, good quality). Two rules that keep TTS from sounding like slop: write the script *for the ear* (the voice-pass prompt should enforce contractions, short sentences, spoken rhythm), and insert SSML-ish pacing (pauses after hooks, emphasis on payoffs) rather than feeding a wall of text.

**Video assembly (optional, phase 3).** For headless videos: **Remotion** (React → video, full control, renders in your infra) or a managed JSON-to-video API (Creatomate, JSON2Video) if you don't want render infrastructure. Pipeline: TTS audio + b-roll pulled from the Pexels API using each beat's `broll_suggestion` + captions from the script → rendered MP4 → review queue. Even without this module, the engine already outputs script + audio + thumbnail, which is 80% of the production work.

### Module E — Publisher & analytics loop

Self-host Postiz next to the app. Users (you, then customers) connect each social account through Postiz's OAuth — you never store platform credentials. Approving a post in your dashboard calls Postiz's REST API to schedule it; the API takes a post payload with content, target integration IDs, and a publish date. Postiz pulls per-post analytics (impressions, likes, comments, shares, engagement) from each network's official insights API — sync those back into `content_items.performance` nightly.

Close the loop: feed performance data back to the Trend Agent ("angles like X are outperforming for this brand") and the Script Agent ("hooks structured like Y got the best retention"). This feedback loop is a real product differentiator and almost nobody does it well.

### Module F — Voice Studio (the moat)

A voice profile is a structured document, not a vibe. Schema:

```json
{
  "identity": "First-person builder documenting the journey; confident, never salesy.",
  "audience": "Solo founders and indie hackers, technical-adjacent.",
  "tone_axes": { "formal_casual": 0.8, "playful_serious": 0.6, "bold_measured": 0.7 },
  "sentence_rhythm": "Mostly short. Occasional long sentence for payoff. Fragments allowed.",
  "vocabulary": { "use": ["ship", "wire up", "the math on this"], 
                  "ban": ["delve", "game-changer", "in today's fast-paced world",
                          "unlock", "leverage (as a verb)", "🚀 in every post"] },
  "signature_moves": ["open with a specific number or moment, never a question",
                      "one self-deprecating aside per piece, max"],
  "example_passages": ["<3-5 real samples of the voice, 100-200 words each>"],
  "platform_overrides": { "linkedin": { "formal_casual": 0.5 } }
}
```

The Voice Studio UI does three things: (1) **ingest** — paste past posts/transcripts and have Claude *propose* a profile you edit; (2) **tune** — sliders and banned-word lists; (3) **calibrate** — side-by-side blind test: same brief rendered in 3 voice variants, you pick, the profile updates. Every generation call in Modules B–D injects the active profile. When you package this, "clone your voice in 10 minutes" is the onboarding wow moment.

---

## 4. Dashboard

One Next.js app, five views. Keep it opinionated and fast rather than configurable.

**Radar** — today's trend briefs as cards, sorted by heat, with per-platform heat bars and freshness badges. Actions: shortlist → "Generate script" / "Generate posts" / dismiss.
**Studio** — script editor (rendered beats, inline regenerate-this-beat, "punch up hook" quick actions) and the repurposed-post grid with per-platform previews.
**Calendar** — scheduled content across platforms (reads from Postiz), drag to reschedule.
**Voices** — the Voice Studio above.
**Pulse** — performance: what shipped, how it did, which angles/hooks win.

Design direction (so it looks "simple yet cool," not default-shadcn): pick one signature element — a good candidate is the *heat visualization language* (a consistent ember-gradient bar used for trend heat, platform heat, and post performance, so the whole app reads as one instrument for measuring heat). Dark, quiet UI around it; one characterful display face for headings, a clean body face; everything else disciplined. Avoid the stock AI-app look (cream + terracotta, or black + acid green).

---

## 5. Build roadmap

**Phase 1 — The spine (1–2 weekends).** Monorepo (Turborepo: `apps/web`, `apps/jobs`, `packages/db`, `packages/prompts`). Supabase schema above. Trigger.dev job: Reddit + YouTube fetchers → heat scoring → Claude brief-writing → rows in `trend_briefs`. Minimal dashboard: Radar view + a "Generate script" button that runs Module B with a hardcoded voice profile. *You now have the core value: wake up to ranked trend briefs and one-click scripts.*

**Phase 2 — Fan-out and publish (2–3 weeks of evenings).** Repurpose Agent with 4 platform generators. Deploy Postiz (Railway one-click or a Hetzner VPS + Docker Compose), connect your accounts, wire approve→schedule. Satori template renderer with 3 layouts + carousel JSON pipeline. Voice profiles move from hardcoded to DB + a basic Voices editor.

**Phase 3 — Production polish.** ElevenLabs TTS integration; transcript-ingestion path (summarize any video → posts); analytics sync from Postiz into Pulse; the calibration (blind A/B) flow in Voice Studio; optionally Remotion video assembly for full headless output. Add X/TikTok trend sources via Apify.

**Phase 4 — Package it.** Supabase RLS multi-tenancy (brands → workspaces → users), Stripe, onboarding = create brand → paste positioning → voice ingest → connect socials via Postiz OAuth → first Radar run while they watch. Pricing shape that fits the cost structure: ~$49/mo solo (1 brand), ~$149/mo studio (5 brands + video). Your marginal costs are LLM tokens, image gen, and TTS — meter video minutes and TTS characters on higher tiers.

---

## 6. Starter code

**Trigger.dev trend job (condensed):**

```ts
// apps/jobs/src/trendRadar.ts
import { schedules } from "@trigger.dev/sdk/v3";
import Anthropic from "@anthropic-ai/sdk";
import { fetchReddit, fetchYouTube, fetchTrends } from "./sources";
import { clusterTopics, heatScore } from "./scoring";
import { db } from "@repo/db";

export const trendRadar = schedules.task({
  id: "trend-radar",
  cron: "0 */6 * * *", // every 6h
  run: async () => {
    const brands = await db.brands.findMany({ where: { active: true } });
    for (const brand of brands) {
      const raw = (await Promise.allSettled([
        fetchReddit(brand.sources.subreddits),
        fetchYouTube(brand.sources.ytKeywords),
        fetchTrends(brand.sources.keywords),
      ])).flatMap(r => r.status === "fulfilled" ? r.value : []);

      const clusters = clusterTopics(raw);                 // embedding-based
      const top = clusters.map(c => ({ ...c, heat: heatScore(c) }))
                          .sort((a, b) => b.heat - a.heat).slice(0, 15);

      const client = new Anthropic();
      const msg = await client.messages.create({
        model: process.env.CLAUDE_MODEL!,   // pin in env; verify current names
        max_tokens: 4000,
        system: briefWriterSystemPrompt(brand), // positioning + brief JSON schema
        messages: [{ role: "user", content: JSON.stringify(top) }],
      });

      const briefs = parseBriefs(msg);      // strict JSON parse w/ zod
      await db.trend_briefs.createMany({
        data: briefs.map(b => ({ ...b, brand_id: brand.id })),
      });
    }
  },
});
```

**Two-pass script generation:**

```ts
export async function generateScript(brief: Brief, brand: Brand, format: Format) {
  const draft = await claude({
    system: `You write video scripts. Brand: ${brand.positioning}
Format template:\n${format.template}\nReturn the script JSON schema only.`,
    user: JSON.stringify(brief),
  });

  const voiced = await claude({
    system: `You are a ruthless voice editor. Rewrite the script to match this
voice card exactly. Remove every banned phrase. Vary sentence length.
Write for the ear: contractions, spoken rhythm. Do not add new claims.
VOICE CARD:\n${JSON.stringify(brand.voice_profile)}`,
    user: draft,
  });

  return scriptSchema.parse(JSON.parse(voiced)); // zod
}
```

**Approve → schedule via Postiz:**

```ts
export async function scheduleToPostiz(item: ContentItem, when: Date) {
  const res = await fetch(`${process.env.POSTIZ_URL}/api/posts`, {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.POSTIZ_KEY}`,
               "Content-Type": "application/json" },
    body: JSON.stringify({
      type: "post",
      date: when.toISOString(),
      posts: [{ id: item.postizIntegrationId, content: renderBody(item) }],
    }),
  });
  const { id } = await res.json();
  await db.content_items.update({ where: { id: item.id },
    data: { status: "scheduled", postiz_post_id: id, scheduled_for: when } });
}
```

---

## 7. Services & running cost (solo, all brands = yours)

| Service | Role | Est. monthly |
|---|---|---|
| Claude API | All agent reasoning/writing | $20–80 depending on volume |
| Supabase | DB, auth, storage | Free–$25 |
| Trigger.dev | Job orchestration | Free–$20 |
| Vercel | Dashboard hosting | Free–$20 |
| Postiz (self-hosted, Railway/Hetzner) | Publishing + analytics | $5–10 |
| Reddit / YouTube / Google Trends | Trend sources | Free |
| Apify (X + TikTok scrapers) | Trend sources | $10–30 |
| Exa or Tavily | Open web search for agents | $5–20 |
| fal.ai / Replicate (Flux) + Ideogram | Hero images | $5–20 |
| ElevenLabs | Voice cloning + TTS | $5–22 (Starter/Creator) |
| Pexels API | B-roll | Free |

Realistic total: **~$60–180/mo** running it seriously for several brands — which is what makes the $49–149 SaaS pricing work with healthy margin per customer. Prices drift; verify each at signup.

## 8. Risks & honest caveats

Scraping X/TikTok via third-party actors sits in a ToS gray zone — fine for personal research, but for the packaged product either budget for official API access or lean on the sources with official APIs (Reddit, YouTube, Trends) plus Postiz's compliant analytics. Platform APIs and AI-model names/prices change constantly; keep them behind env config and a `providers/` abstraction so swapping ElevenLabs↔Cartesia or model versions is a one-line change. And the failure mode of every tool in this category is publishing volume without taste — the review queue and voice calibration aren't optional features, they're the product.
