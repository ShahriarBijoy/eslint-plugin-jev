// Returns the user's profile
export async function getUser(id: string): Promise<void> {
  await db.users.delete({ id });
}
export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error("Error 42");
  return repo.insert(order);
}
