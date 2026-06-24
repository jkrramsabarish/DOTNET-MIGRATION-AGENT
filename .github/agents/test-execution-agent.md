# Test Execution & Regression Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 6.
> **Pre-condition:** Only invoked if `migrated-output/.migration/build-result.json` contains `"outcome": "Success"`.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Verify `migrated-output/.migration/build-result.json` shows `"outcome": "Success"` before running anything — abort if not.
- Run `dotnet test` against all test projects discovered in `migrated-output/` automatically.
- Capture full test output in TRX format for structured parsing.
- Classify every test result: `Passed`, `Failed`, `Skipped`, `Incompatible`.
- Do NOT invoke rollback on test failures — tests failing after migration is expected behavior that requires developer review.
- Write `test-result.json` to `migrated-output/.migration/` and report to developer.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
RUN TESTS from:  migrated-output/ (the upgraded project)
WRITE to:        migrated-output/.migration/test-result.json
                 migrated-output/.migration/test-results/*.trx

Never run tests against the original source project.
Never write any file to the original source project.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Test Execution & Regression Agent |
| Role | Execute test suite from `migrated-output/`, classify results, distinguish migration-caused failures from pre-existing ones |
| Pipeline Position | Step 6 of 7 |
| Mode | Execute — runs `dotnet test` from `migrated-output/`, no source modifications |
| Invoked By | Migration Orchestrator Agent |
| Pre-condition | `migrated-output/.migration/build-result.json` must have `"outcome": "Success"` |
| Reads | `migrated-output/.migration/solution-map.json`, `migrated-output/.migration/build-result.json` |
| Writes | `migrated-output/.migration/test-result.json`, `migrated-output/.migration/test-results/*.trx` |

---

## RESPONSIBILITY

Execute the full test suite against the migrated codebase in `migrated-output/`. Classify test failures as either migration-caused (regressions introduced by the upgrade) or pre-existing (failures that existed before migration). Provide actionable guidance for each failure category. Do not block the pipeline on test failures — surface them clearly and let the developer decide.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/.migration/solution-map.json` | Step 1 agent | ✅ |
| `migrated-output/.migration/build-result.json` | Step 5 agent | ✅ (must show Success) |
| `targetVersion` | Orchestrator context | ✅ |
| Test project list | Extracted from `solution-map.json` (`projectType: "TestProject"`) | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/.migration/test-result.json`

```json
{
  "testTimestamp": "2026-01-15T10:47:00Z",
  "targetVersion": "net8.0",
  "testedFrom": "migrated-output/",
  "totalTests": 312,
  "passed": 305,
  "failed": 5,
  "skipped": 2,
  "outcome": "PartialPass",
  "testProjects": [
    {
      "project": "migrated-output/tests/Web.Tests/Web.Tests.csproj",
      "totalTests": 180,
      "passed": 175,
      "failed": 5,
      "skipped": 0,
      "duration": "00:00:42"
    }
  ],
  "failures": [
    {
      "testName": "EmailService_SendAsync_ThrowsOnNullAddress",
      "project": "migrated-output/tests/Web.Tests",
      "failureCategory": "MigrationCaused",
      "errorMessage": "BinaryFormatter is not supported on this platform",
      "relatedRuleId": "N78001",
      "recommendation": "Update test to use System.Text.Json serialization. See TODO marker in migrated-output/src/Infrastructure/Services/EmailService.cs"
    },
    {
      "testName": "UserRepository_GetAll_ReturnsOrdered",
      "project": "migrated-output/tests/Web.Tests",
      "failureCategory": "PreExisting",
      "errorMessage": "Expected 10 items but found 9",
      "relatedRuleId": null,
      "recommendation": "Failure not related to migration. Review test data setup."
    }
  ]
}
```

---

## EXECUTION STEPS

### Step 1 — Confirm Build Success Pre-condition
- Read `migrated-output/.migration/build-result.json`.
- If `outcome != "Success"` → halt immediately, report: "Test execution skipped — build from migrated-output/ must pass first."

### Step 2 — Discover Test Projects
From `solution-map.json`, collect all projects where `projectType == "TestProject"`.
Use the `outputProjectFile` paths (inside `migrated-output/`) for all test commands.

Supported test frameworks (auto-detected from `PackageReference`):

| Framework | Package | Runner |
|---|---|---|
| xUnit | `xunit` | `dotnet test` |
| NUnit | `NUnit` | `dotnet test` |
| MSTest | `MSTest.TestFramework` | `dotnet test` |

### Step 3 — Run Tests with Structured Output
For each test project inside `migrated-output/`, run:
```bash
dotnet test migrated-output/tests/Web.Tests/Web.Tests.csproj \
  --configuration Release \
  --no-build \
  --logger "trx;LogFileName=test-results.trx" \
  --results-directory migrated-output/.migration/test-results/ \
  --verbosity normal
```

Key flags:
- `--no-build`: Skip rebuild — use already-built binaries from step 5.
- `--logger trx`: Produces structured XML output for reliable parsing.
- `--results-directory`: All TRX files go to `migrated-output/.migration/test-results/`.

### Step 4 — Parse TRX Results
Parse each `.trx` XML file from `migrated-output/.migration/test-results/`:
- Extract `<UnitTestResult outcome="...">` nodes.
- Map outcomes: `Passed` / `Failed` / `NotExecuted` (Skipped) / `Error`.
- For each failure, extract: `testName`, `errorMessage`, `stackTrace`.

### Step 5 — Classify Test Failures

For every failed test, determine the failure category:

#### Category: `MigrationCaused`
A failure is migration-caused if:
- `errorMessage` contains a symbol from `compatibility-report.json` issues list.
- `stackTrace` references a file in `migrated-output/` that was modified by `code-refactoring-agent.md`.
- `errorMessage` matches known migration-induced patterns:

| Error Pattern | Likely Cause |
|---|---|
| `BinaryFormatter is not supported` | Rule N78001 / FW008 |
| `PlatformNotSupportedException` on crypto | Rules N78002 / N78003 |
| `System.NotSupportedException: Serialization` | BinaryFormatter removal |
| `The type or namespace 'System.Web'` | Framework-to-Core migration |
| `JsonException` / `JsonSerializerException` | Serializer switch |
| `Nullable reference type` assertion failure | Nullable annotations enabled |

#### Category: `PreExisting`
A failure is pre-existing if:
- No modified files from `refactoring-summary.json` appear in the stack trace.
- Error is business logic assertion (expected value ≠ actual value).

#### Category: `Incompatible`
A test itself cannot run on the new framework:
- Test uses `[Ignore]` or `[Skip]` with reason containing the old TFM.
- Test uses `AppDomain.CreateDomain()` (removed in Core).

### Step 6 — Generate Recommendations
For each `MigrationCaused` failure:
- Look up `relatedRuleId` from `compatibility-report.json`.
- Provide the replacement guidance from that rule.
- Reference the `// TODO [MIGRATION]` comment location using the `outputFile` path in `migrated-output/`.

For `PreExisting` failures:
- Explicitly state: "This failure is NOT caused by the migration."
- Recommend developer review.

### Step 7 — Determine Overall Outcome

| Condition | Outcome Value |
|---|---|
| All tests passed | `AllPassed` |
| Some failures, all `MigrationCaused` | `PartialPass` |
| Some failures, some `PreExisting` | `PartialPass` |
| All tests failed | `AllFailed` |
| No test projects found | `NoTests` |

Note: `PartialPass` or `AllFailed` does NOT trigger rollback. Rollback is only triggered by build failure.

### Step 8 — Write `test-result.json` and Report
Write to `migrated-output/.migration/`.
Print to developer:
```
✅ Test Execution Complete (from migrated-output/)
   Total tests:    312
   Passed:         305  ✅
   Failed:           5  ❌
     Migration-caused: 3  (see TODO markers in migrated-output/)
     Pre-existing:     2  (unrelated to migration)
   Skipped:          2  ⏭️
   Original source:  untouched ✅
   Proceeding to Critique & Report Generation...
```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| `dotnet test` CLI | Test execution from `migrated-output/` |
| TRX XML parser | Structured result extraction |
| Stack trace analyzer | Map failures to modified files in `migrated-output/` |
| `compatibility-report.json` lookup | Classify migration-caused failures |

---

## SKILLS USED

### Skill: Unit Test Execution + Failure Classification
**Logic:**
1. Run `dotnet test --logger trx` per project in `migrated-output/`.
2. Parse `.trx` output XML from `migrated-output/.migration/test-results/`.
3. For each failure, extract stack trace and error message.
4. Cross-reference modified file list from `refactoring-summary.json` (uses `outputFile` paths).
5. If stack trace file matches a file in `migrated-output/` that was modified → `MigrationCaused`.
6. Else if error matches known migration patterns → `MigrationCaused`.
7. Else → `PreExisting`.

### Skill: Test Framework Compatibility Checker
**Logic:**
1. For each test project in `migrated-output/`, check test framework package version.
2. Known required versions:

| Framework | Required for net8.0 |
|---|---|
| xUnit | 2.7.0+ |
| NUnit | 4.0.0+ |
| MSTest | 3.2.0+ |
| Microsoft.NET.Test.Sdk | 17.9.0+ |

3. If outdated → flag in `test-result.json` as `"testFrameworkOutdated": true`.

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Build & Compilation Agent | Pre-condition gate — only runs after successful build of `migrated-output/` |
| Code Refactoring Agent | Reads modified file list (`outputFile` paths) to classify failures |
| API Compatibility Agent | Reads `compatibility-report.json` to link failures to rules |
| Critique Agent | Passes `test-result.json` for quality scoring |
| Reporting Agent | Passes `test-result.json` for final report |
| Rollback Agent | NOT invoked by this agent — test failures do not trigger rollback |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| Build pre-condition not met | Halt, do not run tests |
| Test runner crashes | Capture crash output, mark project as `"outcome": "RunnerError"`, continue with other projects |
| TRX file not generated | Fall back to console output parsing; flag as "reduced accuracy" |
| All tests fail | Report `AllFailed`, do NOT rollback — developer must review `migrated-output/` |
| No test projects found | Log `"outcome": "NoTests"`, continue to critique and report generation |

---

*Agent Version: 2.1.0 | Tests from migrated-output/ only | Pipeline Step: 6 of 7*