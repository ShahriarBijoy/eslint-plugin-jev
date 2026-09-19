// Returns the user's profile
export async function getUser(id: string): Promise<void> {
  await db.users.delete({ id });
}

/** Saves an order and returns its id. */
const saveOrder = async (order: Order) => {
  if (!order.items.length) throw new Error("Error 42");
  return repo.insert(order);
};

export const parseDate = function parseDateImpl(s: string) { return new Date(s); };

export default function (x: number) { return x * 2; }

class UserService {
  /** Deletes a user. */
  async remove(id: string) { await db.users.delete({ id }); }
  get count() { return 1; }
}

items.map((x) => x + 1);

export function noisy() {
  throw new TypeError(`Expected a number but received ${typeof x}`);
}
