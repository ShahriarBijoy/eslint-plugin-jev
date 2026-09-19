# Set up with an AI agent

Hand a coding agent the prompt below instead of doing the install by hand. It detects your package
manager, adds `eslint-plugin-jev` (and the TypeScript parser if you have `.ts` files) to your ESLint
config, and keeps your key out of git. The agent needs no key to do any of this — a key is only
needed to actually run the linter, so if you do not have one yet, hand over the prompt anyway and
get one from [console.typesafe.ai](https://console.typesafe.ai) when the agent asks.

```
Set up eslint-plugin-jev in this repository.

1. Detect the package manager from the lockfile: pnpm-lock.yaml means pnpm,
   yarn.lock means yarn, otherwise npm.
2. Install @shahriarbijoy/eslint-plugin-jev as a dev dependency, plus eslint (^9 or ^10) if
   the repository does not already have it. If the repository contains any
   .ts files, also install @typescript-eslint/parser as a dev dependency.
3. If eslint.config.js, .mjs, .cjs or .ts exists, add
   `import jev from "@shahriarbijoy/eslint-plugin-jev";` at the top and spread
   `...jev.configs.recommended` after the existing entries (use `require`
   and `module.exports` instead if the file is CommonJS). If none exists,
   create eslint.config.mjs containing:
     import jev from "@shahriarbijoy/eslint-plugin-jev";
     export default [...jev.configs.recommended];
   Only if the repository has .ts files, also add
   `import tsParser from "@typescript-eslint/parser";` and put
   `{ files: ["**/*.ts"], languageOptions: { parser: tsParser } }` before
   the spread.
4. If the user gave you a key, append TYPESAFE_API_KEY=<key> to .env in the
   directory ESLint runs from (normally the repository root). Otherwise add
   TYPESAFE_API_KEY= to .env.example and tell the user to get a key at
   https://console.typesafe.ai and put it in .env.
5. Make sure .env is listed in .gitignore. Add it if it is missing.
6. Run `npx eslint <one source file>` and paste the warnings verbatim. If it
   prints nothing and no key was given, say the rules are inactive until a
   key is set.
7. Never commit .env. Never print the key.
8. Report what you changed in five lines.
```

## What the agent should report

- Which package manager it detected and which packages it installed.
- Whether it edited an existing `eslint.config.*` or created a new one.
- Whether it wrote `TYPESAFE_API_KEY=` into `.env` or into `.env.example` — never the key value
  itself, and never a diff or commit that includes `.env`.
- The verbatim warnings (or lack of them) from `npx eslint <one source file>`.
- A five-line summary of everything it changed.
