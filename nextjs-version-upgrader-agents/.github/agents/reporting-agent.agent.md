# Reporting Agent

> **Called by:** `nextjs-upgrade-orchestrator-agent.agent.md` (step 7, final).
> **Deterministic — NOT an LLM agent.** It aggregates the pipeline's JSON artifacts into a human-readable report and computes the objective confidence rubric. It does not judge correctness (the Critic did) and it does not rate anything subjectively.

---

## THE TWO OUTPUTS THAT MATTER

1. **Auto-applied changes** — every change that shipped, **labelled by source** (codemod vs LLM) with a **per-file objective confidence**.
2. **The manual-review artifact** — structured (not prose): for each flagged item, *file path · what was attempted · why it was flagged · what the human must decide*. On a real upgrade this is the highest-value output; it is a first-class artifact, never a paragraph buried at the end.

---

## IMMEDIATE ACTIONS — NO CONFIRMATION NEEDED

- Load every available `.upgrade/*.json` (`baseline`, `upgrade-manifest`, `codemod-result`, `residuals`, `transform-summary`, `validation-report`, `critic-report`).
- Compute confidence **from objective signals only** (rubric below) — never accept a self-reported number.
- Emit `upgraded-output/{repoName}/upgrade-report.md` and a machine-readable `manual-review.json`.
- Note every skipped step (by mode) and its reason. Surface `testsExist: false` prominently.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Role | Aggregate artifacts → report + objective confidence + structured manual-review artifact |
| Pipeline Position | Step 7 of 7 |
| Mode | Deterministic (read JSON, compute rubric, render markdown) |
| Reads | All `.upgrade/*.json` |
| Writes | `upgrade-report.md`, `.upgrade/manual-review.json` |

---

## OBJECTIVE CONFIDENCE RUBRIC

Confidence is a function of facts the pipeline already produced — the model never picks its own number, because LLMs are miscalibrated about their own correctness.

- **Codemod-sourced change** → `confidence = high` by construction (vetted transform).
- **LLM-sourced change** → start at a base and adjust by objective signals:

| Signal (from the JSON artifacts) | Effect |
|---|---|
| Passed Tier 1 (`tsc`+lint, no new diagnostics) | required floor; if not passed it's flagged, not shipped |
| Passed Tier 2 (no new test failures vs baseline) | +large |
| Covered by tests at all (`testsExist` + file in a test path) | +medium; if no coverage, cap below `high` |
| Critic reviewed and approved without veto | +medium |
| Critic approved only after a veto round-trip | +small |
| Diff small / single-concern | +small |
| Touched a `riskBand: high` file from the manifest | −medium |
| Contains a `// TODO [UPGRADE]` / `manualReview` | not shippable → goes to manual-review artifact |

Map the result to bands: **high / medium / low**. An LLM change on an untested file can never be `high` — no behavior signal exists to earn it.

---

## REPORT STRUCTURE — `upgrade-report.md`

```markdown
# Next.js Upgrade Report — {repoName}
{sourceVersion} → {targetVersion} · router: {routerInUse} (unchanged) · {date}

## 1. Summary
- Files scanned / affected / changed
- Changes by source: {codemod N} · {LLM M}
- Confidence: high X · medium Y · low Z
- Flagged for manual review: K
- Overall outcome: Ready / Conditionally ready / Needs manual review

## 2. Behavior verification (the load-bearing section)
- Baseline: {testsExist?} — {total} tests, {preExistingFailures} pre-existing failures
- Tier 2 result: {new failures vs baseline} ← the upgrade's behavior gate
- Tier 3 (next build): {pass/fail}; if fail → suspect batches
- ⚠ If no tests: "low automated-confidence — no coverage to verify behavior"

## 3. Auto-applied changes (labelled by source + confidence)
| File | Source | Type | Confidence | Tests cover? |
|------|--------|------|-----------|--------------|
| next.config.js | codemod | config | high | n/a |
| components/Hero.tsx | LLM | next-image | medium | yes |

## 4. ⚑ Manual review required (structured — see manual-review.json)
For each: file · what was attempted · why flagged · what you must decide

## 5. Dependency bumps
## 6. Critic findings (vetoes + resolutions)
## 7. Skipped steps (by mode) + reasons
## 8. Pre-existing issues (NOT caused by this upgrade)
## 9. App Router note (if applicable: deferred — separate product)
```

---

## MANUAL-REVIEW ARTIFACT — `manual-review.json`

```json
{
  "items": [
    {
      "file": "app/dashboard/page.tsx",
      "branch": "upgrade/batch-B7",
      "attempted": "await cookies() and propagate async through guards",
      "flaggedBy": "validator-tier2",
      "reason": "new test failure: dashboard.spec.ts > redirects when no session",
      "humanDecision": "confirm the async guard preserves the redirect-on-missing-session path",
      "confidence": "low"
    }
  ],
  "flaggedBatches": ["B7"],
  "runLevelFlag": null
}
```

If Tier 3 flagged the whole run, set `runLevelFlag` with the failing build output and the suspect-batch list from `validation-report.json`.

---

## FAILURE HANDLING

| Situation | Action |
|---|---|
| A `.upgrade/*.json` is missing (step ran) | Note the gap, reduce confidence for affected sections, continue |
| A step was skipped by mode | Record it in §7 as skipped-by-design, not a failure |
| No tests existed | §2 prominently states low automated-confidence; cap all LLM confidence below `high` |
| Tier-3 run-level flag present | Lead §1 outcome with "Needs manual review"; surface suspect batches in §4 |
| `migrateAppRouter:true` was requested | §9 explains it was refused and why (separate product) |

---

## FORBIDDEN ACTIONS

- ❌ Never accept a self-reported confidence — compute it from the rubric.
- ❌ Never bury the manual-review list in prose — it is a structured artifact.
- ❌ Never report "all tests pass" when the gate was "no new failures vs baseline" — state it accurately.
- ❌ Never modify source files.

---

*Agent Version: 1.0.0 | Deterministic | Pipeline Step: 7 of 7*
