/**
 * notifier (optional): macOS system notifications
 *
 * Uses osascript — no extra dependencies required on macOS.
 * Enable via [ports] notifier = "plugins/notify/macos_notification.js"
 */
import { exec } from "child_process";

export function notify(event) {
  const title = event.type ?? "shopping";
  const msg = event.message.replace(/"/g, '\\"');
  exec(`osascript -e 'display notification "${msg}" with title "${title}"'`);
}
