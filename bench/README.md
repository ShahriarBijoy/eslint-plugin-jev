Labeled functions for measuring each rule. One JSONL file per rule. Each line:
{ "id": "repo:path:name", "rule": "name-matches-body", "expected": true|false, "unit": <FunctionUnit fields: name, signature, comment, body, throws> , "note": "why" }
`expected: true` means a human says the rule SHOULD fire. Aim for 50 lines per rule, at least 20 positives, drawn from bench/repos.json plus hand-written edge cases (hooks, handlers, getters, overloads).
Run `pnpm bench` (needs TYPESAFE_API_KEY) then `pnpm bench:report`.

See `bench/results/latest.md` for the current numbers.

## Labels from a private codebase

The most useful cases come from real repositories, and the bodies go into the label file verbatim —
so a label set built from private source cannot be committed here. Put those in `bench/.local/`,
which is gitignored, and keep a synthetic reduction in `bench/labels/` that preserves the *pattern*
(delegation to a helper, a docblock that drifted one function up, a count that disagrees with the
body) without the original code. The synthetic case is what protects the rule in CI; the private one
is what tells you whether a change actually helped.

Every case in `comment-matches-code.jsonl` is a reduction of a warning from one such run. Keeping
both mattered: the two cases this rule still misses were found on the private set first and
reproduced on the synthetic one afterwards, which is what made them a known limitation rather than a
one-repo fluke.
