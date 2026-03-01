/**
 * deal plugin: CamelCamelCamel price history (Amazon)
 *
 * Auto-discovered from plugins/deals/. No config needed in eps.toml.
 * Interface: { fetch_deals(product) -> Deal[] }
 *   Deal: { source, description, url, savings? }
 */
export async function fetch_deals(product) {
  if (!product.asin) return [];
  const url = `https://camelcamelcamel.com/product/${product.asin}`;
  // TODO: scrape or use an unofficial API to get price history
  // Return Deal objects if price is below historical average
  return [
    {
      source: "camelcamelcamel",
      description: `View price history for ${product.name}`,
      url,
    },
  ];
}
