import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { assetDir } from "../assets/render.ts";
import { ScriptSchema, type BrandRow, type ContentItemRow } from "../types.ts";
import type { EngineDb } from "../db/index.ts";

export interface TtsSegment {
  label: string;      // "hook", "beat 1", "cta"…
  text: string;
  file: string;       // filename inside assetDir()
  seconds: number;
  bytes: number;
}

export interface TtsResult {
  ok: boolean;
  provider: "mock" | "elevenlabs";
  segments: TtsSegment[];
  error?: string;
}

export function ttsProvider(): "mock" | "elevenlabs" {
  return process.env.ELEVENLABS_API_KEY ? "elevenlabs" : "mock";
}

/** Words-per-second speaking pace used for pause math and mock duration. */
const WPS = 2.5;

// ---------------------------------------------------------------------------
// Mock provider: writes REAL playable WAVs (soft tone, duration ∝ word count)
// so the whole pipeline — storage, manifest, players — is exercised offline.
// ---------------------------------------------------------------------------
function mockWav(text: string): { data: Buffer; seconds: number } {
  const words = text.split(/\s+/).filter(Boolean).length;
  const seconds = Math.min(60, Math.max(1, words / WPS));
  const rate = 22050;
  const n = Math.floor(rate * seconds);
  const pcm = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) {
    const t = i / rate;
    // gentle two-tone hum with a fade in/out so it's obviously a placeholder
    const env = Math.min(1, t * 4, (seconds - t) * 4);
    const s = (Math.sin(2 * Math.PI * 196 * t) + 0.4 * Math.sin(2 * Math.PI * 294 * t)) * 0.12 * env;
    pcm.writeInt16LE(Math.round(s * 32767), i * 2);
  }
  const header = Buffer.alloc(44);
  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);        // PCM
  header.writeUInt16LE(1, 22);        // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28); // byte rate
  header.writeUInt16LE(2, 32);        // block align
  header.writeUInt16LE(16, 34);       // bits
  header.write("data", 36);
  header.writeUInt32LE(pcm.length, 40);
  return { data: Buffer.concat([header, pcm]), seconds };
}

// ---------------------------------------------------------------------------
// ElevenLabs provider. UNVERIFIED-AT-BUILD: this environment cannot reach
// api.elevenlabs.io, so the request shape follows their published v1 API and
// must be smoke-tested with a real key at home (see README).
// ---------------------------------------------------------------------------
async function elevenlabsSynth(
  text: string,
  cfg: { apiKey: string; voiceId: string; baseUrl?: string },
): Promise<{ data: Buffer; seconds: number }> {
  const base = (cfg.baseUrl ?? "https://api.elevenlabs.io").replace(/\/$/, "");
  const res = await fetch(`${base}/v1/text-to-speech/${cfg.voiceId}`, {
    method: "POST",
    headers: {
      "xi-api-key": cfg.apiKey,
      "Content-Type": "application/json",
      Accept: "audio/mpeg",
    },
    body: JSON.stringify({
      text,
      model_id: process.env.ELEVENLABS_MODEL ?? "eleven_multilingual_v2",
      voice_settings: { stability: 0.5, similarity_boost: 0.75 },
    }),
  });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`elevenlabs ${res.status}: ${t.slice(0, 200)}`);
  }
  const data = Buffer.from(await res.arrayBuffer());
  const words = text.split(/\s+/).filter(Boolean).length;
  return { data, seconds: Math.max(1, words / WPS) };
}

/** Prepares spoken text: strips markdown-ish noise, adds breath pauses after
 *  hooks/payoffs via punctuation (works for both mock timing and real TTS). */
export function prepareForSpeech(text: string): string {
  return text
    .replace(/\s+/g, " ")
    .replace(/[*_#`]/g, "")
    .replace(/ — /g, "… ")
    .trim();
}

/** Synthesizes a full script into per-segment audio + a manifest content item. */
export async function synthesizeScript(
  db: EngineDb,
  brand: BrandRow,
  scriptItem: ContentItemRow,
): Promise<{ contentId: string; result: TtsResult }> {
  const script = ScriptSchema.parse(scriptItem.body);
  const provider = ttsProvider();
  const parts: { label: string; text: string }[] = [
    { label: "hook", text: script.hook },
    ...script.beats.map((b, i) => ({ label: `beat ${i + 1} — ${b.heading}`, text: b.vo_text })),
    { label: "cta", text: script.cta },
  ];

  mkdirSync(assetDir(), { recursive: true });
  const segments: TtsSegment[] = [];
  try {
    for (const p of parts) {
      const text = prepareForSpeech(p.text);
      let data: Buffer;
      let seconds: number;
      let ext: string;
      if (provider === "elevenlabs") {
        const r = await elevenlabsSynth(text, {
          apiKey: process.env.ELEVENLABS_API_KEY!,
          voiceId: process.env.ELEVENLABS_VOICE_ID ?? "",
          baseUrl: process.env.ELEVENLABS_BASE_URL,
        });
        data = r.data;
        seconds = r.seconds;
        ext = "mp3";
      } else {
        const r = mockWav(text);
        data = r.data;
        seconds = r.seconds;
        ext = "wav";
      }
      const file = `vo-${randomUUID()}.${ext}`;
      writeFileSync(resolve(assetDir(), file), data);
      segments.push({
        label: p.label,
        text,
        file,
        seconds: Math.round(seconds * 10) / 10,
        bytes: data.length,
      });
    }
  } catch (e) {
    return {
      contentId: "",
      result: {
        ok: false,
        provider,
        segments,
        error: e instanceof Error ? e.message : String(e),
      },
    };
  }

  const contentId = db.insertContent(
    brand.id,
    scriptItem.brief_id,
    "voiceover",
    scriptItem.platform,
    {
      provider,
      voice: process.env.ELEVENLABS_VOICE_ID ?? "mock",
      segments,
      total_seconds: Math.round(segments.reduce((a, s) => a + s.seconds, 0) * 10) / 10,
    },
    scriptItem.id,
  );
  return { contentId, result: { ok: true, provider, segments } };
}
