/**
 * search_provider (default): Amazon product search
 *
 * Replace the fetch call with a real Amazon PA-API v5 request,
 * or swap this entire file via [ports] search_provider in eps.toml.
 *
 * Returns: Product[]
 *   { name, price, url, source, imageUrl?, asin? }
 */
export async function search(query) {
  // TODO: replace with real Amazon PA-API v5 call
  // Requires: process.env.AMAZON_ACCESS_KEY, AMAZON_SECRET_KEY, AMAZON_PARTNER_TAG
  throw new Error(
    "Amazon search not yet configured. Set AMAZON_ACCESS_KEY, " +
    "AMAZON_SECRET_KEY, and AMAZON_PARTNER_TAG in config/config.json, " +
    "or swap search_provider in eps.toml for a different plugin."
  );
}
