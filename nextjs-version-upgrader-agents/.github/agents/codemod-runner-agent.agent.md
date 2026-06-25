# Codemod Runner Agent

> **Called by:** `nextjs-upgrade-orchestrator-agent.agent.md` (step 2).
> **Deterministic — NOT an LLM agent.** It runs official `@next/codemod` transforms and records exactly what they did. It runs FIRST, before any LLM touches code, so the LLM only ever sees what the codemod could not handle.

---

## WHY CODEMODS FIRST

Vercel ships and tests `@next/codemod` against real codebases for every version bump. Re-implementing those transforms with an LLM is strictly worse — slower, more expensive, and less reliable. This agent applies the vetted transforms, then hands the LLM Transformer a small, annotated *residual* instead of the whole codebase. Smaller input → less hallucination surface.

---

## IMMEDIATE ACTIONS — NO CONFIRMATION NEEDED

- Operate ONLY on `upgraded-output/{repoName}/` — never the original tree.
- Select the codemod set for the `sourceVersion`→`targetVersion` delta (chain them in order if crossing multiple majors, e.g. 13→14→15).
- Run each codemod, capture its stdout/stderr and the resulting diff.
- **Tag every change** as `handled` / `partial` / `skipped` and record which files each codemod touched.
- Emit `.upgrade/codemod-result.json` and stop. Do NOT attempt anything the codemod doesn't cover — that is the Transformer's job.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Role | Apply official `@next/codemod` transforms; record handled/partial/skipped per change |
| Pipeline Position | Step 2 of 7 |
| Mode | Deterministic (shell out to `@next/codemod`) |
| Reads | `upgrade-manifest.json`, copied source tree |
| Writes | Transformed files in `upgraded-output/{repoName}/`, `.upgrade/codemod-result.json` |

---

## CODEMOD SELECTION (by version delta)

Run via the detected package manager, e.g. `npx @next/codemod@<target> <transform> <path>`. Representative transforms (resolve the actual list from the installed `@next/codemod` for the exact target):

| Delta | Representative codemods |
|---|---|
| →13 | `next-image-to-legacy-image`, `new-link` (remove redundant `<a>`), `next-og-import` |
| →13/14 | `next-image-experimental` (legacy → modern `next/image`), `built-in-next-font` (`@next/font` → `next/font`) |
| →14 | `next-request-geo-ip` and other 14 transforms as published |
| →15 | `next-async-request-api` (async `headers()`/`cookies()`/`params`), `app-dir-runtime-config-experimental-edge`, metadata/config transforms as published |

Always run the **upgrade helper first** where available (`npx @next/codemod@<target> upgrade`) to bump `next`/`react` and apply the bundled set, then run any remaining targeted transforms. When crossing multiple majors, apply each major's set in ascending order.

---

## TAGGING — handled / partial / skipped

For every manifest change and every file the codemod touched, classify the outcome:

| Tag | Meaning | Goes to residuals? |
|---|---|---|
| `handled` (✓) | Codemod fully transformed it; no follow-up needed | No |
| `partial` (⚠) | Codemod changed the file but left work (e.g. `next/image` import updated but explicit sizing still required, or it inserted a `// @next/codemod` comment) | Yes |
| `skipped` (✗) | Codemod had no transform for this, or declined to touch it | Yes |

Detect `partial`/`skipped` from: codemod stderr/warnings, any TODO/marker comments the codemod inserts, manifest changes with no corresponding diff, and files the codemod reported as unmodified.

---

## OUTPUT — `codemod-result.json`

```json
{
  "ranAt": "<stamped-by-orchestrator>",
  "packageManager": "pnpm",
  "codemodsRun": [
    { "name": "next-image-experimental", "exitCode": 0, "filesTouched": 31, "warnings": 4 }
  ],
  "changes": [
    {
      "manifestId": "C-001",
      "file": "components/Hero.tsx",
      "codemod": "next-image-experimental",
      "tag": "partial",
      "whatItDid": "rewrote import + props; left layout='fill' sizing for manual review",
      "diffRef": ".upgrade/diffs/C-001.patch"
    },
    {
      "manifestId": "C-014",
      "file": "next.config.js",
      "codemod": "upgrade",
      "tag": "handled",
      "whatItDid": "images.domains → images.remotePatterns"
    }
  ],
  "filesTouched": ["components/Hero.tsx", "next.config.js"],
  "summary": { "handled": 38, "partial": 7, "skipped": 2 }
}
```

`whatItDid` is the ground-truth the Reconcile agent uses — record it accurately, never copy the manifest's *prediction*.

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| A codemod exits non-zero | Record exit code + stderr; mark its target changes `skipped` so they flow to residuals; continue the remaining codemods |
| Codemod not found for the target | Record it; let those manifest items become `skipped` residuals |
| Codemod produces a syntax-broken file | Record it; tag `partial`; the validator will catch it and the Transformer will repair from the residual |

---

## FORBIDDEN ACTIONS

- ❌ Never edit files by hand — only via official codemods. Anything codemods can't do is a residual, not your job.
- ❌ Never touch the original source tree.
- ❌ Never mark a change `handled` without a corresponding diff to prove it.

---

*Agent Version: 1.0.0 | Deterministic | Pipeline Step: 2 of 7*
