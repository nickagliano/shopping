/**
 * shopping — deal watcher daemon
 *
 * Loads watchlist.json, discovers marketplace plugins, polls on an interval,
 * persists leads to leads.json, and fires the notifier for new finds.
 *
 * Also binds an HTTP server on PORT so EPC can surface a Tailscale URL and
 * perform a health check. Endpoints:
 *   GET  /health     → { status, uptime, plugins, lastPoll }
 *   GET  /leads      → leads.json as JSON
 *   GET  /watchlist  → watchlist.json as JSON
 *   POST /poll       → trigger an immediate poll and return new lead count
 */

import fs from "fs";
import http from "http";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ────────────────────────────────────────────────────────────────────

const PORT              = parseInt(process.env.PORT ?? "5555", 10);
const WATCHLIST_PATH    = path.join(__dirname, process.env.WATCHLIST    ?? "watchlist.json");
const LEADS_PATH        = path.join(__dirname, process.env.LEADS_STORE  ?? "leads.json");
const ARCHIVED_PATH     = path.join(__dirname, "archived.json");
const NOTIFIER_PATH     = path.join(__dirname, process.env.NOTIFIER     ?? "plugins/notify/stdout.js");
const MARKETPLACES_DIR  = path.join(__dirname, process.env.MARKETPLACES_DIR ?? "plugins/marketplaces");
const INTERVAL_MINUTES  = Math.min(
  parseInt(process.env.CHECK_INTERVAL_MINUTES ?? "120", 10),
  1440  // cap at 24h — setInterval uses a 32-bit int, large values overflow to ~1ms
);

// ── State ─────────────────────────────────────────────────────────────────────

const POLL_COOLDOWN_MS = 60_000; // minimum gap between poll runs

const startedAt = new Date();
let lastPoll = null;
let lastPollStarted = null;
let pollInProgress = false;
let loadedPlugins = [];

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

function loadArchived() {
  try {
    return JSON.parse(fs.readFileSync(ARCHIVED_PATH, "utf8"));
  } catch {
    return [];
  }
}

