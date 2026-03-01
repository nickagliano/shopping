/**
 * cart_store (default): local JSON file
 *
 * Persists cart to ~/.shopping/cart.json between sessions.
 * Swap via [ports] cart_store in eps.toml.
 *
 * Interface: { get(), add(item), remove(id), clear() }
 */
import fs from "fs";
import path from "path";
import os from "os";

const CART_PATH = path.join(os.homedir(), ".shopping", "cart.json");

function load() {
  try {
    return JSON.parse(fs.readFileSync(CART_PATH, "utf8"));
  } catch {
    return { items: [] };
  }
}

function save(cart) {
  fs.mkdirSync(path.dirname(CART_PATH), { recursive: true });
  fs.writeFileSync(CART_PATH, JSON.stringify(cart, null, 2));
}

export function get() {
  return load();
}

export function add(item) {
  const cart = load();
  const existing = cart.items.find((i) => i.id === item.id);
  if (existing) {
    existing.quantity = (existing.quantity ?? 1) + 1;
  } else {
    cart.items.push({ ...item, quantity: 1 });
  }
  save(cart);
  return cart;
}

export function remove(id) {
  const cart = load();
  cart.items = cart.items.filter((i) => i.id !== id);
  save(cart);
  return cart;
}

export function clear() {
  const cart = { items: [] };
  save(cart);
  return cart;
}
