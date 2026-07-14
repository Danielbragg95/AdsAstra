/**
 * OPTIONAL: scheduled radar sweeps via Trigger.dev (https://trigger.dev).
 * Not wired into the build — copy into a Trigger.dev project when ready.
 * Until then, any cron works:  0 */6 * * *  cd /path/to/signalwork && npm run radar
 */
// import { schedules } from "@trigger.dev/sdk/v3";
// import { openDb, runTrendRadar } from "@signalwork/engine";
//
// export const trendRadar = schedules.task({
//   id: "trend-radar",
//   cron: "0 */6 * * *",
//   run: async () => {
//     const db = openDb();
//     try {
//       for (const brand of db.listBrands()) {
//         const r = await runTrendRadar(db, brand);
//         console.log(`[${r.brand}] ${r.signals} signals → ${r.briefsWritten} briefs`);
//       }
//     } finally {
//       db.close();
//     }
//   },
// });
