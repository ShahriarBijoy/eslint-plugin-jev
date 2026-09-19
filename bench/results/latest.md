# Bench results: 10-case seed set (name-matches-body)

This is the initial seed run, not the full labeled set. Only
`bench/labels/name-matches-body.jsonl` exists so far, with 10 hand-written
cases (6 positives, 4 negatives). The other rules (`comment-matches-code`,
`helpful-error-message`) have no label files yet. Rule default thresholds in
`src/rules/*.ts` are **not** changed based on this seed run; that happens once
full ~50-case label sets exist per rule (see `bench/README.md`).

- Model: `jev-1.13.0`
- Input tokens: 4766
- Output tokens: 200
- Cost: $0.0002 (at $0.042 / 1M input tokens)
- Fetched: 10, cached: 0, errors: 0

```
name-matches-body  model=jev-1.13.0  cases=10  cost=$0.0002
threshold  precision  recall  flagged
0.60       1.00       1.00    5
0.70       1.00       1.00    5
0.80       1.00       0.80    4
0.85       1.00       0.80    4
0.90       1.00       0.80    4
0.95       1.00       0.80    4
```

Regenerate with:

```
set -a; . ./.env; set +a; pnpm bench && pnpm bench:report
```
