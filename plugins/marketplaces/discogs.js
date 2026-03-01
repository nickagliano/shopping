/**
 * Marketplace plugin: Discogs
 *
 * Searches the Discogs database for vinyl releases matching the query, then
 * fetches each release to get its current marketplace stats (lowest price,
 * number of copies for sale). Surfaces any release that has copies available
 * within the max_price as a lead, with a direct link to its listings page.
 *
 * Requires: DISCOGS_TOKEN env var (free at https://www.discogs.com/settings/developers)
 *
 * Interface: { search(query, options) -> Lead[] }
 *   options: { max_price? }
 */

const BASE = "https://api.discogs.com";
const TOKEN = process.env.DISCOGS_TOKEN;
const USER_AGENT = "shopping-harness/0.2.0";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function get(path, attempt = 1) {
  const sep = path.includes("?") ? "&" : "?";
  const res = await fetch(`${BASE}${path}${sep}token=${TOKEN}`, {
    headers: { "User-Agent": USER_AGENT },
  });

  // On 429, wait for the 60-second moving average window to reset and retry once.
  if (res.status === 429) {
    if (attempt >= 2) throw new Error(`Discogs API 429 (retry exhausted): ${path}`);
    console.warn(`[discogs] Rate limited — pausing 60s then retrying`);
    await sleep(60_000);
    return get(path, attempt + 1);
  }

  // If remaining is low, pause before the *next* call so we don't 429 mid-poll.
  const remaining = parseInt(res.headers.get("X-Discogs-Ratelimit-Remaining") ?? "999", 10);
  if (remaining < 10) {
    console.warn(`[discogs] Rate limit low (${remaining} remaining) — pausing 60s`);
    await sleep(60_000);
  }

  if (!res.ok) throw new Error(`Discogs API ${res.status}: ${path}`);
  return res.json();
}

export async function search(query, options = {}) {
  if (!TOKEN) {
    console.warn("[discogs] DISCOGS_TOKEN not set — skipping");
    return [];
  }

  // Step 1: find matching releases in the database
  const { results } = await get(
    `/database/search?q=${encodeURIComponent(query)}&type=release&format=vinyl&per_page=5`
  );

  if (!results?.length) return [];

  // Step 2: fetch each release to get live marketplace stats
  const leads = [];
  for (const result of results) {
    let release;
    try {
      release = await get(`/releases/${result.id}`);
    } catch (e) {
      console.warn(`[discogs] Could not fetch release ${result.id}: ${e.message}`);
      continue;
    }

    const numForSale = release.num_for_sale ?? 0;
    const lowestPrice = release.lowest_price ?? null;

    if (numForSale === 0 || lowestPrice === null) continue;
    if (options.max_price && lowestPrice > options.max_price) continue;

    leads.push({
      source: "discogs",
      title: result.title,
      price: lowestPrice,
      currency: "USD",
      num_for_sale: numForSale,
      url: `https://www.discogs.com/sell/list?release_id=${result.id}`,
      release_url: `https://www.discogs.com${result.uri}`,
      year: result.year,
      country: result.country,
      found_at: new Date().toISOString(),
    });
  }

  return leads;
}
