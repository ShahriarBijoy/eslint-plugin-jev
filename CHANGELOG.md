# eslint-plugin-jev

## 0.3.0

### Minor Changes

- Cut false positives on `comment-matches-code` and `name-matches-body`.
  
  Measured against 19 hand-verified warnings from a real 2,000-function codebase, `comment-matches-code`
  goes from 7 correct out of 19 (precision 0.37) to 3 correct out of 5 (precision 0.60) at the default
  threshold, with false positives down from 12 to 2. Subtle contradictions now land between 0.58 and
  0.67, so the rule trades recall for quiet; see "Known misses" in the rule docs.
  
  - **`comment-matches-code` asks two questions instead of one.** The old question — does the comment
    describe behavior the body does not have — made every delegating function a true positive: a body
    that calls a helper genuinely does not contain the behavior its comment describes. It now asks
    whether the comment *contradicts* the function, crediting work done in helpers it calls and
    constants it references, and asks separately whether the body has a side effect the comment never
    mentions. Those are two different defects, so they now print two different messages: the
    `stale` messageId is replaced by `contradicts` and `hides`.
  
  - **A comment must touch the declaration to count as its documentation.** Every comment between the
    previous token and a function used to be concatenated into one blob, so a module header separated
    by a blank line was read as the first function's docblock — and when a file header and a real
    docblock were both present, the two were merged into a comment that described neither. The nearest
    adjacent comment now wins, which also moves the diagnostic onto the right line.
  
  - **Functions assigned to an object-literal key are no longer judged by `name-matches-body`.** A key
    like `select` is named by the interface that consumes the object, not by the author of the body, so
    navigating is the correct implementation. Same reasoning as the existing `^on[A-Z]` default; class
    methods are unaffected.
  
  - **New rule `jev/too-large`, on in `recommended`.** A function over `maxFunctionTokens` is never
    sent, and saying so used to borrow the rule id of whichever jev rule ran first — a 786-line
    component surfaced as a `name-matches-body` warning from a rule that never looked at it. The notice
    now has its own id, its own docs and its own off switch. It asks nothing, so it costs nothing.
  
  - **`recommended` switches `helpful-error-message` off in test files** (`**/*.test.*`, `**/*.spec.*`,
    `**/__tests__/**`, `**/__mocks__/**`). A throw inside a test is a guard for whoever is reading the
    failure, with the assertion and case name already on screen. The judgment rules stay on there.
  
  - **`comment-matches-code` has a bench label set.** Sixteen cases covering delegation, misattributed
    docblocks, hidden writes and contradictions of action, ordering and count: precision 1.00 and
    recall 0.75 at the default threshold. The two it misses are subtle contradictions, documented under
    "Known misses" — the same two kinds that miss on real code.

## 0.2.0

### Minor Changes

- bf62827: Add OpenRouter as an alternative backend for answering Jev questions. A new `settings.jev.provider`
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

## 0.1.0

### Minor Changes

- 159cd32: Initial release: name-matches-body, comment-matches-code, helpful-error-message, check.
