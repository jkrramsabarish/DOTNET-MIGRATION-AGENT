# Reconciliation Agent

> **Called by:** `nextjs-upgrade-orchestrator-agent.agent.md` (step 3).
> **Deterministic — NOT an LLM agent.** It sits between the codemod runner and the LLM Transformer and computes the residual the Transformer will work on.

---

## WHY THIS EXISTS

The manifest (step 1) was computed against the *original* code and contains the Planner's *predictions* about what the codemod would handle. The codemod (step 2) recorded what it *actually did*. Those can disagree — a codemod may handle a change the Planner thought needed an LLM, or skip one the Planner assumed it would handle.

If the Transformer worked from the manifest's predictions, the LLM and reality would diverge: it might "fix" something already fixed (over-migration) or skip something the codemod left (under-migration). Reconcile makes the LLM and the tree agree about the current state **before** any LLM call.

---

## IMMEDIATE ACTIONS — NO CONFIRMATION NEEDED

- Read `upgrade-manifest.json` and `codemod-result.json`.
- Compute residuals against **what the codemod actually did**, never against the manifest's `codemodExpected` prediction.
- Run the deterministic **under-migration** and **over-migration** checks below (these are scripts, not LLM judgment — they run before the Critic ever gets involved).
- Emit `.upgrade/residuals.json` and stop.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Role | Reconcile manifest vs. codemod reality → ordered residual list for the Transformer |
| Pipeline Position | Step 3 of 7 |
| Mode | Deterministic (AST diff + set logic) |
| Reads | `upgrade-manifest.json`, `codemod-result.json`, transformed tree |
| Writes | `.upgrade/residuals.json` |

---

## RECONCILIATION LOGIC

For each manifest change `C`:

```
codemod tag for C:
  handled  → DROP from residuals (verify a diff exists; if none, demote to skipped)
  partial  → ADD to residuals with the codemod's leftover annotation
  skipped  → ADD to residuals (full transform needed)
  (no tag) → the codemod never saw it → ADD to residuals
```

Then carry the manifest's `riskScore`, `riskBand`, `dependsOn`, and `type` onto each residual so the Transformer can batch and the Critic can prioritize.

---

## DETERMINISTIC CHECKS (run here, NOT by the LLM Critic)

These are scriptable and must not consume an LLM call:

- **Under-migration sweep:** grep/AST-scan the transformed tree for the known deprecated-API set for this version delta. Anything still present that the codemod claimed `handled` is a contradiction → flag `reconcileConflict` and add to residuals.
- **Over-migration sweep:** diff the codemod's touched-files set against the manifest. Any file changed by the codemod that the manifest never listed as affected → flag `unexpectedChange` for the Reporter (the human should know the codemod touched something unplanned).

Recording these here is what lets the Critic stay narrowly scoped to *semantic correctness of LLM rewrites* — the cheap, deterministic correctness checks are already done.

---

## OUTPUT — `residuals.json`

```json
{
  "reconciledAt": "<stamped-by-orchestrator>",
  "residuals": [
    {
      "manifestId": "C-001",
      "file": "components/Hero.tsx",
      "type": "next-image",
      "riskScore": 65,
      "riskBand": "high",
      "reason": "codemod=partial: import rewritten, manual sizing for layout='fill' remains",
      "dependsOn": [],
      "batchHint": "components"
    }
  ],
  "conflicts": [
    { "manifestId": "C-022", "file": "lib/api.ts", "issue": "tagged handled but deprecated symbol still present" }
  ],
  "unexpectedChanges": [
    { "file": "utils/format.ts", "codemod": "upgrade", "note": "touched but not in manifest" }
  ],
  "batches": [
    { "id": "B1", "files": ["next.config.js"], "order": 1 },
    { "id": "B2", "files": ["lib/api.ts"], "order": 2 },
    { "id": "B3", "files": ["components/Hero.tsx"], "order": 3 }
  ]
}
```

Batches respect the manifest's dependency ordering (config → shared modules → leaf components) so the Transformer never edits a consumer before its dependency.

---

## FORBIDDEN ACTIONS

- ❌ Never use the manifest's `codemodExpected` prediction as truth — only `codemod-result.json`'s `whatItDid`.
- ❌ Never call an LLM — every check here is deterministic.
- ❌ Never modify source files.

---

*Agent Version: 1.0.0 | Deterministic | Pipeline Step: 3 of 7*
