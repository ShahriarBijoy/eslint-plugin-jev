# `jev/helpful-error-message`

Flags thrown error messages that give whoever reads the log nothing to act on.

In `jev.configs.recommended` at `warn`. Reports at the message, once per `throw`.

## What it asks

Every `throw` inside a function is asked about separately, with the message text and its line in
the state. A "yes" means the message is useless, so the probability in the message is the
probability that a reader would be stuck.

> **Instructions:** Would a developer reading the error message in
> `function.throws.<id>.message` in a log be unable to tell what went wrong or what to check next?
>
> **Yes:** The message is a bare code, a generic phrase such as something went wrong, failed, or
> invalid input, or names nothing the reader could act on. Examples: Error 42; Unexpected error;
> Invalid.
>
> **No:** The message names the failing thing, the bad value, the expected condition, or the next
> step. Examples: Expected a number but received string; Order has no items; Missing env var
> DATABASE_URL.

The default threshold is `0.85`, higher than the other rules: a slightly terse message is not worth
a warning, and the intent is to catch only the ones that are genuinely dead ends.

## Bad

```ts
// 13:44  Error message "Error 42" gives the reader nothing to act on (P=0.95, threshold 0.85)
export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error("Error 42");
  return repo.insert(order);
}
```

```ts
export function parseConfig(raw: string) {
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error("Invalid input");   // which input? invalid how?
  }
}
```

## Good

```ts
export function saveOrder(order: Order) {
  if (!order.items.length) throw new Error(`Order ${order.id} has no items`);
  return repo.insert(order);
}
```

```ts
export function parseConfig(raw: string, path: string) {
  try {
    return JSON.parse(raw);
  } catch (cause) {
    throw new Error(`Config at ${path} is not valid JSON`, { cause });
  }
}
```

Naming the failing thing, the bad value, or the expected condition is enough. It does not have to
be a paragraph.

## Options

```js
"jev/helpful-error-message": ["warn", { threshold: 0.85 }]
```

| Option | Type | Default | Meaning |
| --- | --- | --- | --- |
| `threshold` | number, 0.5–1 | `0.85` | Below this, the rule says nothing. |

Functions with no `throw` are not sent at all, so this rule is free on most of a codebase.

## Known false positives

**Rethrows and control-flow throws.** `throw err` or `throw new AbortError()` carries its meaning
in the type, not the string. The message is empty or near-empty, which looks unhelpful. If your
codebase uses typed errors heavily, this rule will have more to say than you want — raise the
threshold, or turn it off for the module.

**Messages assembled at runtime.** When the string is built from variables the model only sees the
template, so `` throw new Error(`${code}: ${detail}`) `` reads as a bare code even though the
runtime output is specific. Keep a literal word or two in the template and the answer flips:
`` throw new Error(`Payment ${code} rejected: ${detail}`) ``.

**Errors a user never reads.** A `throw new Error("unreachable")` in an exhaustiveness check is
deliberately terse and is doing its job. Disable it on the line:

```ts
// eslint-disable-next-line jev/helpful-error-message -- exhaustiveness guard
default: throw new Error("unreachable");
```

**Test helpers.** Assertion helpers that throw short messages on purpose are best excluded by file:

```js
{ files: ["**/*.test.ts", "test/**"], rules: { "jev/helpful-error-message": "off" } }
```
