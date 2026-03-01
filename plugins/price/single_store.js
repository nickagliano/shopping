/**
 * price_engine (default): single-store
 *
 * Just echoes the price already on the product — no cross-store lookup.
 * Swap for plugins/price/multi_store.js to fan out across all search plugins.
 *
 * Interface: { compare(product) -> PriceResult[] }
 *   PriceResult: { source, price, url }
 */
export async function compare(product) {
  return [{ source: product.source, price: product.price, url: product.url }];
}
