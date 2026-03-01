/**
 * checkout_handler (default): open cart items in the browser
 *
 * Opens each item's URL in the system default browser — no automation,
 * you complete the purchase manually. Safe default.
 * Swap via [ports] checkout_handler in eps.toml.
 *
 * Interface: { checkout(cart) }
 */
import { exec } from "child_process";

export async function checkout(cart) {
  if (!cart.items.length) {
    console.log("Cart is empty.");
    return;
  }
  for (const item of cart.items) {
    const cmd =
      process.platform === "darwin"
        ? `open "${item.url}"`
        : `xdg-open "${item.url}"`;
    exec(cmd);
    console.log(`Opened: ${item.name} → ${item.url}`);
  }
}
