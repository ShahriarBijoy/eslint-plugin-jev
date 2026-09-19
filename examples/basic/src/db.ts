// Stand-ins for a real database client, so the example needs no dependencies.
export interface User {
  id: string;
  name: string;
}

export interface Order {
  id: string;
  items: string[];
}

export declare const db: {
  users: {
    delete(where: { id: string }): Promise<void>;
    findMany(): Promise<User[]>;
  };
};

export declare const repo: {
  insert(order: Order): Promise<void>;
};
