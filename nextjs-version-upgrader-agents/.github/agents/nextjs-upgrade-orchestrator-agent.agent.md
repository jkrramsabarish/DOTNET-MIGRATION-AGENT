# Next.js Upgrade Orchestrator Agent

> **GIVE THIS FILE TO GITHUB COPILOT.**
> Tell Copilot: *"Upgrade the project in `./my-app` from `sourceVersion` to `targetVersion` using this agent."*
> Copilot will read this file, resolve all sub-agents listed below, and execute the full upgrade pipeline automatically.
> All sub-agent files are co-located in the same folder as this file — reference them by bare filename (e.g. `codebase-analysis-planning-agent.agent.md`), never by a hardcoded folder path, so the pipeline works regardless of where the agents folder lives.

---

## SCOPE — READ THIS FIRST

This pipeline performs **Next.js version upgrades** (e.g. 12→13, 13→14, 14→15) on a project that **stays on its current router**. It is deterministic-first: official `@next/codemod` transforms do the bulk of the work, and an LLM only handles the annotated residual the codemod could not.

**App Router migration is explicitly OUT OF SCOPE.** Converting `pages/` → `app/`, `getServerSideProps`/`getStaticProps` → server components, or `_app`/`_document` → root layout is a genuine re-architecture, not a version bump. Pages Router is fully supported on every target version this agent handles. If the project is on Pages Router, it stays on Pages Router. If `migrateAppRouter` is set `true` in config, **refuse and emit a Reporter finding** explaining it is a separate, human-in-the-loop product — do not attempt it.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Read `sourceVersion` and `targetVersion` from the user prompt or from `upgrade.config.json` at the project root. **Precedence: the inline prompt always wins over `upgrade.config.json`.**
- **Detect the upgrade mode automatically** (see UPGRADE MODE DETECTION) — Single File, Multi-File, or Full Project — before loading any sub-agents.
- **Auto-detect the package manager** from the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `package-lock.json` → npm). Use it consistently for every install/build/test command.
- Load ONLY the sub-agents required for the detected mode (see Agent Registry).
- Never hardcode a Next.js version — always read from config or prompt.
- Never modify any original source file — ALL output goes to `upgraded-output/{repoName}/`.
- **Capture a pre-upgrade baseline BEFORE any change** (see BASELINE — NON-NEGOTIABLE). The validator gates on *no new failures vs. this baseline*, never absolute green.
- Never ask the developer "should I proceed?" mid-pipeline — proceed automatically and report at the end.
- If `upgrade.config.json` is absent, prompt the user ONCE for `sourceVersion` and `targetVersion`, create the file, and continue.
- After the pipeline completes, generate `upgraded-output/{repoName}/upgrade-report.md` automatically.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
ORIGINAL SOURCE FILES ARE NEVER MODIFIED OR DELETED.

Every file produced or modified by this pipeline is written to:
  upgraded-output/{repoName}/

Where {repoName} is derived from the input (see UPGRADE MODE DETECTION).
Each upgrade is fully isolated inside its own subfolder.
The original source tree IS the backup — it is never touched.

Example (full project):
  Source:  my-app/pages/index.tsx                       ← NEVER TOUCHED
  Output:  upgraded-output/my-app/pages/index.tsx       ← upgraded copy written here

If an upgrade fails, ONLY upgraded-output/{repoName}/ is affected.
All other outputs remain untouched.

