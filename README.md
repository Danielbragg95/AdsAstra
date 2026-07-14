# Signalwork

A trend-to-published-content marketing engine. Phases 1+2 (this repo):
trend radar agent → heat-scored briefs → two-pass voice-conditioned scripts →
per-platform repurposing (X/LinkedIn/IG/TikTok) → branded image & carousel
rendering → approve → schedule via Postiz. Review dashboard with Radar,
Studio, Queue, and Voices editor.

Runs fully **offline in mock mode** out of the box (fixture signals +
deterministic mock LLM), and switches to **live mode** the moment you add API
keys. No accounts required to try it.

## Quickstart

Requires Node >= 22.5 (uses the built-in `node:sqlite` — zero native deps).

```bash
npm install
npm run seed     # creates demo brand + first radar sweep (mock mode)
npm run dev      # dashboard at http://localhost:3000
```

Open the dashboard, hit **Generate script** on any brief, review the beats.

### CLI

```bash
npm run radar        # run a radar sweep for all brands
npm run list         # list briefs with heat scores
npm run script [id]  # generate a script (default: hottest new brief)
npm run test         # engine unit tests
./scripts/audit-web.sh   # live end-to-end audit of the dashboard (48 checks)
```

## Going live

Copy `.env.example` to `.env`, add keys, and run with the env loaded
(e.g. `env $(cat .env | xargs) npm run radar`):

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Switches LLM calls from mock to real Claude. Mock mode is automatic when absent; force with `SIGNALWORK_MOCK=1/0`. |
| `CLAUDE_MODEL` | Pin the model (never hardcoded in source). |
| `YOUTUBE_API_KEY` | Enables live YouTube trend fetching (Data API v3, free quota). |
| `SIGNALWORK_DB` | Override the SQLite path (default `data/signalwork.db`). |
| `POSTIZ_URL` + `POSTIZ_API_KEY` | Switches publishing from mock to a real Postiz instance (self-hosted or cloud). Connect your social accounts inside Postiz via OAuth. |
| `SIGNALWORK_ASSETS` | Override rendered-image dir (default `data/assets`). |

Reddit fetching uses public JSON endpoints and needs no key at low volume;
switch to OAuth for production volume.

## Layout

```
packages/engine/          the brain (importable + CLI)
  src/sources/            reddit, youtube fetchers (+ mock fixtures)
  src/scoring/            topic clustering, heat scoring
  src/llm/                Claude client + deterministic mock + JSON extraction
  src/prompts/            brief writer, script writer, voice editor, formats
  src/agents/             trendAgent (radar sweep), scriptAgent (two-pass)
  src/voice/              voice profile schema + demo brand seed
  src/db/                 node:sqlite layer (brands, trend_briefs, content_items)
apps/web/                 Next.js dashboard (Radar + Script views)
packages/engine/integrations/  Trigger.dev cron example for scheduled sweeps
scripts/audit-web.sh      self-contained live-server audit
data/                     SQLite database (gitignored)
```

## Design notes

- **Two-pass scripts**: draft against a retention format template, then a
  separate voice-editor pass against the brand's voice card. Keeping these
  separate is what removes the AI smell.
- **Heat is mechanical, judgment is LLM**: velocity/engagement/cross-platform
  z-scores are computed in code; Claude only ranks, filters, and writes angles.
- **Every model call goes through one choke point** (`src/llm/client.ts`) with
  a mock branch, so the whole pipeline is testable offline and in CI.

## Phase 2 additions

- **Repurpose agent** (`src/agents/repurposeAgent.ts`): one script fans out to
  X thread, LinkedIn post, IG caption, TikTok caption — separate call per
  platform, each voice-edited, failures isolated per platform.
- **Asset pipeline** (`src/assets/render.ts`): Satori-rendered PNGs from three
  branded templates (bold_stat, hook_card, carousel_slide) with the ember
  signature; carousels render straight from a JSON spec. Poppins bundled (OFL).
- **Publishing** (`src/publish/postiz.ts`): draft → approved → scheduled with
  hard guardrails (nothing unapproved or past-dated ships). Mock mode without
  credentials; live mode speaks Postiz's `/api/posts` contract (verified in
  tests against a real HTTP server).
- **Dashboard**: Studio on every script page (repurpose, previews,
  approve/schedule, carousel & cover generation), Queue view, Voices editor.

## Phase 2.1: multi-brand

Run any number of brands (guitar teacher, French teacher, AI agents…) side by
side, each fully isolated:

- **Brands page** (`/brands`): create, edit, and archive brands — positioning,
  trend sources, and a per-platform map of Postiz integration ids so each
  brand publishes to its OWN social accounts.
- **Brand switcher** in the masthead scopes Radar, Queue, and Voices to one
  brand (cookie-based); the all-brands view labels each brief with its brand.
- **Run radar** button sweeps trends per brand straight from the UI.
- **Publishing isolation**: `scheduleContent` resolves the owning brand's
  integration for the target platform and, in live mode, refuses to schedule
  when a brand has no account mapped for that platform.

## Roadmap

Phase 3: ElevenLabs TTS, transcript ingestion, analytics loop, calendar.
Phase 4: multi-tenant packaging. See `docs-blueprint.md`.
