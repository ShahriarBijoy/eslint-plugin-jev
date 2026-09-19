# Contributing

Thanks for looking. Bug reports, rule ideas, and better question wording are all useful — the
wording of the questions is most of what makes this plugin work or not work, so a PR that only
changes a sentence is a real contribution.

## Setup

Node 20, 22 or 24 (CI runs all three) and pnpm 10.

```bash
pnpm install
```

## Running the tests

**The whole test suite runs offline and needs no API key.** The bridge that would call TypeSafe is
replaced by a fixture file through the `JEV_FAKE_ANSWERS` environment variable, so tests are fast,
free, and deterministic.

```bash
pnpm typecheck   # tsc --noEmit
pnpm lint        # eslint .
pnpm test        # vitest run
pnpm build       # tsup -> dist/
```

Run all four before opening a PR; CI runs exactly these, on three Node versions, plus
`npm publish --dry-run` to check what ends up in the tarball.

`pnpm test:watch` while you work.

## Running against the real model

Two scripts talk to the live API. **They cost money and they are not part of the test suite.** Both
need a key:

```bash
echo 'TYPESAFE_API_KEY=...' >> .env    # .env is git-ignored; never commit it
set -a; . ./.env; set +a
```

```bash
pnpm build && pnpm smoke      # lints a 3-function file end to end, prints diagnostics and timings
pnpm bench && pnpm bench:report   # scores the labeled cases, prints precision/recall per threshold
```

`pnpm smoke` is a handful of requests. `pnpm bench` costs about $0.0002 per 10 labeled cases and
writes `bench/results/latest.md`. Commit that file when the numbers change; the per-case JSON next
to it is git-ignored.

Never paste a key, or any output containing one, into an issue, a test fixture, or a commit.

## Site

`site/` is a static page: no build step, no framework, no runtime dependencies. It is served by
GitHub Pages straight from `main` whenever a push touches `site/**` (see
`.github/workflows/pages.yml`).

To preview it locally, run a plain file server inside the directory:

```bash
cd site && python -m http.server
```

Opening `site/index.html` directly with a `file://` URL does not work — the demo fetches
`replay.json`, and browsers block `fetch` against `file://` paths, so the page needs to be served
over HTTP even locally.

The demo never calls TypeSafe; it replays `site/replay.json`, a recording of real plugin output. To
re-record it after changing the plugin, a rule, or an example file:

```bash
pnpm build && pnpm record:replay   # needs TYPESAFE_API_KEY in .env, same as pnpm smoke/bench
```

Commit the regenerated `site/replay.json` along with your change. Check that the `orders` example is
still flagged by `name-matches-body`; it recorded at P=0.81 against a 0.80 threshold.

## Adding a rule

A rule is three small pieces and a test. Take `src/rules/comment-matches-code.ts` as the template —
it is the shortest one.

1. **Write the question** in `src/questions/specs.ts`. Export a function returning a
   `Record<string, Question>`: one `noul` for the judgment, plus any companion `choice` that the
   message or the location needs. The question wording rules are below.

2. **Write the rule** in `src/rules/<name>.ts` with `createJevRule`. You supply:
   - `name`, `description`, `type`, `schema` and `defaultOptions` (the threshold lives here),
   - `messages` — always include `P={{p}}, threshold {{threshold}}` so a user can tune from output,
   - `select(unit, options, settings)` — return `false` for functions that should not be asked
     about at all. This is the cheapest thing in the plugin; use it. `comment-matches-code` skips
     every function without a comment, `helpful-error-message` every function without a `throw`.
   - `questions(unit, options)` — what to ask for a selected function,
   - `report({ context, unit, options, answer })` — compare to the threshold and call
     `context.report`. Suggestions only; no `fix` on the report itself.

3. **Register it** in `src/index.ts` under `rules`, and add it to `configs.recommended` if it
   belongs there.

4. **Add fake answers** for it in `tests/fixtures/fake-answers-rules.json`. The file is keyed by
   function name, then by `<rule-name>:<question-id>`:

   ```json
   "staleComment": { "comment-matches-code:main": { "noul": 0.88 } }
   ```

   A `choice` answer looks like
   `{ "choice": "delete", "probabilities": { "delete": 0.9 }, "confidence": 0.9 }`.

5. **Write the rule test** in `tests/rules/<name>.test.ts` with ESLint's `RuleTester`, copying the
   header from an existing one (it points `JEV_FAKE_ANSWERS` at the fixture). Cover: the rule
   firing, a value just below the threshold staying silent, a custom threshold, and whatever
   `select` is supposed to skip.

6. **Write `docs/rules/<name>.md`** — `meta.docs.url` points at it, so the file has to exist with
   that exact name. Quote the real instruction text, give a bad example and a good one, list the
   options with defaults, and be honest about the false positives you know of. Then add a row to
   the rules table in the README.

## Writing the question

This is the part that decides whether a rule is any good.

- **True means the code is bad.** The threshold is a floor on the probability of "yes", so the
  question has to ask about the *problem*. "Does the name promise a different action than the body
  performs?" — not "Is this function well named?".
- **Write both criteria, contrastively.** `true` and `false` are two descriptions of the same
  boundary from opposite sides. Put concrete examples in both, including the near-misses you want
  to land on the `false` side ("getUser that reads from a cache then the database").
- **No negations.** "Does this function fail to validate its input?" forces a double negative.
  Rewrite it as a positive description of the bad thing.
- **One judgment per question.** Two concerns are two questions; they travel in the same request
  and cost the same, and you get two probabilities you can threshold separately.
- **Only what is in the state.** The model sees one function: its name, signature, comment, body
  and throw sites. It has no callers, no imports, no other files. A question that needs them will
  produce noise.

The question payloads are snapshot-tested in `tests/questions/`, so any change to wording shows up
as a diff in the PR. That is on purpose — reviewers should see it.

Changing a default threshold needs numbers, not an argument: add labeled cases to
`bench/labels/<rule>.jsonl`, run the bench, and put the table in the PR.

## Releasing

Every user-visible change needs a changeset:

```bash
pnpm changeset
```

Pick the bump, write one line about what changed, and commit the generated file in `.changeset/`.
Merging to `main` opens a "Version Packages" PR; merging *that* publishes to npm. Maintainers do
not publish by hand.

## License

By contributing you agree that your contributions are licensed under the [MIT License](LICENSE).
