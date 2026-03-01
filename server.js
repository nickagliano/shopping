/**
 * shopping — deal watcher daemon
 *
 * Loads watchlist.json, discovers marketplace plugins, polls on an interval,
 * persists leads to leads.json, and fires the notifier for new finds.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const WATCHLIST_PATH    = path.join(__dirname, process.env.WATCHLIST    ?? "watchlist.json");
const LEADS_PATH        = path.join(__dirname, process.env.LEADS_STORE  ?? "leads.json");
const NOTIFIER_PATH     = path.join(__dirname, process.env.NOTIFIER     ?? "plugins/notify/stdout.js");
const MARKETPLACES_DIR  = path.join(__dirname, process.env.MARKETPLACES_DIR ?? "plugins/marketplaces");
const INTERVAL_MINUTES  = Math.min(
  parseInt(process.env.CHECK_INTERVAL_MINUTES ?? "120", 10),
  1440  // cap at 24h — setInterval uses a 32-bit int, large values overflow to ~1ms
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function loadWatchlist() {
  try {
    return JSON.parse(fs.readFileSync(WATCHLIST_PATH, "utf8"));
  } catch {
    console.error(`[shopping] Could not read watchlist at ${WATCHLIST_PATH}`);
    return [];
  }
}

function loadLeads() {
  try {
    return JSON.parse(fs.readFileSync(LEADS_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveLeads(leads) {
  fs.writeFileSync(LEADS_PATH, JSON.stringify(leads, null, 2));
}

function leadKey(lead) {
  // Deduplicate by source + URL so we don't re-notify for the same listing
  return `${lead.source}::${lead.url}`;
}

async function loadMarketplacePlugins() {
  if (!fs.existsSync(MARKETPLACES_DIR)) return [];

  const files = fs.readdirSync(MARKETPLACES_DIR).filter((f) => f.endsWith(".js"));
  const plugins = [];

  for (const file of files) {
    try {
      const mod = await import(pathToFileURL(path.join(MARKETPLACES_DIR, file)).href);
      if (typeof mod.search === "function") {
        plugins.push({ name: path.basename(file, ".js"), search: mod.search });
      } else {
        console.warn(`[shopping] ${file} has no search() export — skipping`);
      }
    } catch (e) {
      console.warn(`[shopping] Failed to load plugin ${file}: ${e.message}`);
    }
  }

  return plugins;
}

// ── Core poll ─────────────────────────────────────────────────────────────────

async function poll(plugins, notifier) {
  const watchlist = loadWatchlist();
  if (!watchlist.length) {
    console.log("[shopping] Watchlist is empty — nothing to check.");
    return;
  }

  const existingLeads = loadLeads();
  const seenKeys = new Set(existingLeads.map(leadKey));
  const newLeads = [];

  console.log(`[shopping] Polling ${plugins.length} marketplace(s) for ${watchlist.length} item(s)...`);

  for (const item of watchlist) {
    for (const plugin of plugins) {
      try {
        const results = await plugin.search(item.keywords[0], {
          max_price: item.max_price,
        });

        for (const lead of results) {
          const key = leadKey(lead);
          if (seenKeys.has(key)) continue;

          // Filter by max_price if set
          if (item.max_price && lead.price > item.max_price) continue;

          seenKeys.add(key);
          newLeads.push({ ...lead, watchlist_item: item.name });

          notifier.notify({
            type: "lead",
            message: `New lead for "${item.name}": ${lead.title} — $${lead.price} on ${lead.source}`,
            url: lead.url,
          });
        }
      } catch (e) {
        console.warn(`[shopping] ${plugin.name} errored for "${item.name}": ${e.message}`);
      }
    }
  }

  if (newLeads.length) {
    saveLeads([...existingLeads, ...newLeads]);
    console.log(`[shopping] Found ${newLeads.length} new lead(s).`);
  } else {
    console.log("[shopping] No new leads this pass.");
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[shopping] Starting deal watcher (interval: ${INTERVAL_MINUTES}m)`);

  const plugins  = await loadMarketplacePlugins();
  const notifier = await import(pathToFileURL(NOTIFIER_PATH).href);

  if (!plugins.length) {
    console.warn("[shopping] No marketplace plugins found in", MARKETPLACES_DIR);
  } else {
    console.log(`[shopping] Loaded plugins: ${plugins.map((p) => p.name).join(", ")}`);
  }

  // Run immediately on start, then on the interval
  await poll(plugins, notifier);
  setInterval(() => poll(plugins, notifier), INTERVAL_MINUTES * 60 * 1000);
}

main().catch((e) => {
  console.error("[shopping] Fatal error:", e);
  process.exit(1);
});
