/**
 * review plugin: Amazon star rating + count
 *
 * Auto-discovered from plugins/reviews/. No config needed in eps.toml.
 * Interface: { fetch_reviews(product) -> Review[] }
 *   Review: { source, rating, count, url }
 */
export async function fetch_reviews(product) {
  if (!product.url) return [];
  // TODO: parse rating and review count from product page
  // (use product.asin with PA-API if available)
  return [
    {
      source: "amazon",
      rating: null,   // e.g. 4.5
      count: null,    // e.g. 1284
      url: product.url,
    },
  ];
}
