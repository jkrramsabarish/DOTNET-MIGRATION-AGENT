# Next.js Version Upgrader — Multi-Agent System

An automated, **deterministic-first** pipeline that upgrades a Next.js project from one version to another (e.g. 13 → 15) using a set of cooperating GitHub Copilot agents. Each agent has a single responsibility; an orchestrator drives them in sequence.

The agents live in [.github/agents/](.github/agents/) as `*.agent.md` files. You hand the **orchestrator** file to Copilot, and it resolves and runs the rest automatically.

---

## Design philosophy — the three principles everything is built on

This system is deliberately **not** "an LLM rewrites your whole codebase." It is built around three rules that make a version upgrade *correct*, not just *plausible*:

1. **Deterministic-first.** Official `@next/codemod` transforms (which Vercel maintains and tests against real codebases) do the bulk of the work. The compiler, linter, test runner, and `next build` decide correctness. An LLM is used **only** for the ambiguous residual that tooling cannot handle. This shrinks cost and the hallucination surface.

2. **Behavior-preserving, not just well-formed.** "It compiles" is the wrong success metric. The pipeline captures a **baseline** of the project *before* touching anything, and the authoritative gate is **"no new test failures vs. that baseline"** — never "all tests are green." A project with pre-existing failures can still be upgraded, and those failures are never blamed on the upgrade.

3. **Non-destructive.** The original source tree is never modified. Everything is written to an isolated `upgraded-output/{repoName}/` folder — the original *is* the backup.

> **Out of scope by design:** Pages Router → App Router *migration* (converting `pages/` → `app/`, `getServerSideProps` → server components, etc.). That is a re-architecture, not a version bump. Pages Router is fully supported on every target version. The orchestrator **refuses** `migrateAppRouter: true` and emits a report finding instead.

---

## Architecture at a glance

```text
                          User Request
                               │
                               ▼
              ┌─────────────────────────────────────┐
              │   Orchestrator Agent  (coordinator)  │
              │   detect mode · detect package mgr   │
              │   ★ capture BASELINE before changes  │
              └─────────────────────────────────────┘
                               │
        [1]  Codebase Analysis & Planning Agent      (LLM + AST)
             inventory + per-file risk + ordered manifest
                               │
        [2]  Codemod Runner Agent                    (deterministic)
             @next/codemod FIRST · tags handled/partial/skipped
                               │
        [3]  Reconciliation Agent                    (deterministic)
             residuals = manifest ∩ what codemod ACTUALLY did
                               │
        [4]  Code Transformation Agent               (LLM)
             rewrites ONLY the residual · per-batch branch
                               │
            ┌──────────────────┴───────────────────┐
            ▼  RETRY LOOP (per batch, max 2×)       │
        [5] Validation Agent  — Tier 1: tsc + ESLint (seconds)
            └──────────────────┬───────────────────┘
                               ▼  (loop passed)
        [5] Validation Agent  — Tier 2: test suite vs BASELINE
                               │
        [6]  Critic Agent                            (LLM, targeted)
             semantic correctness of high-risk LLM diffs · veto max 1×
                               │
        [5] Validation Agent  — Tier 3: full `next build` (once, at end)
                               │
        [7]  Reporting Agent                         (deterministic)
             objective confidence + structured manual-review artifact
                               │
            ┌──────────────────┴──────────────────┐
            ▼                                      ▼
     Auto-applied changes                   Flagged batches
     (high-confidence, ready)               (isolated per branch)
```

**Of the eight agents, only two are LLMs** (Codebase Analysis & Planning, and Code Transformation) plus the targeted Critic. Everything else is deterministic tooling. That ratio is the whole point.

---

## The agents

| # | Agent | File | LLM? | One-line job |
|---|-------|------|------|--------------|
| 0 | **Orchestrator** | [nextjs-upgrade-orchestrator-agent](.github/agents/nextjs-upgrade-orchestrator-agent.agent.md) | — | Coordinates the pipeline; captures the baseline; routes feedback/flags |
| 1 | **Codebase Analysis & Planning** | [codebase-analysis-planning-agent](.github/agents/codebase-analysis-planning-agent.agent.md) | ✅ | Inventories the project, scores per-file risk, emits an ordered upgrade manifest |
| 2 | **Codemod Runner** | [codemod-runner-agent](.github/agents/codemod-runner-agent.agent.md) | ❌ | Runs official `@next/codemod`; tags each change handled/partial/skipped |
| 3 | **Reconciliation** | [reconciliation-agent](.github/agents/reconciliation-agent.agent.md) | ❌ | Computes the residual against what the codemod *actually did* |
| 4 | **Code Transformation** | [code-transformation-agent](.github/agents/code-transformation-agent.agent.md) | ✅ | LLM rewrites only the residual, into isolated per-batch branches |
| 5 | **Validation** | [validation-agent](.github/agents/validation-agent.agent.md) | ❌ | Tiered, deterministic checks gated against the baseline |
| 6 | **Critic** | [critic-agent](.github/agents/critic-agent.agent.md) | ✅ | Reviews semantic correctness of high-risk LLM diffs only; can veto once |
| 7 | **Reporting** | [reporting-agent](.github/agents/reporting-agent.agent.md) | ❌ | Produces the report + objective confidence + manual-review artifact |

