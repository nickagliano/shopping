/**
 * Marketplace plugin: eBay
 *
 * Uses the eBay Browse API (Client Credentials / App Token).
 * General-purpose: no hardcoded category or query suffix.
 *
 * Requires env vars:
 *   EBAY_CLIENT_ID     — App ID from developer.ebay.com
 *   EBAY_CLIENT_SECRET — Cert ID from developer.ebay.com
 *
 * Interface: { search(query) -> Lead[] }
 */

const BROWSE_BASE = "https://api.ebay.com/buy/browse/v1";
const TOKEN_URL   = "https://api.ebay.com/identity/v1/oauth2/token";
const SCOPE       = "https://api.ebay.com/oauth/api_scope";

// In-memory token cache — valid for ~2 hours, refreshed automatically
let _token = null;

async function getToken() {
  if (_token && Date.now() < _token.expiresAt) return _token.value;

  const clientId     = process.env.EBAY_CLIENT_ID     ?? process.env.EBAY_APP_ID;
  const clientSecret = process.env.EBAY_CLIENT_SECRET ?? process.env.EBAY_CERT_ID;

  if (!clientId || !clientSecret) return null;

  const creds = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      "Authorization":  `Basic ${creds}`,
      "Content-Type":   "application/x-www-form-urlencoded",
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(SCOPE)}`,
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`eBay OAuth ${res.status}: ${body.slice(0, 120)}`);
  }

  const data = await res.json();
  _token = {
    value:     data.access_token,
    expiresAt: Date.now() + (data.expires_in - 60) * 1000, // 60s buffer
  };
  return _token.value;
}

export async function search(query) {
  let token;
  try {
    token = await getToken();
  } catch (e) {
    console.warn(`[ebay] Auth failed: ${e.message}`);
    return [];
  }

  if (!token) {
    console.warn("[ebay] EBAY_CLIENT_ID / EBAY_CLIENT_SECRET not set — skipping");
    return [];
  }

  const params = new URLSearchParams({ q: query, limit: "20" });
  const res = await fetch(`${BROWSE_BASE}/item_summary/search?${params}`, {
    headers: {
      "Authorization":            `Bearer ${token}`,
      "X-EBAY-C-MARKETPLACE-ID":  "EBAY_US",
    },
  });

  if (!res.ok) {
    console.warn(`[ebay] Search failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return (data.itemSummaries ?? []).map((item) => {
    const shippingOptions = item.shippingOptions ?? [];
    const shippingCost = shippingOptions[0]?.shippingCost?.value ?? null;
    return {
      source:         "ebay",
      title:          item.title,
      price:          parseFloat(item.price?.value ?? 0),
      currency:       item.price?.currency ?? "USD",
      shipping_price: shippingCost !== null ? parseFloat(shippingCost) : null,
      condition:      item.condition ?? null,
      ships_from:     item.itemLocation?.city ?? null,
      url:            item.itemWebUrl,
      found_at:       new Date().toISOString(),
    };
  });
}
