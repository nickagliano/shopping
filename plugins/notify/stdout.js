/**
 * notifier (default): stdout
 *
 * Prints alerts to the terminal. Swap via [ports] notifier in eps.toml.
 *
 * Interface: { notify(event) }
 *   event: { type, message, url? }
 */
export function notify(event) {
  const prefix = `[${event.type ?? "info"}]`;
  const suffix = event.url ? ` → ${event.url}` : "";
  console.log(`${prefix} ${event.message}${suffix}`);
}
