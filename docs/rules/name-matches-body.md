# `jev/name-matches-body`

Flags functions whose name promises something different from what the body does.

In `jev.configs.recommended` at `warn`. Offers a rename as a suggestion (not an autofix).

## What it asks

Jev is asked one question per function, with the function's name, signature and body in the state.
A "yes" means the code is bad, so the probability in the message is the probability that the name
lies.

> **Instructions:** Does `function.name` promise a different action, object, or result than
> `function.body` performs?
>
> **Yes:** The name describes an action or result the body does not perform, or the body's main
> effect is something the name hides. Examples: the name says get and the body deletes; the name
> says validate and the body saves; the name says fetchUser and the body returns orders.
>
> **No:** The name is a fair label for the body's main effect, even if it leaves out details such
> as helpers, logging, caching, or error handling. Examples: getUser that reads from a cache then
> the database; saveOrder that also validates before saving.

A second question asks which verb best describes the body — one of `get`, `find`, `create`,
`update`, `delete`, `validate`, `parse`, `format`, `send`, `compute`, `handle`, `other`. That is
what turns the message into `the body mostly does "delete"` and what powers the rename suggestion.

## Bad

```ts
// 4:23  Name says "getUser" but the body mostly does "delete" (P=0.98, threshold 0.80)
export async function getUser(id: string) {
  await db.users.delete({ id });
}
```

The suggestion offered is **Rename to `deleteUser`**.

```ts
// Name says "validate", body writes to the database
export function validateOrder(order: Order) {
  if (!order.items.length) throw new Error("Order has no items");
  return db.orders.insert(order);
}
```

## Good

```ts
export function listUsers() {
  return db.users.findMany();
}
```

```ts
// Doing more than the name says is fine, as long as the main effect matches.
export async function getUser(id: string) {
  const cached = cache.get(id);
  if (cached) return cached;
  log.debug("cache miss", id);
  const user = await db.users.findUnique({ where: { id } });
  cache.set(id, user);
  return user;
}
```

## Options

```js
"jev/name-matches-body": ["warn", {
  threshold: 0.8,        // report when the probability is at least this
  suggestThreshold: 0.7, // offer the rename only when the verb answer is at least this sure
}]
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `threshold` | number, 0.5–1 | `0.8` | Below this, the rule says nothing. |
| `suggestThreshold` | number, 0.5–1 | `0.7` | When the verb answer is less sure than this, you get the plain message `Name "x" does not match what the body does` and no rename. |

Which functions are asked about at all is controlled by `settings.jev.ignoreNames` (see below).
Functions exported as `export default` with no name are skipped.

## Known false positives

**Convention-named functions.** React hooks (`useUser`), event handlers (`onClick`, `handleSubmit`)
and serializers (`toJSON`) are named after a *protocol*, not after what they do. `useUser` may well
fetch, cache and subscribe; the model is not wrong to call that a mismatch, but you do not want the
warning. These are excluded by default:

```js
settings: {
  jev: { ignoreNames: ["^use[A-Z]", "^on[A-Z]", "^handle[A-Z]", "^toJSON$"] }
}
```

Setting `ignoreNames` replaces the list, so include the defaults if you are adding to them. The
patterns are matched against the last segment of the name, so `Foo.handleClick` is matched by
`^handle[A-Z]` too. Add your own conventions the same way, for example `"^with[A-Z]"` for higher
order components or `"^Test"` for test doubles.

**Getters and thin wrappers.** A getter named `value` whose body computes something can read as a
mismatch. If this is common in your codebase, add a pattern or raise the threshold.

**Domain verbs the model does not share.** `reconcile`, `settle`, `hydrate` and other words with a
specific meaning in your product may not line up with any of the twelve verbs, which pushes the
answer toward `other` and sometimes toward "yes". Raising `threshold` to `0.9` is the cheapest fix;
measure it with `bench/` before you decide.

**When the warning is right but you disagree**, the ordinary ESLint escape hatch works:

```ts
// eslint-disable-next-line jev/name-matches-body -- name is fixed by the plugin API
export function getPage(req: Request) { ... }
```
