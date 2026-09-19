# Basic example

The smallest working setup for `eslint-plugin-jev`: a flat config, the TypeScript parser, and one
file with three functions — a name that lies, a stale comment, a useless error message, and one
function that is fine.

```bash
cd examples/basic
pnpm install              # or npm install
cp .env.example .env     # then paste your key from https://console.typesafe.ai
npm run lint
```

Expected output:

```
src/users.ts
   3:1   warning  Comment on "getUser" describes behavior the code does not have (P=0.98, threshold 0.80)  jev/comment-matches-code
   4:23  warning  Name says "getUser" but the body mostly does "delete" (P=0.98, threshold 0.80)           jev/name-matches-body
  13:44  warning  Error message "Error 42" gives the reader nothing to act on (P=0.95, threshold 0.85)     jev/helpful-error-message

✖ 3 problems (0 errors, 3 warnings)
```

The probabilities are what a real run produced; yours may differ by a hundredth or two. Without a
key in `.env`, the lint passes with no output — the rules disable themselves rather than fail.

`eslint-plugin-jev` is installed from `file:../..`, so run `pnpm build` in the repository root
first if you are working on the plugin itself.
