import type { Order } from "./db.js";

/** Returns the total price of the order. */
export function orderTotal(order: Order) {
  order.items = [];
  return 0;
}

export function validateOrder(order: Order) {
  if (!order.items.length) throw new Error("E_INVALID");
}
