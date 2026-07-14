import satori from "satori";
import { Resvg } from "@resvg/resvg-js";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { z } from "zod";

const here = dirname(fileURLToPath(import.meta.url));
const FONT_DIR = resolve(here, "../../assets/fonts");
const REPO_ROOT = resolve(here, "../../../..");

export function assetDir(): string {
  return resolve(process.env.SIGNALWORK_ASSETS ?? resolve(REPO_ROOT, "data/assets"));
}

let fontsCache: { name: string; data: Buffer; weight: 400 | 500 | 700; style: "normal" }[] | null =
  null;
function fonts() {
  fontsCache ??= [
    { name: "Poppins", data: readFileSync(resolve(FONT_DIR, "Poppins-Regular.ttf")), weight: 400, style: "normal" },
    { name: "Poppins", data: readFileSync(resolve(FONT_DIR, "Poppins-Medium.ttf")), weight: 500, style: "normal" },
    { name: "Poppins", data: readFileSync(resolve(FONT_DIR, "Poppins-Bold.ttf")), weight: 700, style: "normal" },
  ];
  return fontsCache;
}

// ---- sizes ---------------------------------------------------------------

export const SIZES = {
  square: { width: 1080, height: 1080 }, // IG feed / carousel
  wide: { width: 1280, height: 720 },    // YT thumbnail
  story: { width: 1080, height: 1920 },  // reels / stories cover
} as const;
export type SizeKey = keyof typeof SIZES;

// ---- palette (mirrors the dashboard identity) ------------------------------

const C = {
  ink: "#0c0f15",
  panel: "#131824",
  edge: "#1f2736",
  text: "#e8ebf1",
  dim: "#8b93a7",
  ember1: "#b8722c",
  ember2: "#f0993e",
  ember3: "#ff6a3d",
  emberHot: "#ff4d2e",
};
const EMBER = `linear-gradient(135deg, ${C.ember1}, ${C.ember3})`;

// ---- template slot schemas -------------------------------------------------

export const BoldStatSlots = z.object({
  stat: z.string().max(12),        // "73%" / "30 days" / "$0"
  headline: z.string().max(90),
  kicker: z.string().max(40).default(""),
  brand: z.string().max(40).default(""),
});

export const HookCardSlots = z.object({
  headline: z.string().max(120),
  subhead: z.string().max(140).default(""),
  brand: z.string().max(40).default(""),
});

export const CarouselSlideSlots = z.object({
  kicker: z.string().max(40).default(""),
  headline: z.string().max(90),
  body: z.string().max(220).default(""),
  index: z.number().int().min(1),
  total: z.number().int().min(1),
  brand: z.string().max(40).default(""),
});

export const CarouselSchema = z.object({
  brand: z.string().default(""),
  slides: z
    .array(z.object({ kicker: z.string().default(""), headline: z.string(), body: z.string().default("") }))
    .min(2)
    .max(10),
});
export type CarouselSpec = z.infer<typeof CarouselSchema>;

export const TEMPLATES = ["bold_stat", "hook_card", "carousel_slide"] as const;
export type TemplateName = (typeof TEMPLATES)[number];

// ---- element builders (satori accepts plain react-shaped objects) ----------

const el = (type: string, style: Record<string, unknown>, children?: unknown) => ({
  type,
  props: { style, ...(children !== undefined ? { children } : {}) },
});

/** thin ember bar — the brand signature carried into every asset */
const emberBar = (width: number | string = 160) =>
  el("div", { width, height: 10, borderRadius: 5, backgroundImage: EMBER });

const footer = (brand: string, right?: string) =>
  el(
    "div",
    {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      width: "100%",
    },
    [
      el(
        "div",
        { fontSize: 26, color: C.dim, letterSpacing: 4, textTransform: "uppercase", display: "flex" },
        brand || " ",
      ),
      right
        ? el("div", { fontSize: 26, color: C.dim, letterSpacing: 2, display: "flex" }, right)
        : el("div", { display: "flex" }, " "),
    ],
  );

function boldStat(slots: z.infer<typeof BoldStatSlots>, size: SizeKey) {
  const { width, height } = SIZES[size];
  // length-aware: "73%" renders huge, "30 days" scales down to stay on one line
  const statSize = Math.min(
    Math.round(height * 0.28),
    Math.round((width * 1.35) / Math.max(3, slots.stat.length)),
  );
  return el(
    "div",
    {
      width,
      height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: C.ink,
      padding: Math.round(width * 0.08),
      fontFamily: "Poppins",
    },
    [
      el(
        "div",
        { fontSize: 30, color: C.dim, letterSpacing: 6, textTransform: "uppercase", display: "flex" },
        slots.kicker || " ",
      ),
      el("div", { display: "flex", flexDirection: "column", gap: 28 }, [
        el(
          "div",
          {
            fontSize: statSize,
            fontWeight: 700,
            lineHeight: 1,
            display: "flex",
            backgroundImage: EMBER,
            backgroundClip: "text",
            color: "transparent",
          },
          slots.stat,
        ),
        el(
          "div",
          { fontSize: Math.round(height * 0.062), fontWeight: 500, color: C.text, lineHeight: 1.25, display: "flex" },
          slots.headline,
        ),
        emberBar(),
      ]),
      footer(slots.brand),
    ],
  );
}

