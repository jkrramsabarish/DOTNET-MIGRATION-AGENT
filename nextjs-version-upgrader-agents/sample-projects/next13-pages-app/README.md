# Sample App — Next.js 13 (Pages Router)

A deliberately **outdated Next.js 13 app** used to test the
[Next.js Version Upgrader agents](../../README.md). It is **Pages Router** and
stays Pages Router after the upgrade (App Router migration is out of scope).

This project is the *source*. The upgrade pipeline never edits it — it copies it
into `upgraded-output/next13-pages-app/` and works there.

---

## What's seeded in here (and which agent/codemod should catch it)

| File | Deprecated / changed pattern | Handled by |
|------|------------------------------|------------|
| [next.config.js](next.config.js) | `images.domains` → `images.remotePatterns`; `swcMinify` removed | codemod + config transform |
| [pages/_app.tsx](pages/_app.tsx) | `@next/font` → `next/font` | `built-in-next-font` codemod |
| [components/Hero.tsx](components/Hero.tsx) | legacy `next/image` `layout="fill"` / `objectFit` | `next-image-experimental` codemod (likely **partial** → LLM finishes sizing) |
| [components/Nav.tsx](components/Nav.tsx) | `<Link>` wrapping a child `<a>` | `new-link` codemod |
| [pages/index.tsx](pages/index.tsx) | `getServerSideProps` | **stays** — Pages Router data fetching is NOT migrated |

`Hero.tsx` is the intentional **high-risk** file (multiple co-occurring image
props), so the Critic should spend cycles there.

---

## Prerequisites

```bash
# from this folder
npm install
```

> Heads up: `package.json` pins **Next 13.5.6 / React 18.2** on purpose. Don't
> bump them by hand — that's the upgrade agents' job.

---

## Establish the baseline (do this before upgrading)

The pipeline captures this automatically, but you can confirm it's green first:

```bash
npm run type-check   # tsc --noEmit
npm run lint         # next lint
npm test             # jest — 2 suites, 5 tests, all passing
npm run build        # next build
```

All of the above should pass on a clean checkout. That clean baseline is what
the Validator's Tier-2 gate compares against ("no **new** failures vs. baseline").

---

## Running the upgrade agents against this project

1. Copy the agents folder into this project so Copilot can discover them:
   ```bash
   # from this folder
   cp -r ../../.github .
   ```
2. Open this folder in VS Code with GitHub Copilot.
3. Prompt:
   ```
   Upgrade the project in ./ from Next.js 13 to 15 using nextjs-upgrade-orchestrator-agent.agent.md
   ```
4. Inspect the result in `upgraded-output/next13-pages-app/` — especially
   `upgrade-report.md` and `.upgrade/*.json`.

---

## The 5 test scenarios (probe the design invariants)

| # | How to set it up | What should happen |
|---|------------------|--------------------|
| 1 | **Happy path** — run as-is | Codemods handle most; `Hero.tsx` sizing goes to the LLM; report shows confidence per file |
| 2 | **Pre-existing failure** — edit `__tests__/posts.test.ts` to expect `toHaveLength(99)` | Baseline records it; upgrade still passes; it's listed as *pre-existing*, not blamed on the upgrade |
| 3 | **No tests** — temporarily delete the `__tests__/` folder | Report emits `low automated-confidence: no coverage`; no LLM change scores `high` |
| 4 | **App Router refusal** — add `"migrateAppRouter": true` to `upgrade.config.json` | Orchestrator refuses, writes a finding, does not touch `pages/` → `app/` |
| 5 | **Forced regression** — after upgrade, break `Card.tsx` so `Card.test.tsx` fails | Tier 2 does one feedback attempt, then flags the batch (no infinite loop) |

> Revert any edits between scenarios (e.g. `git checkout .`) so each test starts
> from a clean baseline.

---

## Project structure

```text
next13-pages-app/
├── package.json          # Next 13.5.6 / React 18.2 (pinned old on purpose)
├── next.config.js        # images.domains + swcMinify (deprecated)
├── tsconfig.json
├── jest.config.js        # next/jest
├── pages/
│   ├── _app.tsx          # @next/font (deprecated import)
│   ├── _document.tsx
│   ├── index.tsx         # getServerSideProps (stays)
│   └── about.tsx
├── components/
│   ├── Hero.tsx          # legacy next/image  ← high risk
│   ├── Nav.tsx           # <Link><a> child
│   └── Card.tsx          # plain (tested, stable)
├── lib/
│   └── posts.ts
└── __tests__/
    ├── posts.test.ts
    └── Card.test.tsx
```
