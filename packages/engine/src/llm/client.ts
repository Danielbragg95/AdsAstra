import { isMock } from "../sources/mock.ts";

export interface LlmCall {
  system: string;
  user: string;
  maxTokens?: number;
}

/**
 * Single choke point for all model calls. Real mode uses the Anthropic SDK;
 * mock mode routes to a deterministic generator so the whole pipeline runs
 * offline (tests, demos, CI). Model name is env-pinned, never hardcoded.
 */
export async function llm(call: LlmCall): Promise<string> {
  if (isMock()) return mockLlm(call);

  const { default: Anthropic } = await import("@anthropic-ai/sdk");
  const client = new Anthropic();
  const msg = await client.messages.create({
    model: process.env.CLAUDE_MODEL ?? "claude-sonnet-4-6",
    max_tokens: call.maxTokens ?? 4000,
    system: call.system,
    messages: [{ role: "user", content: call.user }],
  });
  return msg.content
    .filter((b) => b.type === "text")
    .map((b) => ("text" in b ? b.text : ""))
    .join("\n");
}

/** Extracts the first JSON object/array from a model reply (handles fences). */
export function extractJson(text: string): unknown {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.search(/[[{]/);
  if (start === -1) throw new Error("No JSON found in model output");
  // walk to the matching close bracket
  const open = candidate[start];
  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inStr = false;
  let esc = false;
  for (let i = start; i < candidate.length; i++) {
    const ch = candidate[i];
    if (inStr) {
      if (esc) esc = false;
      else if (ch === "\\") esc = true;
      else if (ch === '"') inStr = false;
      continue;
    }
    if (ch === '"') inStr = true;
    else if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) return JSON.parse(candidate.slice(start, i + 1));
    }
  }
  throw new Error("Unbalanced JSON in model output");
}

