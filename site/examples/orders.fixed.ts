import type { Order } from "./db.js";

/** Clears the order's items and resets its total to zero. */
export function clearOrder(order: Order) {
  order.items = [];
  return 0;
}

export function validateOrder(order: Order) {
  if (!order.items.length) throw new Error(`Order ${order.id} has no items`);
}
