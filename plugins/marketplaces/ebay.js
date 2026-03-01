/**
 * Marketplace plugin: eBay
 *
 * Searches eBay listings using the Browse API.
 * Good for catching auction deals and Buy It Now listings.
 *
 * Requires: EBAY_APP_ID env var (get one at https://developer.ebay.com)
 *
 * Interface: { search(query, options) -> Lead[] }
 */

const BASE = "https://api.ebay.com/buy/browse/v1";

export async function search(query, options = {}) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) {
    console.warn("[ebay] EBAY_APP_ID not set — skipping");
    return [];
  }

  const params = new URLSearchParams({
    q: `${query} vinyl`,
    limit: "20",
    category_ids: "176985", // Music > Records category
  });
  if (options.max_price) {
    params.set("filter", `price:[..${options.max_price}],priceCurrency:USD`);
  }

  const res = await fetch(`${BASE}/item_summary/search?${params}`, {
    headers: { Authorization: `Bearer ${appId}` },
  });

  if (!res.ok) {
    console.warn(`[ebay] search failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return (data.itemSummaries ?? []).map((item) => ({
    source: "ebay",
    title: item.title,
    price: parseFloat(item.price?.value ?? 0),
    currency: item.price?.currency ?? "USD",
    url: item.itemWebUrl,
    condition: item.condition,
    found_at: new Date().toISOString(),
  }));
}
