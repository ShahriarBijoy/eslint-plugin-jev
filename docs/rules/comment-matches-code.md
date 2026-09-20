# `jev/comment-matches-code`

Flags a comment above a function that misleads a reader about what the function does — either
because the body contradicts it, or because the body has a side effect the comment never mentions.

In `jev.configs.recommended` at `warn`. Reports at the comment, not at the function.

## What it asks

Only functions with a comment **touching** the declaration are asked about — line comments, block
comments and JSDoc all count. A comment separated from the function by a blank line is a module or
section header and is not read as that function's documentation. When several comments precede a
declaration, the nearest one wins rather than all of them being concatenated.

Two questions are asked, because these are two different defects that deserve two different
sentences. Whichever scores higher above the threshold is the one reported.

> **`contradicts`:** Does `function.comment` state something about this function that
> `function.body` contradicts?
>
> **Yes:** The comment states a behavior, return value, ordering, count, or guarantee, and the body
> does something different — including a comment that documents some *other* function rather than
> this one. Examples: the comment says returns the profile and the body deletes the user; the
> comment says newest first and the body sorts alphabetically; the comment says three options and
> the body offers two.
>
> **No:** The comment is accurate for this function once you credit work the body hands off:
> behavior inside a helper this body calls, a hook it invokes, or a constant it references counts
> as this function's behavior.

> **`hides`:** Does `function.body` perform a write, network call, deletion, or other lasting side
> effect that `function.comment` does not mention at all?
>
> **Yes:** The body changes state outside itself and the comment gives no hint of it. Example: the
> comment describes resolving a caller's access level and the body also marks that account active
> in the database.
>
> **No:** The comment mentions the effect, or there is no such effect. Logging, metrics, caching
> and memoization are not hidden side effects.

Note the asymmetry: a *thin* comment is fine, a *wrong* comment is not. "Saves an order" is an
acceptable comment for a function that validates and then saves. "Returns the profile" is not an
acceptable comment for a function that deletes.

**Delegation is not a contradiction.** A one-line body that calls a helper does not literally
contain the behavior its comment describes, and an earlier version of this rule flagged every such
function. A comment is judged against what the function *accomplishes*, not against what its own
statements spell out.

## Bad

```ts
// 3:1  Comment on "getUser" contradicts what the code does (P=0.98, threshold 0.80)

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

**Commented-out code directly above the function.** Dead code touching the declaration is read as
its comment and rarely matches the body, so it tends to fire. Delete it — that is what version
control is for. Dead code separated by a blank line is no longer picked up.

**Adversarial comments.** A comment that argues for itself ("this really does return the profile")
can pull the answer down. This rule judges; it does not verify.

## Known misses

The rule is deliberately conservative about delegation, and the cost is that *subtle* contradictions
land below the default threshold. On a hand-labelled set of 19 real warnings, a docblock that had
drifted one function up scored 0.64, and a comment whose stated row count disagreed with a `where`
clause scored 0.58 — both real, both silent at `0.8`. If you are auditing a codebase rather than
watching it as you type, run once at `{ threshold: 0.6 }` and read the extra hits yourself.

To silence one case:

```ts
// eslint-disable-next-line jev/comment-matches-code -- doc copied from the interface on purpose
```
