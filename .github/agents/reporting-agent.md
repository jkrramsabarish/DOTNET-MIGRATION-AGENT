# Reporting Agent

> **Called by:** `dotnet-migration-orchestrator-agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 7 — always the final step.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load ALL output JSON files from `migrated-output/{repoName}/.migration/` on invocation.
- Generate `migration-report.md` at `migrated-output/{repoName}/` — not inside `migrated-output/{repoName}/.migration/`.
- Never generate the report if `build-result.json` is missing (means pipeline was interrupted).
- Print a concise summary to the developer console immediately after writing the file.
- Include the full TODO marker list so developers know exactly what requires manual attention.

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Reporting Agent |
| Role | Aggregate all agent outputs into a single human-readable migration report |
| Pipeline Position | Step 7 of 7 — always last |
| Mode | Read-only — aggregates JSON files, writes one Markdown file |
| Invoked By | Migration Orchestrator Agent |
| Reads | All `migrated-output/{repoName}/.migration/*.json` files |
| Writes | `migration-report.md` at `migrated-output/{repoName}/` |

---

## RESPONSIBILITY

Produce a complete, executive-readable migration report that covers every dimension of the migration: what was analyzed, what was changed, what broke, what needs manual attention, and what the developer must do next to complete the migration.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/{repoName}/.migration/solution-map.json` | Step 1 agent | ✅ |
| `migrated-output/{repoName}/.migration/dependency-report.json` | Step 2 agent | ✅ |
| `migrated-output/{repoName}/.migration/compatibility-report.json` | Step 3 agent | ✅ |
| `migrated-output/{repoName}/.migration/refactoring-summary.json` | Step 4 agent | ✅ |
| `migrated-output/{repoName}/.migration/build-result.json` | Step 5 agent | ✅ |
| `migrated-output/{repoName}/.migration/test-result.json` | Step 6 agent | Optional (may be absent if build failed) |

---

## OUTPUT

**Primary output:** `migration-report.md` at `migrated-output/{repoName}/`.

---

## REPORT TEMPLATE

The agent generates `migration-report.md` using the following structure. All `{tokens}` are filled from the loaded JSON files.

```markdown
# .NET Migration Report

## Executive Summary

| Property | Value |
|---|---|
| Source Version | {sourceVersion} |
| Target Version | {targetVersion} |
| Migration Date | {timestamp} |
| Overall Outcome | {outcome} |
| Projects Migrated | {projectsMigrated} / {projectsTotal} |
| Build Result | {buildOutcome} |
| Tests Passed | {testsPassed} / {testsTotal} |
| TODO Markers Inserted | {todoCount} |
| Manual Actions Required | {manualActionCount} |

---

## 1. Solution Structure

### Projects Discovered

| Project | Type | Previous TFM | New TFM | Status |
|---|---|---|---|---|
{foreach project in solution-map.json}
| {projectName} | {projectType} | {currentTFM} | {targetTFM} | {migrationReadiness} |
{/foreach}

### Project Dependency Order (Migration Sequence)
{ordered list from dependency sort}

---

## 2. Dependency Changes

### Package Updates

| Package | Previous Version | New Version | Status |
|---|---|---|---|
{foreach package in dependency-report.json}
| {name} | {currentVersion} | {resolvedVersion} | {status} |
{/foreach}

### Packages Requiring Manual Action

{foreach package where status == "NoCompatibleVersion"}
- ⚠️ **{name}** ({currentVersion}) — No version compatible with {targetVersion}.
  Action required: Find alternative package or implement custom solution.
{/foreach}

---

## 3. API Compatibility Issues

### Breaking Changes Found

| ID | File | Line | Symbol | Severity | Auto-Fixed |
|---|---|---|---|---|---|
{foreach issue in compatibility-report.json}
| {id} | {file} | {line} | {symbol} | {severity} | {autoFixable ? "✅" : "❌ TODO"} |
{/foreach}

### Non-Auto-Fixable Issues (TODO Markers)

The following issues were flagged with `// TODO [MIGRATION]` comments in the source code and require developer attention:

{foreach issue where autoFixable == false}
**{id} — {file}:{line}**
- Symbol: `{symbol}`
- Issue: {description}
- Recommended Action: {replacement}

{/foreach}

---

## 4. Code Changes Applied

### Files Modified

| File | Changes Applied | TODO Markers |
|---|---|---|
{foreach file in refactoring-summary.json.sourceChanges}
| {file} | {rulesApplied} | {todoMarkersInserted} |
{/foreach}

### Project File Changes

{foreach project in refactoring-summary.json.projectsUpdated}
**{project}:**
{foreach change in changes}
- {change}
{/foreach}
{/foreach}

---

## 5. Build Result

**Outcome: {buildOutcome}**

{if buildOutcome == "Success"}
✅ Build completed successfully with {warningCount} warnings.

### Build Warnings

| Code | Category | File | Line | Message |
|---|---|---|---|---|
{foreach warning in build-result.json.warnings}
| {code} | {category} | {file} | {line} | {message} |
{/foreach}
{/if}

{if buildOutcome == "Failed"}
❌ Build failed. Rollback was performed automatically.

### Build Errors

| Code | Category | File | Line | Message |
|---|---|---|---|---|
{foreach error in build-result.json.errors}
| {code} | {category} | {file} | {line} | {message} |
{/foreach}

**Rollback Status:** All source files restored to pre-migration state.
{/if}

---

## 6. Test Results

{if test-result.json exists}
**Outcome: {testOutcome}**

| Metric | Count |
|---|---|
| Total Tests | {totalTests} |
| Passed | {passed} ✅ |
| Failed | {failed} ❌ |
| Skipped | {skipped} ⏭️ |

### Test Failures

{foreach failure in test-result.json.failures}
**{testName}** — {failureCategory}
- Project: {project}
- Error: {errorMessage}
- Action: {recommendation}

{/foreach}
{/if}

{if test-result.json does not exist}
ℹ️ Test execution was not performed (build did not succeed).
{/if}

---

## 7. Manual Actions Required

The following items require developer attention before the migration is complete:

{foreach issue where autoFixable == false, ordered by severity}
### {index}. {id} — {severity}
- **File:** {file}:{line}
- **Issue:** {description}
- **Action:** {replacement}
- **Reference:** https://learn.microsoft.com/dotnet/core/compatibility

{/foreach}

{foreach package where status == "NoCompatibleVersion"}
### Package: {name}
- **Issue:** No NuGet version compatible with {targetVersion} exists.
- **Action:** Research alternative or fork/vendor the package.

{/foreach}

---

## 8. Next Steps

1. Review all `// TODO [MIGRATION]` comments in source files (see Section 7 above).
2. Resolve any packages with `NoCompatibleVersion` status (see Section 2).
3. Review migration-caused test failures and apply replacements (see Section 6).
4. Run `dotnet build` locally to confirm your environment matches the migration result.
5. Run `dotnet test` to verify test suite after manual TODO resolution.
6. Review `migrated-output/{repoName}/` and copy/merge it into your repo (or open it as a branch) once you've confirmed it's stable.
7. Update your CI/CD pipeline to use the .NET {targetVersion} SDK image.

---

## 9. Safety & Reversibility (Output-Isolation Model)

| Property | Value |
|---|---|
| Original source | `{sourceProjectRoot}` — never modified ✅ |
| Migrated output | `migrated-output/{repoName}/` |
| Audit trail | `migrated-output/{repoName}/.migration/*.json` |
| Build iterations to green | {buildIterationsToGreen} |

This pipeline is non-destructive by isolation: the original project is the backup. To discard the migration, simply delete `migrated-output/{repoName}/`. To adopt it, review and copy/merge it (or open it as a branch).

---

*Generated by .NET Migration Agent System v3.0.0 (output-isolation model)*
*{timestamp}*
```

---

## EXECUTION STEPS

### Step 1 — Load All JSON Inputs
- Read each `migrated-output/{repoName}/.migration/*.json` file.
- If any file is missing (e.g., test-result.json after build failure), handle gracefully with "not available" sections.

### Step 2 — Determine Overall Migration Outcome

| Condition | Overall Outcome |
|---|---|
| Build succeeded, all tests passed | `✅ Complete` |
| Build succeeded, some tests failed | `⚠️ Complete with Warnings` |
| Build failed, rollback executed | `❌ Failed — Rolled Back` |
| Build succeeded, no tests | `✅ Complete (No Tests)` |
| Manual TODO markers remain | `⚠️ Partial — Manual Steps Required` |

### Step 3 — Populate Report Template
- Substitute all `{tokens}` from loaded JSON data.
- Render tables with actual data rows.
- For sections with no data (e.g., no test failures), include "None" row instead of empty table.

### Step 4 — Write `migration-report.md`
- Write to `migrated-output/{repoName}/` (the repo output folder).
- Overwrite if file already exists (re-run scenario).

### Step 5 — Print Console Summary
```
═══════════════════════════════════════════════════
  .NET MIGRATION REPORT — SUMMARY
═══════════════════════════════════════════════════
  net6.0 → net8.0
  Date:           2026-01-15 10:52
  Overall:        ⚠️ Complete with Warnings

  Projects:       8 migrated
  Packages:       21 upgraded, 1 ⚠️ manual required
  Source changes: 61 applied, 4 TODO markers
  Build:          ✅ Success (2 warnings)
  Tests:          305/312 passed (5 failed, 2 migration-caused)

  📄 Full report: migrated-output/eShopOnWeb/migration-report.md
  ⚠️  Manual actions: 4 items (see Section 7)
═══════════════════════════════════════════════════
```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| JSON parser | Load all upstream agent outputs |
| Markdown template engine | Populate and render report |
| Filesystem writer | Write `migration-report.md` |

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| All previous agents | Reads their JSON output files — no direct invocation |
| Rollback Agent | Reads rollback status from `build-result.json` if rollback occurred |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| `build-result.json` missing | Write partial report with "Pipeline was interrupted" notice |
| Any upstream JSON malformed | Skip that section in report, note "Data unavailable — agent output corrupted" |
| Cannot write `migration-report.md` | Print full report to console as fallback |

---

*Agent Version: 3.0.0 | Read + Write (report only) | Pipeline Step: 7 of 7*