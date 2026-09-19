Labeled functions for measuring each rule. One JSONL file per rule. Each line:
{ "id": "repo:path:name", "rule": "name-matches-body", "expected": true|false, "unit": <FunctionUnit fields: name, signature, comment, body, throws> , "note": "why" }
`expected: true` means a human says the rule SHOULD fire. Aim for 50 lines per rule, at least 20 positives, drawn from bench/repos.json plus hand-written edge cases (hooks, handlers, getters, overloads).
Run `pnpm bench` (needs TYPESAFE_API_KEY) then `pnpm bench:report`.

See `bench/results/latest.md` for the current numbers.
