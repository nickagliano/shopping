# shopping — Customization Guide

`shopping` is a personal deal-watcher. You maintain a watchlist of items you're hunting
for — records, gear, books, whatever — and the daemon polls every marketplace plugin on
an interval, surfaces matching listings as "leads," and notifies you of new finds. Each
marketplace is its own plugin file, dropped into `plugins/marketplaces/` and
auto-discovered. Nothing to configure beyond adding the file and setting an API key.

---

## Watchlist

Edit `watchlist.json` to describe what you're hunting for:

```json
[
  {
    "name": "Alabama Shakes - Sound & Color",
    "keywords": ["alabama shakes", "sound and color", "sound & color"],
    "max_price": 40,
    "notes": "Original pressing preferred, VG+ or better"
  },
  {
    "name": "Mavis Staples - We'll Never Turn Back",
    "keywords": ["mavis staples", "we'll never turn back"],
    "max_price": 25
  }
]
```

Fields:
- `name` — human label, used in notifications
- `keywords` — list of search terms; the first keyword is sent to each marketplace
- `max_price` — optional ceiling; leads above this are filtered out
- `notes` — freeform reminder for yourself (not used by the daemon)

---

## Ports

### `marketplaces_dir` — Marketplace plugins (auto-discovered)

**What it does:** The daemon scans this directory on startup and loads every `.js` file
as a marketplace plugin. Each plugin is queried for every watchlist item on each poll.
**Default:** `plugins/marketplaces/`
**How to add a marketplace:** Create a file exporting `search(query, options)`:

```js
// plugins/marketplaces/craigslist.js
export async function search(query, options = {}) {
  // Scrape or call an API. Return an array of Lead objects.
  return [
    {
      source: "craigslist",
      title: "Alabama Shakes Sound & Color LP",
      price: 22.00,
      url: "https://craigslist.org/...",
      condition: "like new",        // optional
      found_at: new Date().toISOString(),
    }
  ];
}
```

Drop the file in `plugins/marketplaces/` and restart — it's picked up automatically.

Ships with:
- `discogs.js` — Discogs marketplace (best for vinyl; needs `DISCOGS_TOKEN`)
- `ebay.js` — eBay Browse API (needs `EBAY_APP_ID`)
- `facebook_marketplace.js` — skeleton (no public API; needs custom scraping)

---

### `notifier`

**What it does:** Called for every new lead found.
**Default:** `plugins/notify/stdout.js` — prints to terminal/logs.
**How to customize:** Swap in `eps.toml`:

```toml
[ports]
notifier = "plugins/notify/macos_notification.js"
```

Ships with:
- `plugins/notify/stdout.js` — print to logs (default)
- `plugins/notify/macos_notification.js` — macOS system notification (no deps)

---

### `watchlist`

**What it does:** Path to the JSON file of items to watch.
**Default:** `watchlist.json` (repo root)
**How to customize:** Set `WATCHLIST=/path/to/file.json` env var, or edit `eps.toml`:
```toml
[ports]
watchlist = "/Users/you/.shopping/watchlist.json"
```

---

### `leads_store`

**What it does:** Path to the JSON file where found leads are persisted.
**Default:** `leads.json` (repo root)
**How to customize:** Set `LEADS_STORE=/path/to/leads.json` env var.
The daemon deduplicates by source + URL so re-running never creates duplicate entries.

---

### `check_interval_minutes`

**What it does:** How often the daemon polls all marketplaces, in minutes.
**Default:** `120` (2 hours)
**How to customize:** Edit `eps.toml` or set `CHECK_INTERVAL_MINUTES` env var:
```toml
[ports]
check_interval_minutes = 60
```

---

## Getting Started

1. Clone: `git clone https://github.com/nickagliano/shopping`
2. Install: `npm install`
3. Set API keys in `config/config.json` (copy from `config/config.example.json`)
4. Edit `watchlist.json` with items you're hunting
5. Run: `./serve.sh`

Leads accumulate in `leads.json`. The daemon logs new finds to stdout.

---

## Common Customizations

### Example: Add Craigslist as a marketplace

Create `plugins/marketplaces/craigslist.js` and export `search()`. Since Craigslist
has no public API, you'd use Playwright or a scraping lib:

```js
import { chromium } from "playwright";

export async function search(query, options = {}) {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage();
  await page.goto(`https://yourCity.craigslist.org/search/msa?query=${encodeURIComponent(query)}`);
  // parse results...
  await browser.close();
  return leads;
}
```

Drop it in `plugins/marketplaces/` and restart.

---

### Example: Get macOS notifications for new leads

In `eps.toml`:
```toml
[ports]
notifier = "plugins/notify/macos_notification.js"
```

Uses `osascript` — no dependencies needed.