function saveArchived(keys) {
  fs.writeFileSync(ARCHIVED_PATH, JSON.stringify(keys, null, 2));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => {
      try { resolve(JSON.parse(data)); } catch { reject(new Error("Invalid JSON")); }
    });
    req.on("error", reject);
  });
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
  if (pollInProgress) {
    console.log("[shopping] Poll already in progress — skipping.");
    return 0;
  }

  const msSinceLast = lastPollStarted ? Date.now() - lastPollStarted : Infinity;
  if (msSinceLast < POLL_COOLDOWN_MS) {
    const waitSec = Math.ceil((POLL_COOLDOWN_MS - msSinceLast) / 1000);
    console.log(`[shopping] Poll cooldown — ${waitSec}s remaining.`);
    return 0;
  }

  lastPollStarted = Date.now();

  pollInProgress = true;
  let newCount = 0;

  try {
    const watchlist = loadWatchlist();
    if (!watchlist.length) {
      console.log("[shopping] Watchlist is empty — nothing to check.");
      return 0;
    }

    const existingLeads = loadLeads();
    const seenKeys = new Set([...existingLeads.map(leadKey), ...loadArchived()]);
    const newLeads = [];

    console.log(`[shopping] Polling ${plugins.length} marketplace(s) for ${watchlist.length} item(s)...`);

    for (const item of watchlist) {
      const activePlugins = item.marketplaces?.length
        ? plugins.filter((p) => item.marketplaces.includes(p.name))
        : plugins;
      for (const plugin of activePlugins) {
        try {
          const results = await plugin.search(item.keywords[0]);

          for (const lead of results) {
            const key = leadKey(lead);
            if (seenKeys.has(key)) continue;

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

    newCount = newLeads.length;
  } finally {
    pollInProgress = false;
    lastPoll = new Date().toISOString();
  }

  return newCount;
}

// ── HTTP server ───────────────────────────────────────────────────────────────

function sendJson(res, statusCode, data) {
  const body = JSON.stringify(data, null, 2);
  res.writeHead(statusCode, {
    "Content-Type": "application/json",
    "Content-Length": Buffer.byteLength(body),
  });
  res.end(body);
}

const INDEX_HTML = path.join(__dirname, "public/index.html");

function startHttpServer(plugins, notifier) {
  const server = http.createServer(async (req, res) => {
    const { method, url } = req;

    if (method === "GET" && url === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    if (method === "GET" && (url === "/" || url === "/index.html")) {
      const html = fs.readFileSync(INDEX_HTML);
      res.writeHead(200, { "Content-Type": "text/html", "Content-Length": html.length });
      return res.end(html);
    }

    if (method === "GET" && url === "/health") {
      return sendJson(res, 200, {
        status: "ok",
        uptime: Math.floor((Date.now() - startedAt.getTime()) / 1000),
        plugins: plugins.map((p) => p.name),
        lastPoll,
        pollInProgress,
      });
    }

    if (method === "GET" && url === "/leads") {
      return sendJson(res, 200, loadLeads());
    }

    if (method === "GET" && url === "/watchlist") {
      return sendJson(res, 200, loadWatchlist());
    }

    if (method === "DELETE" && url === "/watchlist") {
      try {
        const { name } = await readBody(req);
        const watchlist = loadWatchlist().filter((i) => i.name !== name);
        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
        return sendJson(res, 200, { ok: true, remaining: watchlist.length });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    if (method === "POST" && url === "/watchlist") {
      try {
        const { name, keywords, notes, marketplaces } = await readBody(req);
        if (!name?.trim()) return sendJson(res, 400, { error: "name is required" });
        const kws = Array.isArray(keywords)
          ? keywords.map((k) => String(k).trim()).filter(Boolean)
          : String(keywords ?? "").split(",").map((k) => k.trim()).filter(Boolean);
        if (!kws.length) return sendJson(res, 400, { error: "at least one keyword is required" });
        const mps = Array.isArray(marketplaces)
          ? marketplaces.map((m) => String(m).trim()).filter(Boolean)
          : [];
        const item = {
          name:         String(name).trim(),
          keywords:     kws,
          notes:        notes?.trim() || null,
          marketplaces: mps.length ? mps : undefined,
        };
        const watchlist = loadWatchlist();
        watchlist.push(item);
        fs.writeFileSync(WATCHLIST_PATH, JSON.stringify(watchlist, null, 2));
        return sendJson(res, 201, item);
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    if (method === "POST" && url === "/archive") {
      try {
        const { source, url: leadUrl } = await readBody(req);
        const key = `${source}::${leadUrl}`;
        // Remove from active leads
        const leads = loadLeads().filter((l) => leadKey(l) !== key);
        saveLeads(leads);
        // Add to archived set so it never re-appears after a poll
        const archived = loadArchived();
        if (!archived.includes(key)) archived.push(key);
        saveArchived(archived);
        return sendJson(res, 200, { ok: true, remaining: leads.length });
      } catch (e) {
        return sendJson(res, 400, { error: e.message });
      }
    }

    if (method === "POST" && url === "/poll") {
      const msSinceLast = lastPollStarted ? Date.now() - lastPollStarted : Infinity;
      if (pollInProgress || msSinceLast < POLL_COOLDOWN_MS) {
        const waitSec = Math.ceil((POLL_COOLDOWN_MS - msSinceLast) / 1000);
        return sendJson(res, 429, { error: "cooldown", retryInSeconds: Math.max(waitSec, 0) });
      }
      const newCount = await poll(plugins, notifier);
      return sendJson(res, 200, { newLeads: newCount, lastPoll });
    }

    sendJson(res, 404, { error: "Not found" });
  });

  server.listen(PORT, () => {
    console.log(`[shopping] HTTP server listening on port ${PORT}`);
    console.log(`[shopping]   GET  /health    — liveness check`);
    console.log(`[shopping]   GET  /leads     — all stored leads`);
    console.log(`[shopping]   GET  /watchlist — current watchlist`);
    console.log(`[shopping]   POST /poll      — trigger immediate poll`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`[shopping] Starting deal watcher (interval: ${INTERVAL_MINUTES}m)`);

  loadedPlugins = await loadMarketplacePlugins();
  const notifier = await import(pathToFileURL(NOTIFIER_PATH).href);

  if (!loadedPlugins.length) {
    console.warn("[shopping] No marketplace plugins found in", MARKETPLACES_DIR);
  } else {
    console.log(`[shopping] Loaded plugins: ${loadedPlugins.map((p) => p.name).join(", ")}`);
  }

  // Bind the HTTP server first so EPC health check can succeed immediately
  startHttpServer(loadedPlugins, notifier);

  // Run first poll, then schedule on interval
  await poll(loadedPlugins, notifier);
  setInterval(() => poll(loadedPlugins, notifier), INTERVAL_MINUTES * 60 * 1000);
}

main().catch((e) => {
  console.error("[shopping] Fatal error:", e);
  process.exit(1);
});