### 0 · Orchestrator Agent ⭐ *(the one you invoke)*
The central coordinator. It:
- reads `sourceVersion`/`targetVersion` from your prompt or `upgrade.config.json` (prompt wins),
- auto-detects the package manager from the lockfile (npm / yarn / pnpm),
- detects the **mode** (Single File / Multi-File / Full Project),
- **captures the baseline** (install → tests → type/lint → optional build) *before any change*,
- runs each sub-agent in order, routes retry/veto feedback, and triggers the final report.
It never edits code itself and never asks "should I proceed?" mid-run.

### 1 · Codebase Analysis & Planning Agent (LLM + AST)
Analysis and planning are merged on purpose — splitting them loses risk scores and file relationships across a context boundary. It reads the copied tree and emits `upgrade-manifest.json`: the current version, router in use, every deprecated/changed API for the version delta, config patterns, **per-file risk scores**, and a **dependency-ordered** change list (config → shared modules → leaf components). For large apps it map-reduces per directory so no single context holds the whole tree. Read-only.

### 2 · Codemod Runner Agent (deterministic)
Runs `@next/codemod` **first**, before any LLM touches code. It chains the codemod sets for each major crossed (13→14→15) and tags every change `handled` ✓ / `partial` ⚠ / `skipped` ✗, recording exactly what each transform did. The LLM later sees only `partial`/`skipped` items — never code the codemod already fixed.

### 3 · Reconciliation Agent (deterministic)
The manifest contains the planner's *predictions*; the codemod recorded *reality*. This agent reconciles them so the LLM and the actual tree agree before any LLM call — preventing over-migration (re-fixing what's done) and under-migration (missing what the codemod skipped). It also runs the deterministic under-/over-migration sweeps here, so the Critic doesn't have to.

### 4 · Code Transformation Agent (LLM)
The workhorse — but a narrow one. It rewrites **only the residual**, batch by batch, with each batch written into an **isolated git branch/worktree**. It applies the minimal idiomatic change for the target version, completes partial codemod work (e.g. async `cookies()`/`headers()` propagation in v15), and inserts `// TODO [UPGRADE]` for anything not *safely* auto-fixable rather than guessing. It is forbidden from masking errors with `any`/`@ts-ignore`.

### 5 · Validation Agent (deterministic, tiered)
Runs the project's own toolchain — no LLM guesses about syntax or types. Three tiers, ordered by cost:

| Tier | Runs | When | Loop? | Gate |
|------|------|------|-------|------|
| 1 | `tsc --noEmit` + ESLint | per batch | retry ≤ 2× | no new diagnostics vs baseline |
| 2 | the existing test suite | once, after Tier 1 | one feedback attempt | **no new failures vs baseline** |
| 3 | full `next build` | once, at the very end | no loop | build succeeds |

Tier 2 is authoritative — it's the only check that proves *behavior* is preserved. Tier 3 is the only check that catches cross-batch integration breakage; because it runs outside every loop, a Tier-3 failure flags the whole run and lists the suspect batches by the files they touched.

### 6 · Critic Agent (LLM, targeted) ⭐
Deliberately narrow. The cheap, deterministic checks (missed deprecations, unneeded changes) already ran in Reconciliation, so the Critic judges the one thing scripts can't: **is this LLM rewrite semantically correct?** By default (`fast` strictness) it reviews only high-risk LLM diffs; `strict` reviews every LLM diff. It can **veto once** — routing one re-transform — then flags rather than looping. It never edits code and never blocks the pipeline from reaching the report.

### 7 · Reporting Agent (deterministic)
Produces `upgrade-report.md` and a structured `manual-review.json`. Two key behaviors:
- **Confidence is objective**, never self-reported — computed from a rubric over facts the pipeline already has (source = codemod vs LLM, passed Tier 1/2, covered by tests, Critic verdict, diff size, risk band). An LLM change on an untested file can never score `high`.
- **The manual-review list is a first-class structured artifact** (file · what was attempted · why flagged · what the human must decide), not a paragraph buried at the end.

---

## How a run flows (Full Project mode)

