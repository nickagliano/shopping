/**
 * Marketplace plugin: Craigslist
 *
 * Scrapes Craigslist "for sale" search results using the JSON-LD structured
 * data embedded in every search page. No API key, no auth.
 *
 * The RSS endpoint (?format=rss) is blocked; the HTML search page is not.
 * Each page returns up to 120 listings and embeds all titles/prices/locations
 * in a <script type="application/ld+json" id="ld_searchpage_results"> block.
 * Listing URLs are matched from the href anchors in the same page.
 *
 * Env var:
 *   CRAIGSLIST_CITIES — comma-separated city slugs (default: Richmond-area metros)
 *
 * Interface: { search(query) -> Lead[] }
 */

const DEFAULT_CITIES = [
  "richmond",        // Richmond VA
  "norfolk",         // Hampton Roads / Virginia Beach
  "charlottesville", // Charlottesville VA
  "fredericksburg",  // Fredericksburg VA
  "washingtondc",    // DC / Northern VA
];

const DELAY_MS = 600;
const UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36";

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function searchCity(city, query) {
  const url = `https://${city}.craigslist.org/search/sss` +
    `?query=${encodeURIComponent(query)}&sort=date`;

  const res = await fetch(url, {
    headers: {
      "User-Agent":      UA,
      "Accept":          "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.5",
    },
  });

  if (res.status === 404) return []; // unknown city slug
  if (!res.ok) {
    console.warn(`[craigslist] ${city}: HTTP ${res.status}`);
    return [];
  }

  const html = await res.text();

  // Extract structured listing data from JSON-LD
  const ldMatch = /id="ld_searchpage_results"\s*>\s*(\{[\s\S]*?\})\s*<\/script>/.exec(html);
  if (!ldMatch) {
    console.log(`[craigslist] ${city}: no JSON-LD results found`);
    return [];
  }

  let items;
  try {
    items = JSON.parse(ldMatch[1]).itemListElement ?? [];
  } catch {
    console.warn(`[craigslist] ${city}: failed to parse JSON-LD`);
    return [];
  }

  // Extract unique listing URLs in page order
  const urlRe = new RegExp(
    `href="(https://${city}\\.craigslist\\.org/[a-z]{3}/[a-z]{3}/d/[^"]+\\.html)"`, "g"
  );
  const seen = new Set();
  const urls = [];
  let m;
  while ((m = urlRe.exec(html)) !== null) {
    if (!seen.has(m[1])) { seen.add(m[1]); urls.push(m[1]); }
  }

  const leads = [];
  items.forEach((entry, i) => {
    const item = entry.item;
    const listingUrl = urls[i];
    if (!listingUrl) return;

    const price = item.offers?.price != null ? parseFloat(item.offers.price) : null;
    const locality = item.offers?.availableAtOrFrom?.address?.addressLocality ?? city;

    leads.push({
      source:         "craigslist",
      title:          item.name ?? "",
      price,
      currency:       "USD",
      shipping_price: null,
      condition:      null,
      ships_from:     locality || city,
      url:            listingUrl,
      found_at:       new Date().toISOString(),
    });
  });

  return leads;
}

export async function search(query) {
  const cities = (process.env.CRAIGSLIST_CITIES ?? DEFAULT_CITIES.join(","))
    .split(",").map((c) => c.trim()).filter(Boolean);

  const leads = [];
  const seenUrls = new Set();

  for (const city of cities) {
    let cityLeads;
    try {
      cityLeads = await searchCity(city, query);
    } catch (e) {
      console.warn(`[craigslist] ${city}: ${e.message}`);
      cityLeads = [];
    }

    for (const lead of cityLeads) {
      if (seenUrls.has(lead.url)) continue;
      seenUrls.add(lead.url);
      leads.push(lead);
    }

    if (cities.indexOf(city) < cities.length - 1) await sleep(DELAY_MS);
  }

  return leads;
}
