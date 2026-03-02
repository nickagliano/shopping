/**
 * Marketplace plugin: Cannon's Online Auctions
 *
 * Searches active auctions at bid.cannonsauctions.com for lots matching the
 * query that are currently bid below max_price. For up to 5 qualifying lots
 * it fetches the detail page to get the item description. Returns each
 * qualifying lot as a lead with a direct link to the item.
 *
 * No API key required — the site is fully public.
 *
 * Interface: { search(query, options) -> Lead[] }
 *   options: { max_price? }
 */

const BASE = "https://bid.cannonsauctions.com";
const USER_AGENT = "shopping-harness/0.2.0";
const MAX_DETAIL_FETCHES = 5;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchHtml(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": USER_AGENT },
  });
  if (!res.ok) throw new Error(`Cannon HTTP ${res.status}: ${url}`);
  return res.text();
}

/**
 * Parse the HTML fragment returned by GetAdvancedSearchResults.
 * Returns an array of raw lot objects with bid/url/auction info.
 */
function parseSearchResults(html) {
  // We're running in Node — use basic regex parsing since there's no DOM.
  const lots = [];

  // Split on the repeating lot card wrapper
  const blocks = html.split(/class="bg-white border mt-2/);
  // First block is pagination header — skip it
  for (let i = 1; i < blocks.length; i++) {
    const block = blocks[i];

    // Item URL
    const hrefMatch = block.match(/href="(\/Public\/Auction\/AuctionItemDetail[^"]+)"/);
    if (!hrefMatch) continue;
    const path = hrefMatch[1].replace(/&amp;/g, "&");

    // Lot number / display title
    const lotMatch = block.match(/class="linkbuttons"[^>]*>\s*(Lot\s*-\s*\d+)\s*</);
    const lotNumber = lotMatch ? lotMatch[1].trim() : "Unknown Lot";

    // Current bid
    const bidMatch = block.match(/Current Bid\s*:\s*([\d.]+)/);
    const currentBid = bidMatch ? parseFloat(bidMatch[1]) : null;

    // Ends date — two adjacent paragraphs: "Ends" then ": Mon Mar 02 2026 7:30 PM"
    const endsMatch = block.match(/Ends<\/p>\s*<p[^>]*>:\s*([^<]+)</);
    const endsAt = endsMatch ? endsMatch[1].trim() : null;

    lots.push({ lotNumber, currentBid, endsAt, path });
  }
  return lots;
}

/**
 * Fetch a lot detail page and extract its description text.
 */
async function fetchLotDescription(path) {
  const html = await fetchHtml(`${BASE}${path}`);
  // Description is in a div after the Description tab link
  const descMatch = html.match(/id="Description-tab-1"[^>]*>[\s\S]*?<\/div>\s*<\/li>[\s\S]*?<\/ul>\s*<[^>]+id="[^"]*Description[^"]*"[^>]*>([\s\S]*?)<\/div>/);
  if (descMatch) return descMatch[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  // Fallback: look for the description tab content generically
  const fallback = html.match(/Description<\/a>[\s\S]{0,500}?<div[^>]+>([\s\S]{20,500}?)<\/div>/);
  if (fallback) return fallback[1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

  return null;
}

export async function search(query, options = {}) {
  // Step 1: search active auctions
  const searchUrl =
    `${BASE}/Public/AdvancedSearch/GetAdvancedSearchResults` +
    `?pageNumber=1&pagesize=25&filter=` +
    `&keyWordSearch=${encodeURIComponent(query)}` +
    `&keyWordOrder=AnyOrder` +
    `&auctionStatus=Current` +
    `&priceStart=0&priceEnd=NaN` +
    `&sortBy=currentbid_asc`;

  let html;
  try {
    html = await fetchHtml(searchUrl);
  } catch (e) {
    console.warn(`[cannon] Search failed: ${e.message}`);
    return [];
  }

  const rawLots = parseSearchResults(html);
  if (!rawLots.length) return [];

  const filtered = rawLots.filter((lot) => lot.currentBid !== null);

  if (!filtered.length) return [];

  // Step 3: fetch detail pages for descriptions (cap to avoid hammering the server)
  const leads = [];
  const toFetch = filtered.slice(0, MAX_DETAIL_FETCHES);

  for (const lot of toFetch) {
    let description = null;
    try {
      description = await fetchLotDescription(lot.path);
      await sleep(500); // polite delay between detail fetches
    } catch (e) {
      console.warn(`[cannon] Could not fetch lot detail: ${e.message}`);
    }

    const title = description
      ? `${lot.lotNumber}: ${description.slice(0, 120)}`
      : lot.lotNumber;

    leads.push({
      source: "cannon",
      title,
      price: lot.currentBid,
      currency: "USD",
      url: `${BASE}${lot.path}`,
      ends_at: lot.endsAt,
      found_at: new Date().toISOString(),
    });
  }

  return leads;
}