// ---------------------------------------------------------------------------
// Mock generator: inspects the system prompt to decide which shape to return.
// Deterministic, derived from the actual input, so demos feel real.
// ---------------------------------------------------------------------------
function mockLlm(call: LlmCall): string {
  if (call.system.includes("TREND ANALYST")) {
    const clusters = JSON.parse(call.user) as {
      label: string;
      platforms: string[];
      heat: number;
    }[];
    const briefs = clusters.slice(0, 6).map((c) => {
      const topic = c.label.replace(/ - .*$/, "").slice(0, 80);
      const primary = c.platforms[0] ?? "youtube";
      return {
        topic,
        summary: `${topic} is drawing outsized attention right now across ${c.platforms.join(
          ", ",
        )}.`,
        why_rising: `Multiple high-velocity posts in the last 48h; discussion-to-view ratios are above the niche baseline.`,
        angles: [
          {
            angle: `Contrarian take: what everyone gets wrong about "${topic.toLowerCase()}"`,
            why_it_fits: "Positions the brand as the clear-eyed operator in a hype cycle.",
          },
          {
            angle: `Build-in-public demo tied to ${topic.toLowerCase()}`,
            why_it_fits: "Matches the audience's preference for shown-not-told proof.",
          },
          {
            angle: `Beginner's field guide to ${topic.toLowerCase()}`,
            why_it_fits: "Search-friendly evergreen capture of the trend's tail.",
          },
        ],
        recommended_platform: primary,
        recommended_format: primary === "youtube" ? "long-form explainer" : "text thread",
        freshness: c.heat > 0.65 ? "act_within_24h" : c.heat > 0.4 ? "this_week" : "evergreen",
      };
    });
    return JSON.stringify({ briefs });
  }

  if (call.system.includes("SCRIPT WRITER")) {
    const brief = JSON.parse(call.user) as { topic: string; angles: { angle: string }[] };
    const angle = brief.angles?.[0]?.angle ?? brief.topic;
    return JSON.stringify({
      title_options: [
        `${brief.topic}: What Nobody Tells You`,
        `I Tested ${brief.topic} So You Don't Have To`,
        `The Honest Truth About ${brief.topic}`,
      ],
      hook: `Everyone is talking about ${brief.topic.toLowerCase()} this week. Almost all of them are missing the one detail that actually matters — and it took me 30 days to find it.`,
      beats: [
        {
          heading: "The setup",
          vo_text: `Here's the state of play. ${brief.topic} blew up in the last few days, and the takes are everywhere. Before you copy anyone's playbook, you need the context most videos skip.`,
          broll_suggestion: "screen recording scrolling trending posts on the topic",
        },
        {
          heading: "The angle",
          vo_text: `${angle}. That's the frame for everything that follows, and it changes which tools and tactics are actually worth your time.`,
          broll_suggestion: "whiteboard-style overlay of the core framework",
        },
        {
          heading: "The proof",
          vo_text: `I ran the numbers instead of guessing. Here's what the data shows — and where the popular advice quietly falls apart.`,
          broll_suggestion: "animated chart of engagement data",
        },
        {
          heading: "The playbook",
          vo_text: `So here's the exact sequence I'd run this week if I were starting from zero. Three steps. No fluff.`,
          broll_suggestion: "numbered checklist motion graphic",
        },
      ],
      cta: "If you want the full breakdown and templates, the link is in the description. Subscribe if this saved you a rabbit hole.",
      estimated_runtime_sec: 420,
      shorts_cutdowns: [
        {
          hook: `The one thing everyone gets wrong about ${brief.topic.toLowerCase()}:`,
          vo_text: "Thirty seconds, one idea, straight to the payoff — cut from beat 3.",
        },
      ],
    });
  }

  if (call.system.includes("PLATFORM WRITER")) {
    const src = JSON.parse(call.user) as {
      title: string;
      hook: string;
      beats: { heading: string; vo_text: string }[];
      cta: string;
    };
    const topic = src.title.replace(/: What Nobody Tells You$/, "");
    if (call.system.includes("[x_thread]")) {
      return JSON.stringify({
        tweets: [
          `I spent 30 days on ${topic.toLowerCase()}. Most of the popular advice quietly failed.`,
          ...src.beats.slice(0, 4).map(
            (b) => `${b.heading}: ${b.vo_text.split(". ")[0]}.`.slice(0, 260),
          ),
          `Full breakdown in the video — the numbers surprised me. Link below.`,
        ],
      });
    }
    if (call.system.includes("[li_post]")) {
      return JSON.stringify({
        post: `30 days ago I started testing ${topic.toLowerCase()}.\n\n${src.beats
          .slice(0, 3)
          .map((b) => `${b.heading}: ${b.vo_text.split(". ")[0]}.`)
          .join("\n\n")}\n\nThe biggest lesson: run the numbers before copying anyone's playbook.\n\nWhat's the last tactic you tested that didn't survive contact with real data?`,
      });
    }
    if (call.system.includes("[ig_caption]")) {
      return JSON.stringify({
        caption: `The truth about ${topic.toLowerCase()} — in 4 slides.\n\nSwipe for what the data actually shows, and the 3-step playbook I'd run this week.`,
        hashtags: ["contentstrategy", "creatoreconomy", "aitools", "solopreneur"],
      });
    }
    if (call.system.includes("[tt_caption]")) {
      return JSON.stringify({
        caption: `Tested ${topic.toLowerCase()} for 30 days so you don't have to #creatortips`,
        on_screen_hook: "everyone gets this wrong",
      });
    }
  }

  if (call.system.includes("ASSET WRITER")) {
    const src = JSON.parse(call.user) as {
      title: string;
      hook: string;
      beats?: { heading: string; vo_text: string }[];
    };
    const topic = src.title.replace(/: What Nobody Tells You$/, "");
    if (call.system.includes("[carousel]")) {
      const beats = src.beats ?? [];
      return JSON.stringify({
        brand: "",
        slides: [
          { kicker: "the truth", headline: `${shorten(topic, 6)} in 4 slides`, body: "What the loudest takes keep missing — and the numbers behind it." },
          ...beats.slice(0, 3).map((b, i) => ({
            kicker: `part ${i + 1}`,
            headline: shorten(b.heading, 8),
            body: shorten(b.vo_text, 26),
          })),
          { kicker: "takeaway", headline: "Run the numbers first", body: "Save this and test it on your next post before copying any playbook." },
        ],
      });
    }
    return JSON.stringify({
      headline: shorten(topic, 8),
      subhead: "The honest breakdown, tested for 30 days",
      brand: "",
    });
  }

  if (call.system.includes("TRANSCRIPT ANALYST")) {
    const src = JSON.parse(call.user) as { title: string; transcript: string };
    const paras = src.transcript
      .split(/\n\n+|(?<=[.!?])\s+(?=[A-Z])/)
      .map((p) => p.trim())
      .filter((p) => p.length > 60);
    const n = Math.max(3, Math.min(5, Math.floor(paras.length / 2) || 3));
    const step = Math.max(1, Math.floor(paras.length / n));
    const beats = Array.from({ length: n }, (_, i) => {
      const p = paras[Math.min(i * step, paras.length - 1)] ?? src.transcript.slice(0, 200);
      return {
        heading: shorten(p, 5),
        vo_text: p.split(/(?<=[.!?])\s/).slice(0, 3).join(" ").slice(0, 400),
        broll_suggestion: "supporting b-roll for: " + shorten(p, 8),
      };
    });
    const title = src.title || shorten(paras[0] ?? "Transcript breakdown", 7);
    return JSON.stringify({
      title_options: [title, `${title} — the breakdown`, `What ${shorten(title, 4)} really says`],
      hook: `This video makes one claim worth stealing — and buries it. Here's the clean version in ${n} beats.`,
      beats,
      cta: "Full source linked. Subscribe for one distilled breakdown like this a week.",
      estimated_runtime_sec: n * 90,
      shorts_cutdowns: [{ hook: "the buried claim:", vo_text: beats[0].vo_text.slice(0, 200) }],
    });
  }

  if (call.system.includes("CALIBRATION WRITER")) {
    const brandMatch = call.system.match(/BRAND: (.+)/);
    const name = brandMatch ? brandMatch[1] : "this brand";
    if (call.system.includes("[B]")) {
      return `Here's the deal. ${name} exists for one reason: results you can count. No theory dumps. No hedging. We test, we measure, we ship what survives. Every post you'll see here earned its place with data. Stick around if you're done guessing.`;
    }
    if (call.system.includes("[C]")) {
      return `Hey — welcome in. If you've ever felt like you're the only one who can't make this stuff click, you're exactly who ${name} is for. We figure it out together, one small win at a time, and we keep it honest about what's hard. Glad you're here.`;
    }
    return `${name} documents what actually works. We run the experiments, keep the receipts, and share the numbers — the wins and the faceplants. If you want a clear-eyed look at this space without the hype tax, you're in the right place.`;
  }

  if (call.system.includes("VOICE EDITOR")) {
    // In mock mode we simulate the edit pass as a light rewrite marker:
    // real mode rewrites fully against the voice card.
    return call.user;
  }

  throw new Error("Mock LLM: unrecognized system prompt");
}

function shorten(text: string, maxWords: number): string {
  const words = text.replace(/[.:]+$/, "").split(/\s+/);
  return words.slice(0, maxWords).join(" ");
}