function hookCard(slots: z.infer<typeof HookCardSlots>, size: SizeKey) {
  const { width, height } = SIZES[size];
  return el(
    "div",
    {
      width,
      height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: C.ink,
      padding: Math.round(width * 0.08),
      fontFamily: "Poppins",
      borderBottom: `18px solid ${C.ember3}`,
    },
    [
      emberBar(120),
      el("div", { display: "flex", flexDirection: "column", gap: 30 }, [
        el(
          "div",
          { fontSize: Math.round(height * 0.085), fontWeight: 700, color: C.text, lineHeight: 1.15, display: "flex" },
          slots.headline,
        ),
        slots.subhead
          ? el("div", { fontSize: Math.round(height * 0.042), color: C.dim, lineHeight: 1.4, display: "flex" }, slots.subhead)
          : el("div", { display: "flex" }, " "),
      ]),
      footer(slots.brand),
    ],
  );
}

function carouselSlide(slots: z.infer<typeof CarouselSlideSlots>, size: SizeKey) {
  const { width, height } = SIZES[size];
  const dots = Array.from({ length: slots.total }, (_, i) =>
    el("div", {
      width: 18,
      height: 18,
      borderRadius: 9,
      backgroundColor: i + 1 === slots.index ? C.ember3 : C.edge,
    }),
  );
  return el(
    "div",
    {
      width,
      height,
      display: "flex",
      flexDirection: "column",
      justifyContent: "space-between",
      backgroundColor: C.ink,
      padding: Math.round(width * 0.085),
      fontFamily: "Poppins",
    },
    [
      el(
        "div",
        { display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" },
        [
          el(
            "div",
            { fontSize: 28, color: C.ember2, letterSpacing: 5, textTransform: "uppercase", display: "flex" },
            slots.kicker || " ",
          ),
          el(
            "div",
            { fontSize: 28, color: C.dim, display: "flex" },
            `${slots.index}/${slots.total}`,
          ),
        ],
      ),
      el("div", { display: "flex", flexDirection: "column", gap: 34 }, [
        el(
          "div",
          { fontSize: Math.round(height * 0.07), fontWeight: 700, color: C.text, lineHeight: 1.18, display: "flex" },
          slots.headline,
        ),
        slots.body
          ? el("div", { fontSize: Math.round(height * 0.038), color: C.dim, lineHeight: 1.5, display: "flex" }, slots.body)
          : el("div", { display: "flex" }, " "),
      ]),
      el("div", { display: "flex", flexDirection: "column", gap: 26, width: "100%" }, [
        el("div", { display: "flex", gap: 12 }, dots),
        footer(slots.brand),
      ]),
    ],
  );
}

// ---- public API ------------------------------------------------------------

export interface RenderedAsset {
  file: string;      // filename inside assetDir()
  path: string;      // absolute path
  width: number;
  height: number;
  bytes: number;
}

export async function renderTemplate(
  template: TemplateName,
  slots: unknown,
  size: SizeKey = "square",
): Promise<RenderedAsset> {
  const { width, height } = SIZES[size];
  let element: any;
  if (template === "bold_stat") element = boldStat(BoldStatSlots.parse(slots), size);
  else if (template === "hook_card") element = hookCard(HookCardSlots.parse(slots), size);
  else element = carouselSlide(CarouselSlideSlots.parse(slots), size);

  const svg = await satori(element, { width, height, fonts: fonts() });
  const png = new Resvg(svg, { fitTo: { mode: "width", value: width } }).render().asPng();

  mkdirSync(assetDir(), { recursive: true });
  const file = `${template}-${randomUUID()}.png`;
  const path = resolve(assetDir(), file);
  writeFileSync(path, png);
  return { file, path, width, height, bytes: png.length };
}

/** Renders a whole carousel spec to N slide PNGs. */
export async function renderCarousel(
  spec: CarouselSpec,
  size: SizeKey = "square",
): Promise<RenderedAsset[]> {
  const parsed = CarouselSchema.parse(spec);
  const out: RenderedAsset[] = [];
  for (let i = 0; i < parsed.slides.length; i++) {
    const s = parsed.slides[i];
    out.push(
      await renderTemplate(
        "carousel_slide",
        {
          kicker: s.kicker,
          headline: s.headline,
          body: s.body,
          index: i + 1,
          total: parsed.slides.length,
          brand: parsed.brand,
        },
        size,
      ),
    );
  }
  return out;
}
