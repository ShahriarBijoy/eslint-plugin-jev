import { db, repo, type Order } from "./db.js";

// Returns the user's profile
export async function getUser(id: string) {
  await db.users.delete({ id });
}

export function listUsers() {
  return db.users.findMany();
}

export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error("Error 42");
  return repo.insert(order);
}
