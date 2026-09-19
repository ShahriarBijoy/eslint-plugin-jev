# `jev/check`

Your own rule, written as a sentence. `check` asks each of your questions about every function in
the file and reports the ones that come back yes.

Not in `jev.configs.recommended` — it does nothing until you give it a question.

## What it asks

Whatever you write, plus one fixed sentence the plugin appends so the model judges the function in
front of it and nothing else:

> `<your question>` **Judge only `function` in the state.**

The function is given to the model as named fields you can point at from the question:

| Field | Contents |
| --- | --- |
| `function.name` | `getUser`, or `Service.getUser` for a method |
| `function.signature` | the declaration line, e.g. `async function getUser(id: string)` |
| `function.comment` | the comment block above it, when there is one |
| `function.body` | the body, one line per line, tagged `L001|`, `L002|` … |
| `function.throws` | each `throw` in the body: its message and its line tag |

Reference them with backticks, exactly as in the built-in rules: ``Does `function.body` write to
disk?``

Unless you turn it off, a second question asks which line of the body is most responsible, so the
warning lands on that line instead of on the function name.

## Writing a question that works

Three rules, and they matter more than the wording:

1. **Yes means the code is bad.** The threshold is a floor on "yes", so a question like *"Is this
   function well named?"* reports every *good* function. Ask *"Does this function ... ?"* about the
   thing you do not want.
2. **No negations.** *"Does this function fail to validate its input?"* makes the model resolve a
   double negative before it can answer. Ask *"Does this function use its arguments without
   checking them first?"*
3. **Say what no looks like too.** If you add `criteria`, write the two sides against each other
   with concrete examples in both. A criterion that only describes yes leaves the boundary to
   chance.

Keep one question to one judgment. Two things you care about are two checks with two ids — they
cost the same, ride in the same request, and give you two thresholds to tune.

## Bad

```js
"jev/check": ["warn", {
  checks: [
    { id: "no-secret-logging",
      question: "Does this function log, print, or put into an error message anything that looks like a secret, token, password, or API key?" },
  ],
}]
```

```ts
export function debugAuth(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  console.log("auth attempt", { apiKey });
  return verify(apiKey);
}
```

```
  3:1  warning  [no-secret-logging] Does this function log, print, or put into an error message anything that looks like a secret, token, password, or API key? Yes (P=0.97, threshold 0.80).  jev/check
```

The warning is on line 3 because the line question picked it out.

## Good

```ts
export function debugAuth(req: Request) {
  const apiKey = req.headers.get("x-api-key");
  console.log("auth attempt", { keyPresent: Boolean(apiKey) });
  return verify(apiKey);
}
```

## A check with criteria

```js
{ id: "user-facing-copy",
  threshold: 0.85,
  question: "Does this function build a message shown to end users that contains internal jargon, stack traces, or identifiers a user would not understand?",
  criteria: {
    true: "The function returns or renders a string for an end user containing a stack trace, an internal error code, a database column or table name, a UUID, or a class name. Examples: `Error: PG_23505 on users_email_key`; `Failed in OrderServiceImpl`.",
    false: "The function builds no user-facing string, or the string is written in ordinary language even if it mentions a product concept. Examples: `That email address is already registered`; `Your order could not be saved, please try again`.",
  },
}
```

## Options

```js
"jev/check": ["warn", {
  checks: [
    { id: "no-secret-logging", question: "...", threshold: 0.8, locate: true, criteria: { true: "...", false: "..." } },
  ],
}]
```

| Field | Type | Default | Meaning |
| --- | --- | --- | --- |
| `id` | string, `^[a-z0-9-]+$` | required | Shown in the message, and the name you disable. Duplicate ids: the first definition wins. |
| `question` | string, 8 characters or more | required | The question, phrased so yes means bad. |
| `threshold` | number, 0.5–1 | `0.8` | Per check, not shared with the others. |
| `locate` | boolean | `true` | `false` reports at the function name and skips the line question, which is slightly cheaper. |
| `criteria` | `{ true, false }`, both required | none | Contrastive descriptions of the two answers. |

The line question only moves the warning when the model is at least 0.6 sure of a line, and the
line has to be inside the body. Otherwise the warning lands on the function name.

## Known false positives

**The question is doing two jobs.** *"Does this function log a secret or return an unvalidated
value?"* gets one probability for two different problems, and you cannot tell which one fired.
Split it.

**The question asks about things outside the function.** The model only sees the one function —
no callers, no imports, no other files. *"Is this function called with untrusted input?"* cannot be
answered and will produce noise. Ask about what is visible in the body.

**Convention-named functions.** `settings.jev.ignoreNames` applies to `name-matches-body` only, so
if your question is about naming you will hear about every `useThing` and `onClick`. Say so in the
question, or scope the rule by file:

```js
{ files: ["src/**"], ignores: ["src/**/hooks/**"], rules: { "jev/check": ["warn", { checks: [...] }] } }
```

**Everything fires, or nothing does.** Almost always a phrasing problem, not a threshold problem.
Check the direction first (yes = bad), then re-read the question for a hidden negation. Put a few
functions you know the answer for into `bench/labels/` and measure before you move the number.

To silence one case:

```ts
// eslint-disable-next-line jev/check -- the key is redacted by the logger transport
```

That disables every check on that line; ESLint has no way to disable a single `id`. If you need
that granularity, put the check in its own config object scoped to the files it applies to.
