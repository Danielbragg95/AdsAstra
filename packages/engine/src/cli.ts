#!/usr/bin/env tsx
import { openDb } from "./db/index.ts";
import { runTrendRadar } from "./agents/trendAgent.ts";
import { generateScript } from "./agents/scriptAgent.ts";
import { demoBrandSeed } from "./voice/default.ts";
import { isMock } from "./sources/mock.ts";

const [, , cmd, arg] = process.argv;

async function main() {
  const db = openDb();
  console.log(`[signalwork] mode=${isMock() ? "MOCK (no API keys needed)" : "LIVE"}`);

  switch (cmd) {
    case "seed": {
      let brands = db.listBrands();
      if (brands.length === 0) {
        const b = db.createBrand(demoBrandSeed);
        console.log(`Seeded brand: ${b.name} (${b.id})`);
        brands = [b];
      } else {
        console.log(`Brands already exist (${brands.length}), skipping seed.`);
      }
      for (const brand of brands) {
        const r = await runTrendRadar(db, brand);
        console.log(
          `Radar [${r.brand}]: ${r.signals} signals → ${r.clusters} clusters → ${r.briefsWritten} briefs`,
        );
      }
      break;
    }

    case "radar": {
      const brands = db.listBrands();
      if (brands.length === 0) {
        console.error("No brands. Run `npm run seed` first.");
        process.exit(1);
      }
      for (const brand of brands) {
        const r = await runTrendRadar(db, brand);
        console.log(
          `Radar [${r.brand}]: ${r.signals} signals → ${r.clusters} clusters → ${r.briefsWritten} briefs`,
        );
      }
      break;
    }

    case "script": {
      const briefId = arg ?? db.listBriefs().find((b) => b.status === "new")?.id;
      if (!briefId) {
        console.error("No brief id given and no new briefs found.");
        process.exit(1);
      }
      const brief = db.getBrief(briefId);
      if (!brief) {
        console.error(`Brief not found: ${briefId}`);
        process.exit(1);
      }
      const brand = db.getBrand(brief.brand_id)!;
      const { contentId, script } = await generateScript(db, brand, brief);
      console.log(`Script generated → content_items/${contentId}`);
      console.log(`  Title: ${script.title_options[0]}`);
      console.log(`  Beats: ${script.beats.length}, runtime ~${script.estimated_runtime_sec}s`);
      break;
    }

    case "list": {
      for (const b of db.listBriefs()) {
        console.log(
          `${b.heat_score.toFixed(2)}  [${b.status}]  ${b.topic}  → ${b.recommended_platform} (${b.freshness})  ${b.id}`,
        );
      }
      break;
    }

    default:
      console.log(`Usage:
  npm run seed           seed demo brand + first radar sweep
  npm run radar          run a radar sweep for all brands
  npm run script [id]    generate a script for a brief (default: hottest new)
  npm run list           list briefs`);
  }

  db.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
