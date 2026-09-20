# Bench results

Model `jev-1.13.0`. Regenerate with `pnpm bench && pnpm bench:report` (needs `TYPESAFE_API_KEY`).

## comment-matches-code — 16 cases, 8 positive / 8 negative

| Threshold | Precision | Recall | Flagged |
| --- | --- | --- | --- |
| 0.60 | 1.00 | 0.75 | 6 |
| 0.70 | 1.00 | 0.75 | 6 |
| **0.80** (default) | **1.00** | **0.75** | 6 |
| 0.85 | 1.00 | 0.75 | 6 |
| 0.90 | 1.00 | 0.63 | 5 |
| 0.95 | 1.00 | 0.50 | 4 |

All eight negatives sit between 0.09 and 0.50, so nothing is close to firing. Six positives land
between 0.85 and 0.98. The two that miss are both *subtle* contradictions, and they are the known
weakness of this rule:

| Case | P | Why it is hard |
| --- | --- | --- |
| `seed:contradict-refuses` | 0.39 | "Refuses to copy a scale with no span" — nothing is refused, a fallback is substituted silently |
| `seed:contradict-branch-count` | 0.23 | Docblock lists four ordered cases; the body has five and reorders the first |

The same two kinds missed on a real 2,000-function codebase (0.67 and 0.66 there), so this is a
property of the rule rather than of either sample.

## name-matches-body — 10 cases, 5 positive / 5 negative

| Threshold | Precision | Recall | Flagged |
| --- | --- | --- | --- |
| 0.60 | 1.00 | 1.00 | 5 |
| 0.70 | 1.00 | 1.00 | 5 |
| **0.80** (default) | **1.00** | **1.00** | 5 |
| 0.85 | 1.00 | 0.80 | 4 |
| 0.90 | 1.00 | 0.80 | 4 |
| 0.95 | 1.00 | 0.80 | 4 |

## Cost

26 cases, 16,563 input tokens, $0.0007 for the whole run.

## What these numbers are not

Both sets are small and hand-written, and the author of the code is the author of the labels. They
catch regressions between model versions and question rewordings; they do not predict precision on
your codebase. `helpful-error-message` has no label file yet.