All agents must follow this rule without exception.
```

---

## BASELINE — NON-NEGOTIABLE

A version upgrade must be **behavior-preserving**, not merely well-formed. "It compiles" is the wrong invariant. Before the Analyzer touches anything, the orchestrator captures a baseline on the **untouched copied tree** inside `upgraded-output/{repoName}/`:

1. Install dependencies (using the detected package manager).
2. Run the test suite → record pass/fail/skip per test.
3. Run `tsc --noEmit` and the linter → record the diagnostic set.
4. Optionally run `next build` once → record success/failure.

Write all of this to `upgraded-output/{repoName}/.upgrade/baseline.json`, including:
- `testsExist: true|false` and the full per-test result set.
- `preExistingFailures` — tests already red on the untouched tree.
- `preExistingDiagnostics` — type/lint errors already present.

**Why:** the Validator's Tier-2 gate is *"no NEW test failures vs. baseline"* — not "all tests pass." A project with 3 already-failing tests must still be able to pass the upgrade. And `testsExist: false` is itself a first-class Reporter finding (`low automated-confidence: no coverage to verify behavior`) — silence about behavior must never read as a pass.

---

## UPGRADE MODE DETECTION

| What the user provides | Mode | {repoName} derived from |
|---|---|---|
| A single `.tsx/.jsx/.ts/.js` file path | **Single File** | filename without extension |
| A folder of source files with NO `package.json` | **Multi-File** | folder name |
| A folder containing `package.json` (+ a Next.js dep) | **Full Project** | root folder name |

### Mode: Single File
Triggered when the input is one source file. No project context → no codemod project run, no install, no build, no tests, no baseline.
- ✅ `codebase-analysis-planning-agent.agent.md` (scan the one file)
- ✅ `code-transformation-agent.agent.md` (rewrite the one file, insert `// TODO [UPGRADE]` for anything not safely auto-fixable)
- ✅ `reporting-agent.agent.md`
- ❌ Skipped: codemod-runner, reconcile, validator, critic — note each skip + reason in the report.

### Mode: Multi-File
Triggered when the input is a folder of source files with no `package.json`.
- ✅ `codebase-analysis-planning-agent.agent.md`
- ✅ `codemod-runner-agent.agent.md` (codemods that operate on loose files)
- ✅ `reconciliation-agent.agent.md`
- ✅ `code-transformation-agent.agent.md`
- ✅ `critic-agent.agent.md` (limited — no build/test signal)
- ✅ `reporting-agent.agent.md`
- ❌ Skipped: validator (no project to build/test), baseline.

### Mode: Full Project
Triggered when the input folder has a `package.json` with a `next` dependency. **All agents run, steps 0–7.** This is the primary mode.

---

## OVERVIEW

| Property | Value |
|---|---|
| Agent Name | Next.js Upgrade Orchestrator Agent |
| Version | 1.0.0 |
| Compatible Source Versions | Next.js 11.x, 12.x, 13.x, 14.x |
| Compatible Target Versions | Next.js 12.x, 13.x, 14.x, 15.x |
| Router | Stays on current router (Pages OR App). App Router *migration* is out of scope. |
| Repo Scale | Single file → large monorepo apps (Analyzer/Planner map-reduces per directory) |
| Mode | Fully automated, deterministic-first, non-destructive |

---

## DYNAMIC VERSION CONFIGURATION

### Option 1 — Inline Prompt (wins over config)
```
Upgrade the project in ./my-app from Next.js 13 to 15 using nextjs-upgrade-orchestrator-agent.agent.md
```

### Option 2 — Config File (`upgrade.config.json` at project root)
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

**Flag defaults & rationale:**

| Flag | Default | Why |
|---|---|---|
| `rollbackOnFailure` | `false` | Preserve the output + report on failure; deleting everything leaves the developer nothing to fix. Opt in to destructive rollback. |
| `maxTransformRetries` | `2` | The Transformer↔Validator Tier-1 inner loop retries at most twice, then the batch is flagged for human review and the loop exits. Prevents ping-pong. |
| `criticStrictness` | `"fast"` | Critic reviews **only high-risk LLM diffs** by default (App-Router-adjacent rewrites, data-fetching changes, `next/image` rewrites). `"strict"` challenges every LLM diff — slower, use for risky upgrades. Deterministic over/under-migration checks run regardless. |
| `migrateAppRouter` | `false` | App Router migration is a separate product. `true` is refused with a Reporter finding (see SCOPE). |

**Version token note:** Next.js versions are plain semver (`13.5.0`, `15.0.0`). Never upgrade past `targetVersion`.

---

## AGENT REGISTRY — SUB-AGENTS CALLED BY THIS FILE

Each agent file is co-located with this orchestrator and referenced by bare filename.

