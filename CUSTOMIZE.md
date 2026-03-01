# shopping — Customization Guide

`shopping` is a personal shopping harness. It ships with a working Amazon search,
a local JSON cart, a browser-based checkout, and terminal notifications. Every piece of
that default stack is a port — a named seam you can swap for your own implementation.
The plugin directories let you add search sources, deal scrapers, and review aggregators
by dropping in a single file. The harness wires them together; you decide what runs.

---

## Ports

### `search_provider`

**What it does:** Controls where product searches are sent and what results come back.
**Default:** `plugins/search/amazon.js` — searches Amazon and returns the top results
as `Product` objects with name, price, URL, and ASIN.
**How to customize:** Create a file that exports a `search(query: string)` async
function returning `Product[]`. Point `search_provider` in `eps.toml` to your file.

```js
// plugins/search/ebay.js
export async function search(query) {
  // hit eBay API, return [{ name, price, url, source: "ebay" }, ...]
}
```

Then in `eps.toml`:
```toml
[ports]
search_provider = "plugins/search/ebay.js"
```

---

### `cart_store`

**What it does:** Persists the user's cart between sessions.
**Default:** `plugins/cart/local_json.js` — reads/writes `~/.shopping/cart.json`.
**How to customize:** Create a file exporting `{ get(), add(item), remove(id), clear() }`.

```js
// plugins/cart/sqlite.js
export async function get() { /* query db */ }
export async function add(item) { /* insert */ }
export async function remove(id) { /* delete */ }
export async function clear() { /* truncate */ }
```

Then in `eps.toml`:
```toml
[ports]
cart_store = "plugins/cart/sqlite.js"
```

---

### `price_engine`

**What it does:** Fetches and compares prices for a given product across stores.
**Default:** `plugins/price/single_store.js` — returns the price already on the product
from the active `search_provider`. No cross-store comparison.
**How to customize:** Swap for `plugins/price/multi_store.js` (ships in this repo) to
fan out across all enabled search plugins and return a ranked price list. Or write your
own file exporting `{ compare(product) -> PriceResult[] }`.

To enable multi-store comparison:
```toml
[ports]
price_engine = "plugins/price/multi_store.js"
```

---

### `checkout_handler`

**What it does:** Executes the checkout flow when the user confirms a purchase.
**Default:** `plugins/checkout/open_in_browser.js` — opens the product URL in the
system default browser. Safe, manual, no automation.
**How to customize:** Create a file exporting `{ checkout(cart) }`. The `cart` argument
is the full cart object from `cart_store.get()`.

```js
// plugins/checkout/auto_buy.js
export async function checkout(cart) {
  for (const item of cart.items) {
    await automateCheckout(item);
  }
}
```

---

### `notifier`

**What it does:** Delivers alerts to the user — price drops, deal hits, order updates.
**Default:** `plugins/notify/stdout.js` — prints alerts to the terminal.
**How to customize:** Create a file exporting `{ notify(event) }` where `event` has
`type`, `message`, and optional `url`.

Ships with ready-to-use alternatives:
- `plugins/notify/macos_notification.js` — macOS system notifications via `osascript`
- `plugins/notify/slack.js` — posts to a Slack webhook (`SLACK_WEBHOOK_URL` env var)
- `plugins/notify/email.js` — sends via SMTP (`SMTP_*` env vars)

```toml
[ports]
notifier = "plugins/notify/macos_notification.js"
```

---

## Plugin Directories

Drop a file into one of these directories and it's automatically loaded on next start — no config change needed.

### `plugins/search/` — Additional search providers

Each file must export `{ search(query) -> Product[] }`. All enabled search plugins are
available to the `price_engine` for cross-store comparison.

Ships with:
- `amazon.js` — Amazon product search (active by default as `search_provider`)
- `ebay.js` — eBay search skeleton (fill in your API key)
- `google_shopping.js` — Google Shopping skeleton

### `plugins/deals/` — Coupon and deal scrapers

Each file must export `{ fetch_deals(product: Product) -> Deal[] }`.
Deals are surfaced in the product detail view and can trigger `notifier` alerts.

Ships with:
- `honey.js` — coupon code lookup skeleton
- `camelcamelcamel.js` — Amazon price history skeleton
- `rakuten.js` — cashback lookup skeleton

### `plugins/reviews/` — Review aggregators

Each file must export `{ fetch_reviews(product: Product) -> Review[] }`.
Reviews are shown alongside product results.

Ships with:
- `amazon_reviews.js` — pulls star rating and review count from the product page
- `rtings.js` — RTINGS.com lookup skeleton (good for electronics)

---

## Getting Started

1. Clone the repo: `git clone https://github.com/nickagliano/shopping`
2. Install dependencies: `npm install`
3. Copy config: `cp config/config.example.json config/config.json` and set any API keys
4. Run: `./serve.sh` (starts the web UI on port 5555)

---

## Common Customizations

### Example: Add Etsy as a search source

Create `plugins/search/etsy.js`:
```js
export async function search(query) {
  const res = await fetch(
    `https://openapi.etsy.com/v3/application/listings/active?keywords=${encodeURIComponent(query)}`,
    { headers: { 'x-api-key': process.env.ETSY_API_KEY } }
  );
  const data = await res.json();
  return data.results.map(l => ({
    name: l.title,
    price: l.price.amount / l.price.divisor,
    url: l.url,
    source: 'etsy',
  }));
}
```
Drop it in `plugins/search/` — auto-discovered on next start, no config change needed.

---

### Example: Get macOS notifications for price drops

In `eps.toml`:
```toml
[ports]
notifier = "plugins/notify/macos_notification.js"
```

`macos_notification.js` ships in this repo and uses `osascript` — no extra dependencies.

---

### Example: Enable multi-store price comparison

In `eps.toml`:
```toml
[ports]
price_engine = "plugins/price/multi_store.js"
```

Add any search plugins to `plugins/search/` — `multi_store.js` fans out across all of
them and ranks results by price.
