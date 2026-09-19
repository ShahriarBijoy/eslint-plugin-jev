import { db, repo, type Order } from "./db.js";

// Deletes the user
export async function deleteUser(id: string) {
  await db.users.delete({ id });
}

export function listUsers() {
  return db.users.findMany();
}

export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error("Order has no items");
  return repo.insert(order);
}
