# Discogs API — Rate Limiting Reference

Source: https://www.discogs.com/developers/#page:home,header:home-rate-limiting
(The Discogs developer portal blocks automated fetching — check the link above for the latest.)

---

## Limits

| Auth type | Requests per minute |
|-----------|-------------------|
| Authenticated (token or OAuth) | **240 req/min** |
| Unauthenticated | ~25 req/min (undocumented, be conservative) |

The window is a **60-second moving average** — not a hard reset on the minute boundary.
If you go quiet for 60 seconds with no requests, the window fully resets.

---

## Response Headers

Every authenticated response includes:

| Header | Meaning |
|--------|---------|
| `X-Discogs-Ratelimit` | Your total allowance in the current window |
| `X-Discogs-Ratelimit-Used` | Requests used so far in the window |
| `X-Discogs-Ratelimit-Remaining` | Requests left before a 429 |

---

## Our Plugin's Approach

`plugins/marketplaces/discogs.js` fetches up to 5 releases per watchlist item plus
one `/releases/{id}` call per result — up to 6 requests per item per poll.

The plugin reads `X-Discogs-Ratelimit-Remaining` on every response. If it drops
below 10, it pauses 60 seconds before continuing — long enough for the moving
average window to recover. With a 2-hour poll interval, this should never trigger
under normal use.

**Do not use large test intervals like `CHECK_INTERVAL_MINUTES=99999`** — this
overflows Node's 32-bit `setInterval` and causes it to fire ~every 1ms, which will
exhaust the rate limit in seconds. The server caps the interval at 1440 minutes (24h).

---

## If You Hit a 429

Discogs doesn't publish how long the cooldown lasts, but in practice:
- A short burst: clears in 1–2 minutes
- A sustained flood (like the overflow bug above): can take 5–10 minutes
- Check `X-Discogs-Ratelimit-Remaining` on your next successful response to confirm recovery
