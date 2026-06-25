# Rollback Agent

> **Called by:** `dotnet-migration-orchestrator-agent.agent.md` (Migration Orchestrator) and `build-compilation-agent.agent.md`
> **Do not invoke this file directly during normal pipeline flow.**
> This agent runs **only when `rollbackOnFailure: true`** is explicitly set and the build is still red after the build→fix loop. On the default (`rollbackOnFailure: false`) the output is preserved and this agent is never called. It can also be invoked manually by the developer.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Read `{repoName}` from the orchestrator context — this is the root folder name of the source repo being migrated.
- Delete ONLY `migrated-output/{repoName}/` — never touch any other subfolder inside `migrated-output/`.
- Confirm deletion succeeded, then halt the pipeline.
- Report exactly what was deleted to the developer.
- Never prompt for confirmation — delete automatically on invocation.

---

## GOLDEN RULE — REPO-SCOPED DELETION ONLY

```
DELETE:        migrated-output/{repoName}/     ← the failing repo's output only
NEVER TOUCH:   migrated-output/AnyOtherRepo/   ← other repos are completely safe
NEVER TOUCH:   original source files           ← source was never modified anyway

The original source project is untouched by design — rollback only needs to
clean up the failed migrated-output/{repoName}/ folder.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Rollback Agent |
| Role | Delete the failing repo's output folder — scope limited to `migrated-output/{repoName}/` |
| Pipeline Position | Invoked on demand (after step 5 build→fix loop fails AND `rollbackOnFailure: true`) |
| Mode | Delete — removes `migrated-output/{repoName}/` only |
| Invoked By | Build & Compilation Agent (only when `rollbackOnFailure: true`), or developer (manual) |
| Reads | `{repoName}` from orchestrator context |
| Deletes | `migrated-output/{repoName}/` |
| Never Touches | Any other folder in `migrated-output/`, any source file |

---

## WHY ROLLBACK IS SIMPLE

The pipeline's golden rule means **original source files are never modified**. Therefore:

- There is nothing to "restore" — the source is already intact
- The only thing that needs cleaning up is `migrated-output/{repoName}/`
- Deleting that folder returns the workspace to its exact pre-migration state for that repo
- Other repos in `migrated-output/` are completely unaffected

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `{repoName}` | Orchestrator context (root folder name of source repo) | ✅ |
| Trigger reason | Calling agent | ✅ |

---

## OUTPUTS

| Output | Description |
|---|---|
| Deleted folder | `migrated-output/{repoName}/` removed from filesystem |
| Console report | Confirmation of what was deleted and what was preserved |

---

## EXECUTION STEPS

### Step 1 — Confirm repoName
- Read `{repoName}` from orchestrator context.
- Construct the target path: `migrated-output/{repoName}/`.
- Safety check: verify the path starts with `migrated-output/` and is exactly one level deep — never delete a path that resolves outside this pattern.

### Step 2 — Confirm Folder Exists
- Check `migrated-output/{repoName}/` exists.
- If it does not exist → report "Nothing to roll back — output folder not found." and halt cleanly.

### Step 3 — Delete the Repo Output Folder
```bash
rm -rf migrated-output/{repoName}/
```
- Delete recursively.
- This removes all upgraded source files, `.migration/` JSON files, and `migration-report.md` for this repo only.

### Step 4 — Verify Deletion
- Confirm `migrated-output/{repoName}/` no longer exists.
- Confirm all other subfolders in `migrated-output/` are still present and untouched.

### Step 5 — Report to Developer
```
🔄 Rollback Complete
   Deleted:              migrated-output/{repoName}/
   Other repos in migrated-output/:  untouched ✅
   Original source ({repoName}/):    untouched ✅ (was never modified)

   ⚠️  Migration for {repoName} did not complete.
   Review the build errors in the console above, fix the issues, and re-run the migration.
```

### Step 6 — Halt Pipeline
- Signal the orchestrator to stop all further agent execution for this repo.
- Do not invoke any subsequent agents (test, critic, reporting).

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| Filesystem delete | `rm -rf migrated-output/{repoName}/` |
| Filesystem check | Verify deletion succeeded and other folders untouched |

---

## MANUAL INVOCATION

A developer can invoke rollback manually at any time:

### Via Copilot Prompt
```
Roll back the migration for eShopOnWeb
```
```
Undo the migration output for MyRepo
```

### Via Command Line (alternative)
```bash
rm -rf migrated-output/{repoName}/
```

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Build & Compilation Agent | Primary invoker — triggered automatically on build failure |
| Migration Orchestrator | Receives halt signal after rollback completes |
| Reporting Agent | NOT invoked after rollback — but rollback only runs on the explicit `rollbackOnFailure: true` path. On the **default** `rollbackOnFailure: false` path this agent is never called: the output is preserved and `reporting-agent.agent.md` runs to report the remaining errors/TODOs |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| `{repoName}` not provided in context | Halt, report: "Cannot roll back — repo name not set in orchestrator context." |
| `migrated-output/{repoName}/` does not exist | Report "Nothing to roll back." and halt cleanly |
| Delete fails (permissions) | Report exact error, instruct developer to manually run `rm -rf migrated-output/{repoName}/` |

---

## FORBIDDEN ACTIONS

- ❌ Never delete `migrated-output/` (the root folder)
- ❌ Never delete any subfolder other than `migrated-output/{repoName}/`
- ❌ Never touch original source files — they were never modified
- ❌ Never invoke rollback before build failure is confirmed
- ❌ Never proceed with the pipeline after rollback — always halt

---

*Agent Version: 3.1.0 | Repo-scoped deletion only | Invoked only when rollbackOnFailure:true, or by developer command*