1. **Init + Baseline** — copy the source into `upgraded-output/{repoName}/`, install deps, run tests + type/lint (+ optional build), write `baseline.json` (including pre-existing failures and `testsExist`).
2. **Analyze & Plan** → `upgrade-manifest.json`.
3. **Codemods** run first → `codemod-result.json`.
4. **Reconcile** → `residuals.json` (only what's left for the LLM).
5. **Transform** the residual in isolated batches.
6. **Validate Tier 1** per batch (retry ≤ 2×, else flag the batch).
7. **Validate Tier 2** — tests vs baseline (one feedback attempt, else flag).
8. **Critic** reviews high-risk LLM diffs (veto ≤ 1×, else flag).
9. **Validate Tier 3** — full `next build`, once, at the end.
10. **Report** — confidence-scored changes + manual-review artifact.

**Feedback loops are all capped** — Tier-1 retries ≤ 2, Tier-2 one attempt, Critic veto ≤ 1 — so the pipeline always terminates; anything still unresolved is flagged for a human, never looped forever.

---

## Modes

| Mode | Trigger | Agents that run |
|------|---------|-----------------|
| **Full Project** | folder with `package.json` + `next` dep | all of 0–7 (primary mode) |
| **Multi-File** | folder of source files, no `package.json` | analyze, codemod, reconcile, transform, critic (limited), report — no build/test/baseline |
| **Single File** | one `.tsx/.jsx/.ts/.js` file | analyze, transform, report — everything else skipped (noted in report) |

---

## Configuration — `upgrade.config.json`

Place at the project root (the prompt always overrides it):

```json
{
  "sourceVersion": "13.5.0",
  "targetVersion": "15.0.0",
  "sourceProjectPath": "./my-app",
  "outputPath": "./upgraded-output",
  "packageManager": "auto",
  "runTests": true,
  "rollbackOnFailure": false,
  "maxTransformRetries": 2,
  "criticStrictness": "fast",
  "migrateAppRouter": false,
  "generateReport": true
}
```

| Flag | Default | Meaning |
|------|---------|---------|
| `rollbackOnFailure` | `false` | Preserve output + report on failure (deleting it leaves nothing to fix) |
| `maxTransformRetries` | `2` | Tier-1 inner-loop retry cap before flagging a batch |
| `criticStrictness` | `"fast"` | `fast` = high-risk LLM diffs only; `strict` = every LLM diff |
| `migrateAppRouter` | `false` | `true` is **refused** (separate product) |

---

## Output structure

```text
your-workspace/
├── my-app/                        ← ORIGINAL SOURCE (never touched)
└── upgraded-output/
    └── my-app/                    ← isolated upgraded copy
        ├── package.json           ← bumped deps
        ├── next.config.js         ← upgraded
        ├── pages/ | app/          ← upgraded (router unchanged)
        ├── upgrade-report.md      ← human-readable report
        └── .upgrade/              ← machine-readable audit trail
            ├── baseline.json
            ├── upgrade-manifest.json
            ├── codemod-result.json
            ├── residuals.json
            ├── transform-summary.json
            ├── validation-report.json
            ├── critic-report.json
            └── manual-review.json
```

---

## How to run

In VS Code with GitHub Copilot, with `.github/agents/` present in the project you want to upgrade:

```text
Upgrade the project in ./my-app from Next.js 13 to 15 using nextjs-upgrade-orchestrator-agent.agent.md
```

Single file:
```text
Upgrade this file from Next.js 13 to 14: ./my-app/components/Hero.tsx
```

Copilot reads the orchestrator, resolves the sub-agents by filename, and runs the pipeline end to end.

---

## How to test it

These are agent *instruction* files, so testing is behavioral — run the pipeline against sample projects and confirm the invariants hold:

| Test project | Should prove |
|--------------|--------------|
| App with 3 pre-existing failing tests | Upgrade still passes; those 3 are excluded from the gate and surfaced as pre-existing |
| App with no test suite | Report emits `low automated-confidence: no coverage`; no LLM change scores `high` |
| Prompt with `migrateAppRouter: true` | Orchestrator refuses and writes a finding — does not attempt pages→app |
| A single `.tsx` file | Runs analyze→transform→report only; other steps skipped with reasons |
| Deliberately break a file so a test fails | Tier 2 does one feedback attempt, then flags the batch (no infinite loop) |

---

## Why this design (vs. "one big agent per task")

A flat list of a dozen LLM agents *looks* enterprise-grade but tends to drop the things that make an upgrade correct. This system instead:
- pushes work onto **vetted codemods and the compiler/test runner**, using LLMs only where judgment is genuinely required;
- gates on **behavior preservation vs. a baseline**, not on "it compiles";
- keeps every feedback loop **bounded** and every flagged item **isolated and reviewable**;
- treats **App Router migration as a separate product**, so the high-confidence version bump isn't dragged down by a low-confidence re-architecture.

---

*Agents: 8 · LLM agents: 3 (analysis/planning, transformation, critic) · Compatible: Next.js 11.x → 15.x · Non-destructive · Router migration out of scope*
