# Validation Agent

> **Called by:** `nextjs-upgrade-orchestrator-agent.agent.md` (step 5, in three tiers).
> **Fully deterministic — NOT an LLM agent.** It runs the project's own toolchain and returns structured diagnostics. An LLM is slower, costlier, and *less* reliable at detecting what `tsc`, ESLint, the test runner, and `next build` report for free.

---

## THE INVARIANT THIS ENFORCES

A version upgrade must be **behavior-preserving**, not merely well-formed. Compile + type + lint prove the code is *well-formed*; only the project's own **test suite** proves it still *behaves the same*. A diff that compiles but breaks 12 tests fails validation exactly as hard as a syntax error. Therefore the test tier is authoritative — and it gates on **no NEW failures vs. `baseline.json`**, never absolute green (a project with pre-existing failures must still be upgradable).

---

## IMMEDIATE ACTIONS — NO CONFIRMATION NEEDED

- Run against `upgraded-output/{repoName}/` (the relevant batch branch), never the original.
- Run the tiers in cost order; never run an expensive tier inside a loop.
- Diff every result against `baseline.json` — report only *new* failures/diagnostics as blocking.
- Emit `.upgrade/validation-report.json`. Return diagnostics to the orchestrator, which routes feedback/flags.
- This agent NEVER edits code. It only measures.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Role | Deterministic, tiered validation gated against the pre-upgrade baseline |
| Pipeline Position | Step 5 of 7 (Tier 1 in the retry loop; Tier 2 after; Tier 3 at the very end) |
| Mode | Deterministic (shell out to toolchain) |
| Reads | `baseline.json`, `residuals.json`/`transform-summary.json`, batch branches |
| Writes | `.upgrade/validation-report.json` |

---

## THE THREE TIERS

| Tier | Command(s) | When | In a loop? | Gate |
|---|---|---|---|---|
| **1** | `tsc --noEmit` + `eslint` (or `next lint`) | per batch | ✅ retry ≤ `maxTransformRetries` (2) | no NEW diagnostics vs baseline |
| **2** | the project's test suite (`<pm> test`) | once, after Tier 1 passes for the batch | ⚠ one feedback attempt | **no NEW failures vs baseline** |
| **3** | full `next build` | once, at the very end, across the merged tree | ❌ no loop | build succeeds |

> **There is no `next build --dry`.** It is not a real flag. Tier 3 is a real, full build and is the only tier that catches cross-batch integration failures, so it runs exactly once, outside every loop.

### Tier 1 — fast inner loop
Runs every time the Transformer edits a batch. Cheap (seconds). Compare diagnostics to `baseline.preExistingDiagnostics`; pre-existing ones do not block. New ones go back to the Transformer (≤2×); after the cap, **FLAG the batch** and exit the loop.

### Tier 2 — authoritative behavior gate
Runs once after a batch clears Tier 1. Compare the per-test results to `baseline`:
- A test that was **passing in baseline and now fails** = new failure = **blocking**.
- A test in `baseline.preExistingFailures` that still fails = **not blocking** (report it, don't blame the upgrade).
- `baseline.testsExist == false` → no gate possible → emit finding `low automated-confidence: no coverage to verify behavior` and pass the tier (do not fabricate a pass signal).

On new failures: **one** feedback attempt to the Transformer with the failing test names + output (a failing test is far more actionable than a type error). Still failing → FLAG the batch.

### Tier 3 — final integration build
Runs once at the very end, after all batches are merged and the Critic has cleared high-risk diffs. If `next build` fails:
- There is **no loop to recover** here, and a monolithic build error is hard to attribute to one batch.
- **FLAG THE ENTIRE RUN** for human review. Bisect across the merged batch branches if feasible; otherwise list **suspect batches by the files they touched** (intersect build-error file paths with each batch's file set). Honor `rollbackOnFailure` per orchestrator config.

---

## OUTPUT — `validation-report.json`

```json
{
  "validatedAt": "<stamped-by-orchestrator>",
  "tier1": [
    { "batch": "B3", "newDiagnostics": [], "preExistingIgnored": 2, "retriesUsed": 0, "status": "pass" }
  ],
  "tier2": {
    "newFailures": [],
    "preExistingFailuresStillFailing": ["auth.spec.ts > expired token"],
    "testsExist": true,
    "status": "pass"
  },
  "tier3": {
    "command": "next build",
    "status": "fail",
    "errorFiles": ["app/(marketing)/layout.tsx"],
    "suspectBatches": ["B2", "B7"],
    "action": "FLAG_ENTIRE_RUN"
  },
  "flaggedBatches": ["B7"]
}
```

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| Tier 1 new diagnostics | Feedback to Transformer ≤2×, then FLAG batch |
| Tier 2 new failures | One feedback attempt, then FLAG batch |
| Tier 2 — no tests exist | Pass tier, emit low-confidence finding (don't fake a pass) |
| Tier 2 — flaky/nondeterministic test | Re-run once; if it disagrees with itself, mark `flaky` and exclude from the gate, note in report |
| Tier 3 build fails | FLAG entire run; list suspect batches by files touched; honor `rollbackOnFailure` |
| Toolchain missing (`tsc`/lint script absent) | Record which tier could not run; reduce confidence; never substitute LLM judgment |

---

## FORBIDDEN ACTIONS

- ❌ Never edit code — measurement only.
- ❌ Never gate on absolute green — always diff against `baseline.json`.
- ❌ Never run Tier 2 or Tier 3 inside the retry loop.
- ❌ Never use an LLM to detect syntax/type/test errors the toolchain reports deterministically.

---

*Agent Version: 1.0.0 | Deterministic | Pipeline Step: 5 of 7 (Tiers 1–3)*
