# `jev/too-large`

Reports a function that is too big to be judged, instead of skipping it in silence.

In `jev.configs.recommended` at `warn`. Asks the model nothing, so it costs nothing.

## Why it exists

Functions estimated over `settings.jev.maxFunctionTokens` (default `6000`) are never sent. Without a
diagnostic that is indistinguishable from a clean bill of health: the biggest function in the file,
the one most likely to have drifted from its comment, is the one nothing checked.

It has its own rule id because it is a notice, not a judgment. It used to be reported through
whichever jev rule happened to run first, so a 786-line component appeared as a
`jev/name-matches-body` warning — a rule that never looked at it — and padded that rule's count in
every summary.

```
570:10  warning  eslint-plugin-jev: `PreferencesSection` skipped, about 7602 tokens exceeds
                 settings.jev.maxFunctionTokens  jev/too-large
```

## Options

None. The budget lives in `settings.jev.maxFunctionTokens`, because the worker needs it too:

```js
settings: { jev: { maxFunctionTokens: 6000 } }
```

Tokens are estimated at 4 characters each, before the request is built. The estimate is deliberately
cheap and slightly pessimistic; it is a budget guard, not an accounting of what you were billed.

## Turning it off

If you would rather oversized functions stay quiet, switch off the rule rather than raising the
budget — a larger budget means a larger request, and a function that big rarely produces a sharp
answer anyway:

```js
rules: { "jev/too-large": "off" }
```

A function this size is usually worth splitting on its own merits. `max-lines-per-function` is the
rule that counts it exactly, for free.