| # | Agent File | Responsibility | LLM? | Single | Multi | Full |
|---|---|---|---|---|---|---|
| 0 | *(orchestrator INIT)* | Copy tree, detect PM, **capture baseline** | — | ❌ | ❌ | ✅ |
| 1 | `codebase-analysis-planning-agent.agent.md` | Inventory + per-file risk scores → ordered JSON manifest | ✅ | ✅ | ✅ | ✅ |
| 2 | `codemod-runner-agent.agent.md` | Run `@next/codemod`; tag each change handled/partial/skipped | ❌ | ❌ | ✅ | ✅ |
| 3 | `reconciliation-agent.agent.md` | Residuals = manifest reconciled against what codemod *actually did* | ❌ | ❌ | ✅ | ✅ |
| 4 | `code-transformation-agent.agent.md` | LLM rewrites **only the residual**, into a per-batch branch | ✅ | ✅ | ✅ | ✅ |
| 5 | `validation-agent.agent.md` | Tiered, deterministic: tsc+lint / tests-vs-baseline / build | ❌ | ❌ | ❌ | ✅ |
| 6 | `critic-agent.agent.md` | Semantic correctness of high-risk LLM diffs only; veto max 1× | ✅ | ❌ | ✅(ltd) | ✅ |
| 7 | `reporting-agent.agent.md` | Objective confidence rubric + structured manual-review artifact | ❌ | ✅ | ✅ | ✅ |

---

## EXECUTION WORKFLOW — Full Project Mode

```
[START]
   │
   ▼
[DETECT] folder has package.json + next dep → Full Project
   → {repoName} = root folder name; detect package manager from lockfile
   │
   ▼
[0 INIT + BASELINE] Create upgraded-output/{repoName}/, copy ALL source unmodified.
   → install deps · run tests · run tsc/lint · (optional) next build
   → Output: .upgrade/baseline.json   (preExistingFailures, preExistingDiagnostics, testsExist)
   │
   ▼
[1] codebase-analysis-planning-agent.agent.md   (LLM + AST, map-reduce per directory)
   → inventory: version, deprecated APIs, config patterns, per-file risk scores
   → Output: .upgrade/upgrade-manifest.json   (ordered, dependency-sequenced)
   │
   ▼
[2] codemod-runner-agent.agent.md   (deterministic — runs FIRST)
   → npx @next/codemod@<targetVersion> ...  against upgraded-output/{repoName}/
   → tags each change: ✓ handled · ⚠ partial · ✗ skipped
   → Output: .upgrade/codemod-result.json
   │
   ▼
[3] reconciliation-agent.agent.md   (deterministic)
   → residuals = manifest items NOT fully handled by codemod, computed against
     what the codemod ACTUALLY did (not what the Planner predicted)
   → Output: .upgrade/residuals.json
   │
   ▼
[4] code-transformation-agent.agent.md   (LLM — sees ONLY residuals)
   → groups residuals into batches; each batch written to an isolated branch/worktree
   → inserts // TODO [UPGRADE] for anything not safely auto-fixable
   │  ┌─────────────────────────────────────────────────────────────┐
   ▼  ▼  RETRY LOOP (per batch, max maxTransformRetries = 2)
[5a] validator Tier 1  →  tsc --noEmit + ESLint   (seconds)
   → red? feed diagnostics back to transformer (≤2×), then FLAG batch + exit loop
   │  └─────────────────────────────────────────────────────────────┘
   ▼  (loop passed)
[5b] validator Tier 2  →  test suite, ONCE, gate = NO NEW failures vs baseline.json
   → new failures? ONE feedback attempt to transformer w/ failing test output, then FLAG
   │
   ▼
[6] critic-agent.agent.md   (LLM — high-risk LLM diffs only; semantic correctness)
   → veto max 1× → re-transform that diff → re-validate; still bad? FLAG (don't loop)
   │
   ▼
[5c] validator Tier 3  →  full next build, ONCE, at the very end, outside every loop
   → fail? FLAG ENTIRE RUN for human review; list suspect batches by what they touched
   │
   ▼
[7] reporting-agent.agent.md
   → objective confidence per file (NOT self-reported)
   → auto-applied changes (labelled codemod vs LLM) + structured manual-review artifact
   → Output: upgraded-output/{repoName}/upgrade-report.md
   │
   ▼
[END]
```

> **Single File / Multi-File** run the reduced agent sets in the registry table above; the orchestrator notes every skipped step and its reason in the report.

---

## VALIDATION TIERS (authoritative reference — enforced by `validation-agent.agent.md`)

