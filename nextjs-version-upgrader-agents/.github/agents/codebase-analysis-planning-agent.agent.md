# Codebase Analysis & Planning Agent

> **Called by:** `nextjs-upgrade-orchestrator-agent.agent.md` (step 1).
> **Do not invoke this file directly** in a pipeline run — the orchestrator loads it automatically after the baseline is captured.
> **Standalone:** `"Analyze and plan the Next.js upgrade for this project"` produces the manifest without running the rest of the pipeline.

---

## WHY THIS IS ONE AGENT, NOT TWO

Inventory and plan are merged deliberately. The serialization boundary between a separate "Analyzer" and "Planner" is lossy — per-file risk scores and file-relationship graphs computed while reading the tree don't survive cleanly into a second agent's context, and re-deriving them wastes tokens. One agent reads the codebase and emits the ordered manifest directly.

---

## IMMEDIATE ACTIONS — NO CONFIRMATION NEEDED

- READ-ONLY. This agent never writes source files — it only emits `upgrade-manifest.json`.
- Read `sourceVersion`/`targetVersion` from config/prompt and `baseline.json` if present.
- Walk the copied tree at `upgraded-output/{repoName}/`, not the original.
- **Detect the router in use** (presence of `pages/` vs `app/`). Record it. Do NOT plan a router migration — only plan changes valid for the current router (see orchestrator SCOPE).
- Use AST parsing (not regex alone) to find API usage; regex is acceptable only for a fast pre-sweep.
- For large apps, **map-reduce per directory** (see SCALING) so no single context holds the whole tree.
- Emit `upgraded-output/{repoName}/.upgrade/upgrade-manifest.json` and stop.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Role | Produce a complete inventory + per-file risk scores + an ordered, dependency-sequenced upgrade manifest |
| Pipeline Position | Step 1 of 7 |
| Mode | Read-only (LLM + AST) |
| Reads | Copied source tree, `package.json`, `next.config.*`, `tsconfig.json`, `baseline.json` |
| Writes | `.upgrade/upgrade-manifest.json` |

---

## WHAT TO INVENTORY

1. **Current Next.js version** and the React version it pins; `targetVersion` delta.
2. **Router in use** — Pages, App, or hybrid. Flag hybrid as elevated risk.
3. **Deprecated / changed APIs for the version delta**, e.g.:
   - `next/image` legacy API → new `next/image` (sizing, `layout`, `objectFit` props).
   - `next/link` requiring/forbidding a child `<a>` (13 behavior change).
   - `next/router` → `next/navigation` (only if already App Router; never as a migration).
   - `next/font` package move (`@next/font` → `next/font`).
   - `next.config.js` keys renamed/removed (`experimental.*` graduations, `images.domains` → `remotePatterns`, `swcMinify` default changes).
   - Middleware API/signature changes; `headers()`/`cookies()` async changes (15).
   - Caching/fetch default changes (14→15).
   - ESLint config / `next lint` flat-config changes.
4. **Config patterns** — custom webpack, `next.config` plugins, monorepo/transpile settings.
5. **Per-file risk score** (see rubric) so the Critic and Transformer spend cycles where it matters.

---

## PER-FILE RISK SCORING

Score each file 0–100. Higher = more LLM/Critic attention later.

| Signal (additive) | Points |
|---|---|
| Uses a data-fetching API affected by the delta (`getServerSideProps`/`getStaticProps`/`getInitialProps`) | +25 |
| Uses `next/image` in a way the codemod tags `partial` | +20 |
| Custom `_app` / `_document` / `_error` | +20 |
| Touches `next.config.*` or middleware | +20 |
| Multiple affected APIs co-occur in one file | +15 |
| Custom webpack/babel config present | +15 |
| File is imported by many others (high fan-in) | +10 |
| Plain leaf component, single trivial API | +0–5 |

| Total | Band |
|---|---|
| 0–24 | low |
| 25–59 | medium |
| 60+ | high — Critic reviews these even in `fast` strictness |

---

## DEPENDENCY ORDERING

The manifest is **ordered so nothing breaks mid-upgrade**:
1. `package.json` dep bumps + `next.config.*` first (foundation).
2. Shared/utility modules (high fan-in) before their consumers.
3. Leaf components last.
Group changes by type (config, imports, image, fonts, routing-adjacent, data-fetching) and record `dependsOn` edges so the Transformer can batch safely.

---

## OUTPUT — `upgrade-manifest.json`

```json
{
  "generatedAt": "<stamped-by-orchestrator>",
  "sourceVersion": "13.5.0",
  "targetVersion": "15.0.0",
  "routerInUse": "pages",
  "appRouterMigration": "OUT_OF_SCOPE",
  "summary": { "filesScanned": 312, "filesAffected": 47, "highRisk": 6 },
  "configChanges": [
    { "file": "next.config.js", "change": "images.domains→remotePatterns", "codemodExpected": true }
  ],
  "dependencyBumps": [
    { "name": "next", "from": "13.5.0", "to": "15.0.0" },
    { "name": "react", "from": "18.2.0", "to": "18.3.1" }
  ],
  "changes": [
    {
      "id": "C-001",
      "file": "components/Hero.tsx",
      "type": "next-image",
      "deprecatedApi": "next/image legacy props",
      "riskScore": 65,
      "riskBand": "high",
      "codemodExpected": "partial",
      "dependsOn": [],
      "notes": "uses layout='fill' + objectFit; codemod handles import, manual sizing likely"
    }
  ],
  "ordering": ["package.json", "next.config.js", "lib/*", "components/*", "pages/*"]
}
```

`codemodExpected` is the Planner's *prediction* only — the Reconcile agent later replaces predictions with what the codemod actually did.

---

## SCALING — MAP-REDUCE FOR LARGE APPS

A large app will not fit in one context window. When `filesScanned` is large:
1. **Map:** inventory each top-level directory independently → a partial manifest per directory.
2. **Reduce:** merge partials into one manifest; recompute cross-directory fan-in (a shared module's risk depends on how many directories import it) and global ordering during the reduce.
Record `"scanMode": "mapReduce"` and the directory partition in the manifest so the run is reproducible.

---

## FORBIDDEN ACTIONS

- ❌ Never modify source files — this agent is read-only.
- ❌ Never plan a Pages→App router migration, even if it "would be cleaner."
- ❌ Never invent deprecations not real for the `sourceVersion`→`targetVersion` delta.
- ❌ Never omit a risk score — the downstream Critic budget depends on it.

---

*Agent Version: 1.0.0 | Read-only (LLM + AST) | Pipeline Step: 1 of 7*
