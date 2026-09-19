# Set up with an AI agent

Hand a coding agent the prompt below instead of doing the install by hand. It detects your package
manager, adds `eslint-plugin-jev` (and the TypeScript parser if you have `.ts` files) to your ESLint
config, and keeps your key out of git. The agent needs no key to do any of this — a key is only
needed to actually run the linter, so if you do not have one yet, hand over the prompt anyway and
get one from [console.typesafe.ai](https://console.typesafe.ai) when the agent asks.

```
Set up eslint-plugin-jev in this repository.

1. Detect the package manager from the lockfile: pnpm-lock.yaml means pnpm,
   yarn.lock means yarn, package-lock.json means npm. Default to npm.
2. Install eslint-plugin-jev as a dev dependency. If the repository contains any
   .ts files, install @typescript-eslint/parser as a dev dependency too.
3. If eslint.config.js, eslint.config.mjs or eslint.config.ts exists, add
   `import jev from "eslint-plugin-jev";` at the top and spread
   `...jev.configs.recommended` after the existing entries. If none exists,
   create eslint.config.js and put the TypeScript parser block first:
   { files: ["**/*.ts"], languageOptions: { parser: tsParser } }
4. If I gave you a key, append TYPESAFE_API_KEY=<key> to .env. If I did not,
   add the line TYPESAFE_API_KEY= to .env.example instead and tell me to get a
   key from https://console.typesafe.ai.
5. Make sure .env is listed in .gitignore. Add it if it is missing.
6. Run `npx eslint <one source file>` and report the warnings verbatim.
7. Never commit .env. Never print the key.

Report what you changed in five lines.
```

## What the agent should report

- Which package manager it detected and which packages it installed.
- Whether it edited an existing `eslint.config.*` or created a new one.
- Whether it wrote `TYPESAFE_API_KEY=` into `.env` or into `.env.example` — never the key value
  itself, and never a diff or commit that includes `.env`.
- The verbatim warnings (or lack of them) from `npx eslint <one source file>`.
- A five-line summary of everything it changed.