| Tier | What runs | When | In a loop? | Gate |
|---|---|---|---|---|
| 1 | `tsc --noEmit` + ESLint | per batch | ✅ retry ≤2× | no new diagnostics vs baseline |
| 2 | existing test suite | once, after Tier 1 passes | ⚠ one feedback attempt | **no new failures vs baseline** |
| 3 | full `next build` | once, at the very end | ❌ no loop | build succeeds |

There is **no `next build --dry`** — it is not a real flag. Tier 3 is the only check that catches cross-batch integration failures; because it runs outside every loop, a Tier-3 failure flags the whole run and the Reporter lists suspect batches by the files they touched.

---

## CONFIDENCE — OBJECTIVE, NEVER SELF-REPORTED

The Reporter computes a per-file confidence from facts the pipeline already has — the Transformer never rates its own work:
- **Source:** codemod-applied → high by construction; LLM-applied → scored below.
- Passed Tier 1? Passed Tier 2 (tests)? Critic approved without veto? Diff size/complexity. Touched a high-risk file from the manifest?

See `reporting-agent.agent.md` for the exact rubric.

---

## DIRECTORY STRUCTURE AFTER PIPELINE COMPLETES

```
your-workspace/
├── my-app/                         ← ORIGINAL SOURCE (never touched)
│
└── upgraded-output/
    └── my-app/                     ← isolated output for this repo
        ├── package.json            ← bumped deps
        ├── next.config.js          ← upgraded
        ├── pages/ | app/           ← upgraded (router unchanged)
        ├── upgrade-report.md
        └── .upgrade/
            ├── baseline.json
            ├── upgrade-manifest.json
            ├── codemod-result.json
            ├── residuals.json
            ├── transform-summary.json
            ├── validation-report.json
            └── critic-report.json
```

---

## SAFETY RULES

- ✅ Original source files are NEVER modified — all output goes to `upgraded-output/{repoName}/`.
- ✅ A baseline is captured before any change; the test gate is *no new failures vs. baseline*, never absolute green.
- ✅ Each LLM batch is written to an isolated branch/worktree so a flagged batch is one reviewable diff.
- ✅ Tier 3 (`next build`) runs exactly once, at the end, outside every loop.
- ❌ Never attempt App Router migration — refuse `migrateAppRouter: true` with a Reporter finding.
- ❌ Never let the LLM rate its own confidence — confidence is a rubric over objective signals.
- ❌ Never upgrade past `targetVersion`.
- ❌ Never run build/test/baseline in Single File or Multi-File mode (no project to build).

---

## FAILURE HANDLING

| Failure Scenario | Action |
|---|---|
| Tier-1 red after `maxTransformRetries` | FLAG the batch (isolated branch), exit loop, continue other batches |
| Tier-2 new failures vs baseline | ONE feedback attempt with failing test output → still failing? FLAG batch |
| Critic veto | re-transform once → re-validate → still bad? FLAG (never loop) |
| Tier-3 (`next build`) fails at end | FLAG entire run; Reporter lists suspect batches by files touched; honor `rollbackOnFailure` |
| No test suite in project | Not a failure — Reporter finding: `low automated-confidence: no coverage` |
| Pre-existing failures in baseline | Excluded from the gate; surfaced in the report so they aren't blamed on the upgrade |
| `migrateAppRouter: true` requested | Refuse; Reporter finding explaining it is a separate product |
| A codemod has no equivalent for a deprecated API | Falls through to residuals → Transformer → `// TODO [UPGRADE]` if not safely fixable |

---

## EXAMPLE USAGE

```
Upgrade the project in ./my-app from Next.js 13 to 15 using nextjs-upgrade-orchestrator-agent.agent.md
```
→ Full pipeline (steps 0–7). Output: `upgraded-output/my-app/`

```
Upgrade this file from Next.js 13 to 14: ./my-app/components/Hero.tsx
```
→ Single File mode: analyzer-planner → transformer → reporter only.

```
Upgrade all components in ./shared-ui from Next.js 13 to 14
```
→ Multi-File mode: no build/test, limited critic.

---

*Agent Version: 1.0.0 | Compatible: Next.js 11.x → 15.x | Non-destructive: all output to upgraded-output/{repoName}/ | Router migration OUT OF SCOPE | Modes: Single File, Multi-File, Full Project*
