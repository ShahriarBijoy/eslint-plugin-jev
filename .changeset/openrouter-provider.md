---
"@shahriarbijoy/eslint-plugin-jev": minor
---

Add OpenRouter as an alternative backend for answering Jev questions. A new `settings.jev.provider`
option (`"auto"`, `"typesafe"`, or `"openrouter"`) picks which backend runs the rules: `"auto"`
prefers TypeSafe when its key is present and otherwise falls back to OpenRouter, while the other
two values pin one backend regardless of which keys exist. OpenRouter reads its key from
`OPENROUTER_API_KEY` (environment, `.env`, or `~/.config/jev/config.json`), the same way the
existing TypeSafe key is resolved.

The on-disk answer cache is now keyed by the backend that answered a question, in addition to the
model id and the question itself. This means the first run after upgrading from 0.1.0, or after
switching `provider`, will refetch every previously cached answer instead of serving a stale hit
from the other backend.

The exported `Settings` type gained a required `provider` field to reflect this new option. Keep
using `JevSettings` (the partial version of `Settings`) to type a `settings.jev` block in your own
ESLint config, since every field there remains optional.

The configured model id is passed to OpenRouter unchanged; use `jev-latest` or an OpenRouter id
such as `typesafe/jev-1.13`, not a TypeSafe-only three-part id such as `jev-1.13.0`.
