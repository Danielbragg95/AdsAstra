# Getting Started — from zero to publishing

Follow in order. Stop at the end of any part and you still have a working system.

## Part 1 — Run it locally (10 min, no keys needed)

1. Install Node 22.5+ from https://nodejs.org (check: `node --version`)
2. Clone and run:
   ```bash
   git clone https://github.com/Danielbragg95/AdsAstra.git
   cd AdsAstra
   npm install
   npm run seed        # demo brand + first radar sweep (offline mock mode)
   npm run dev         # open http://localhost:3000
   ```
3. Tour it: **Radar** → hit *Generate script* on a brief → in the script's
   **Studio** hit *Repurpose*, *Generate carousel*, *Generate voiceover* →
   approve a post → *Schedule +1h* → see it in **Queue** → *Sync metrics* →
   see it ranked in **Pulse**. Everything you just did was mock mode.
4. Sanity check any time: `npm test` (30 tests) and `./scripts/audit-web.sh`
   (69 live checks — run `npm run build` first).

## Part 2 — Turn on the real brain (15 min)

1. `cp .env.example .env`
2. **Claude API key** (powers all agents): https://console.anthropic.com →
   API Keys → create → paste into `ANTHROPIC_API_KEY`. Add ~$10 credit.
3. **YouTube key** (free trend source): https://console.cloud.google.com →
   create project → enable "YouTube Data API v3" → Credentials → API key →
   paste into `YOUTUBE_API_KEY`. (Reddit needs no key.)
4. Restart with the env loaded:
   ```bash
   set -a; source .env; set +a
   npm run dev
   ```
5. Go to **Brands**, create your real brands (guitar, French, Vailot) with
   their subreddits/keywords, then hit *Run radar* — briefs are now real
   trends, scripts are real Claude writing.
6. Go to **Voices** for each brand: fill the voice card (paste 2-3 example
   passages of how you actually write — this matters most), then run
   *Calibrate voice* a few rounds.

## Part 3 — Real voiceover (10 min, optional)

1. https://elevenlabs.io → Starter plan → clone your voice (or pick one) →
   copy the voice id and an API key into `ELEVENLABS_API_KEY` /
   `ELEVENLABS_VOICE_ID` in `.env`.
2. Restart, generate a voiceover in any Studio, and LISTEN — this is the
   seam that was never audible during the build. If pacing is off, tweak
   `prepareForSpeech` in `packages/engine/src/tts/index.ts`.

## Part 4 — Real publishing via Postiz (30-45 min)

1. Deploy Postiz (easiest: Railway one-click template, or Docker on a VPS —
   see https://docs.postiz.com). Note its URL.
2. In Postiz, connect each brand's social accounts (their OAuth flows).
3. In Postiz settings, create an API key → put the URL + key into
   `POSTIZ_URL` / `POSTIZ_API_KEY` in `.env`.
4. In Postiz, each connected account has an integration id — copy each one
   into the matching brand on the **Brands** page (x / linkedin / instagram /
   tiktok fields). This is what keeps brands publishing to their own accounts;
   live mode refuses to schedule any platform you haven't mapped.
5. Schedule one low-stakes test post, confirm it appears in Postiz's calendar
   and publishes. Then hit *Sync metrics* after it's live and check one raw
   response against `packages/engine/src/analytics/index.ts` field aliases
   (see README "Verify at home").

## Part 5 — Always-on hosting (a $5 VPS beats your PC)

The heavy lifting (Claude, ElevenLabs) happens on their servers — the app
itself is light. A Hetzner/DigitalOcean box (~$5/mo) makes sweeps run 24/7
and the dashboard reachable from your phone.

1. Create the smallest Ubuntu VPS; install Docker (`curl -fsSL
   https://get.docker.com | sh`).
2. `git clone https://github.com/Danielbragg95/AdsAstra.git && cd AdsAstra`
3. Create `.env` with your keys (Part 2-4), then:
   ```bash
   docker compose up -d --build
   ```
   That starts the dashboard on port 3000 plus a `radar` service that sweeps
   every 6 hours into the shared volume. (The compose layer-sequence and both
   service commands are audit-verified; the `docker build` itself is a
   verify-at-home step since the build environment has no Docker daemon.)
4. Postiz: run its official compose alongside
   (https://docs.postiz.com) and point `POSTIZ_URL` at it.
5. IMPORTANT — the dashboard has no login yet. Don't expose port 3000 to the
   world: either keep the firewall closed and use Tailscale (free) to reach
   it from your devices, or put HTTP basic-auth in front via Caddy/nginx.
6. Metrics on a schedule (host crontab):
   `15 6 * * * curl -s -X POST http://localhost:3000/api/sync`

No Docker? Plain cron works too: `0 */6 * * * cd /path/to/AdsAstra && npm run radar`

## If something breaks

`npm test` and `./scripts/audit-web.sh` isolate whether it's the engine, the
dashboard, or your keys. Mock mode (`SIGNALWORK_MOCK=1`) always works offline —
if mock works and live doesn't, it's a key or network issue, not the code.
