# `jev/comment-matches-code`

Flags a comment above a function that describes behavior the function does not have, or that stays
silent about a side effect it does have.

In `jev.configs.recommended` at `warn`. Reports at the comment, not at the function.

## What it asks

Only functions that actually have a comment block immediately above them are asked about — line
comments, block comments and JSDoc all count, and consecutive ones are joined. A "yes" means the
comment is misleading, so the probability in the message is the probability that the comment lies.

> **Instructions:** Does `function.comment` describe behavior that `function.body` does not have,
> or leave out a side effect that `function.body` has?
>
> **Yes:** The comment states a behavior, return value, or guarantee the code does not implement,
> or the code performs a write, network call, deletion, or mutation the comment does not mention.
> Examples: the comment says returns the profile and the body deletes; the comment says pure and
> the body writes a file.
>
> **No:** The comment is accurate for what the body does, or is merely brief, vague, or incomplete
> about minor details. Examples: the comment says saves an order and the body validates then saves.

Note the asymmetry: a *thin* comment is fine, a *wrong* comment is not. "Saves an order" is an
acceptable comment for a function that validates and then saves. "Returns the profile" is not an
acceptable comment for a function that deletes.

## Bad

```ts
// 3:1  Comment on "getUser" describes behavior the code does not have (P=0.98, threshold 0.80)

// Returns the user's profile
export async function getUser(id: string) {
  await db.users.delete({ id });
}
```

```ts
/**
 * Pure helper: formats a price for display.
 * @returns the formatted string
 */
export function formatPrice(cents: number) {
  metrics.increment("format_price");      // a side effect the comment denies
  return `$${(cents / 100).toFixed(2)}`;
}
```

## Good

```ts
/** Deletes the user and everything that references them. */
export async function deleteUser(id: string) {
  await db.users.delete({ id });
}
```

```ts
// Saves an order.
export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error("Order has no items");
  return repo.insert(order);   // validating first is a detail; the comment is not wrong
}
```

## Options

```js
"jev/comment-matches-code": ["warn", { threshold: 0.8 }]
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `threshold` | number, 0.5–1 | `0.8` | Below this, the rule says nothing. |

## What is never asked about

Functions with no leading comment cost nothing — they are not sent. Tool directives are skipped too,
because they are instructions to other programs rather than descriptions of the code. A comment is
ignored when it starts with any of:

`eslint-`, `eslint ` · `@ts-` · `global`, `globals`, `exported` · `prettier-` · `istanbul`, `c8`,
`v8` · `copyright`, `license`, `licence`, `spdx-`

## Known false positives

**The comment is about the caller, not the function.** `// Called from the worker only` or
`// TODO: drop after the v3 migration` describes context, not behavior. The model is asked whether
the comment describes behavior the code does not have, and usually answers no, but a long
context-setting block above a short function can tip it. Move such notes inside the body, where
they are not read as a description of it.

**Aspirational JSDoc on an interface implementation.** A doc comment copied from the interface
often promises the general contract while this particular implementation is a stub or a no-op. The
warning is arguably correct; if you disable it, disable it on the line.

**Commented-out code above the function.** Every comment between the previous statement and the
function is joined into one block and treated as its comment, blank lines included. A chunk of
dead code sitting there rarely matches the body, so it tends to fire. Delete it — that is what
version control is for.

**Adversarial comments.** A comment that argues for itself ("this really does return the profile")
can pull the answer down. This rule judges; it does not verify.

To silence one case:

```ts
// eslint-disable-next-line jev/comment-matches-code -- doc copied from the interface on purpose
```
