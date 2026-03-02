/**
 * Marketplace plugin: Discogs
 *
 * Pure API approach — no web scraping:
 *   1. /database/search → up to DB_RESULTS matching release IDs  (1 API call)
 *   2. /marketplace/stats/{release_id}?curr_abbr=USD             (1 API call per release)
 *
 * Total: 1 + DB_RESULTS API calls per watchlist item.
 * Lead URL points to the sell/list page sorted by price (works fine in a real browser).
 *
 * Requires: DISCOGS_TOKEN env var (free at https://www.discogs.com/settings/developers)
 *
 * Interface: { search(query, options) -> Lead[] }
 *
 */

const BASE  = "https://api.discogs.com";
const WEB   = "https://www.discogs.com";
const TOKEN = process.env.DISCOGS_TOKEN;
const UA    = "shopping-harness/0.2.0 +local";

const DB_RESULTS = 5;  // releases to check per query → 1 + 5 = 6 API calls per item

// Discogs rate limit: 240 req/min authenticated (60-second moving window).
// 1100ms between calls → ~54 req/min, well under the limit.
const API_DELAY_MS = 1100;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ── Discogs API helper ────────────────────────────────────────────────────────

async function apiGet(path, attempt = 1) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${TOKEN}`, {
    headers: { "User-Agent": UA },
  });

  if (res.status === 429) {
    if (attempt >= 2) throw new Error(`Discogs 429 (retry exhausted): ${path}`);
    console.warn(`[discogs] Rate limited — pausing 60s then retrying`);
    await sleep(60_000);
    return apiGet(path, attempt + 1);
  }

  const remaining = parseInt(res.headers.get("X-Discogs-Ratelimit-Remaining") ?? "999", 10);
  if (remaining < 10) {
    console.warn(`[discogs] Rate limit low (${remaining} remaining) — pausing 60s`);
    await sleep(60_000);
  }

  if (!res.ok) throw new Error(`Discogs API ${res.status}: ${path}`);
  return res.json();
}

// ── Plugin entry point ────────────────────────────────────────────────────────

export async function search(query) {
  if (!TOKEN) {
    console.warn("[discogs] DISCOGS_TOKEN not set — skipping");
    return [];
  }

  // Step 1: find matching releases in the database
  let dbData;
  try {
    dbData = await apiGet(
      `/database/search?q=${encodeURIComponent(query)}&type=release&format=vinyl&per_page=${DB_RESULTS}`
    );
  } catch (e) {
    console.warn(`[discogs] DB search failed: ${e.message}`);
    return [];
  }

  await sleep(API_DELAY_MS);

  const releases = dbData.results ?? [];
  if (!releases.length) {
    console.log(`[discogs] No releases found for "${query}"`);
    return [];
  }

  const leads = [];

  for (const release of releases) {
    // Step 2: get marketplace stats for this release
    let stats;
    try {
      stats = await apiGet(`/marketplace/stats/${release.id}?curr_abbr=USD`);
      await sleep(API_DELAY_MS);
    } catch (e) {
      console.warn(`[discogs] Could not fetch stats for release ${release.id}: ${e.message}`);
      continue;
    }

    if (stats.blocked_from_sale) continue;
    if (!stats.num_for_sale) continue;

    const lowestPrice = stats.lowest_price?.value ?? null;
    if (lowestPrice === null) continue;

    leads.push({
      source:         "discogs",
      title:          release.title,
      price:          lowestPrice,
      currency:       "USD",
      shipping_price: null,   // not available from stats endpoint; shown as "TBD" in UI
      condition:      null,
      sleeve_condition: null,
      ships_from:     null,
      seller:         null,
      seller_rating:  null,
      num_for_sale:   stats.num_for_sale,
      url:            `${WEB}/sell/list?release_id=${release.id}&sort=price%2Casc`,
      found_at:       new Date().toISOString(),
    });
  }

  return leads;
}
