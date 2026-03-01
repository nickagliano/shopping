/**
 * search plugin: eBay Browse API
 *
 * Drop this in plugins/search/ — it's auto-discovered alongside amazon.js.
 * Requires: process.env.EBAY_APP_ID (set in config/config.json)
 */
export async function search(query) {
  const appId = process.env.EBAY_APP_ID;
  if (!appId) throw new Error("EBAY_APP_ID not set");

  const url = `https://api.ebay.com/buy/browse/v1/item_summary/search?q=${encodeURIComponent(query)}&limit=20`;
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${appId}` },
  });
  if (!res.ok) throw new Error(`eBay API error: ${res.status}`);

  const data = await res.json();
  return (data.itemSummaries ?? []).map((item) => ({
    name: item.title,
    price: parseFloat(item.price?.value ?? 0),
    url: item.itemWebUrl,
    source: "ebay",
    imageUrl: item.image?.imageUrl,
  }));
}
