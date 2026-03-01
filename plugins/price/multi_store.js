/**
 * price_engine (optional): multi-store comparison
 *
 * Fans out to every plugin in plugins/search/ and returns all prices
 * sorted cheapest-first. Enable via [ports] price_engine in eps.toml.
 *
 * Interface: { compare(product) -> PriceResult[] }
 */
import { readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const SEARCH_DIR = join(dirname(fileURLToPath(import.meta.url)), "../search");

async function loadSearchPlugins() {
  const files = readdirSync(SEARCH_DIR).filter((f) => f.endsWith(".js"));
  return Promise.all(
    files.map(async (f) => {
      const mod = await import(join(SEARCH_DIR, f));
      return { name: f.replace(".js", ""), search: mod.search };
    })
  );
}

export async function compare(product) {
  const plugins = await loadSearchPlugins();
  const results = await Promise.allSettled(
    plugins.map(async ({ name, search }) => {
      const items = await search(product.name);
      const match = items[0]; // take best match from each store
      if (!match) return null;
      return { source: name, price: match.price, url: match.url };
    })
  );

  return results
    .filter((r) => r.status === "fulfilled" && r.value)
    .map((r) => r.value)
    .sort((a, b) => a.price - b.price);
}
