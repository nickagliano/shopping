/**
 * Marketplace plugin: Facebook Marketplace
 *
 * Facebook doesn't offer a public API for Marketplace listings.
 * This plugin is a skeleton — hook it up to a scraping approach of your choice:
 *   - Playwright/Puppeteer with a logged-in session
 *   - A third-party scraping service
 *   - Manual RSS/export if you find one
 *
 * Interface: { search(query, options) -> Lead[] }
 */

export async function search(query, options = {}) {
  console.warn(
    "[facebook_marketplace] No API available — implement scraping logic here. " +
    "See CUSTOMIZE.md for guidance."
  );
  return [];
}
