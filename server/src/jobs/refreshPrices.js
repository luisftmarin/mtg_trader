// Nightly price refresh. Scryfall updates Cardmarket prices once a day.
//
// Run locally:            npm run refresh-prices
// Railway cron service:   node src/jobs/refreshPrices.js   (schedule 0 4 * * *)
import { refreshPrices } from "../scryfall.js";
import { pool } from "../db.js";

const started = Date.now();
try {
  const { refreshed, not_found } = await refreshPrices();
  console.log(`Refreshed ${refreshed} cards in ${Math.round((Date.now() - started) / 1000)}s.`);
  if (not_found.length) console.log(`Not found on Scryfall: ${not_found.join(", ")}`);
} catch (err) {
  console.error("Price refresh failed:", err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
