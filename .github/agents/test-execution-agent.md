# Test Execution & Regression Agent

> **Called by:** `dotnet-migration-orchestrator-agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 6.
> **Pre-condition:** Only invoked if `migrated-output/{repoName}/.migration/build-result.json` contains `"outcome": "Success"`.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Verify `migrated-output/{repoName}/.migration/build-result.json` shows `"outcome": "Success"` before running anything — abort if not.
- Run `dotnet test` against all test projects discovered in `migrated-output/{repoName}/` automatically.
- Capture full test output in TRX format for structured parsing.
- Classify every test result: `Passed`, `Failed`, `Skipped`, `Incompatible`.
- Do NOT invoke rollback on test failures — tests failing after migration is expected behavior that requires developer review.
- Write `test-result.json` to `migrated-output/{repoName}/.migration/` and report to developer.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
RUN TESTS from:  migrated-output/{repoName}/ (the upgraded project)
WRITE to:        migrated-output/{repoName}/.migration/test-result.json
                 migrated-output/{repoName}/.migration/test-results/*.trx

Never run tests against the original source project.
Never write any file to the original source project.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Test Execution & Regression Agent |
| Role | Execute test suite from `migrated-output/{repoName}/`, classify results, distinguish migration-caused failures from pre-existing ones |
| Pipeline Position | Step 6 of 7 |
| Mode | Execute — runs `dotnet test` from `migrated-output/{repoName}/`, no source modifications |
| Invoked By | Migration Orchestrator Agent |
| Pre-condition | `migrated-output/{repoName}/.migration/build-result.json` must have `"outcome": "Success"` |
| Reads | `migrated-output/{repoName}/.migration/solution-map.json`, `migrated-output/{repoName}/.migration/build-result.json` |
| Writes | `migrated-output/{repoName}/.migration/test-result.json`, `migrated-output/{repoName}/.migration/test-results/*.trx` |

---

## RESPONSIBILITY

Execute the full test suite against the migrated codebase in `migrated-output/{repoName}/`. Classify test failures as either migration-caused (regressions introduced by the upgrade) or pre-existing (failures that existed before migration). Provide actionable guidance for each failure category. Do not block the pipeline on test failures — surface them clearly and let the developer decide.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/{repoName}/.migration/solution-map.json` | Step 1 agent | ✅ |
| `migrated-output/{repoName}/.migration/build-result.json` | Step 5 agent | ✅ (must show Success) |
| `targetVersion` | Orchestrator context | ✅ |
| Test project list | Extracted from `solution-map.json` (`projectType: "TestProject"`) | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/{repoName}/.migration/test-result.json`

```json
{
  "testTimestamp": "2026-01-15T10:47:00Z",
  "targetVersion": "net8.0",
  "testedFrom": "migrated-output/eShopOnWeb/",
  "totalTests": 312,
  "passed": 305,
  "failed": 5,
  "skipped": 2,
  "outcome": "PartialPass",
  "testProjects": [
    {
      "project": "migrated-output/eShopOnWeb/tests/Web.Tests/Web.Tests.csproj",
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
      "project": "migrated-output/eShopOnWeb/tests/Web.Tests",
      "failureCategory": "MigrationCaused",
      "errorMessage": "BinaryFormatter is not supported on this platform",
      "relatedRuleId": "N78001",
      "recommendation": "Update test to use System.Text.Json serialization. See TODO marker in migrated-output/eShopOnWeb/src/Infrastructure/Services/EmailService.cs"
    },
    {
      "testName": "UserRepository_GetAll_ReturnsOrdered",
      "project": "migrated-output/eShopOnWeb/tests/Web.Tests",
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
- Read `migrated-output/{repoName}/.migration/build-result.json`.
- If `outcome != "Success"` → halt immediately, report: "Test execution skipped — build from migrated-output/{repoName}/ must pass first."

### Step 2 — Discover Test Projects
From `solution-map.json`, collect all projects where `projectType == "TestProject"`.
Use the `outputProjectFile` paths (inside `migrated-output/{repoName}/`) for all test commands.

Supported test frameworks (auto-detected from `PackageReference`):

| Framework | Package | Runner |
|---|---|---|
| xUnit | `xunit` | `dotnet test` |
| NUnit | `NUnit` | `dotnet test` |
| MSTest | `MSTest.TestFramework` | `dotnet test` |

### Step 3 — Run Tests with Structured Output
For each test project inside `migrated-output/{repoName}/`, run:
```bash
dotnet test migrated-output/eShopOnWeb/tests/Web.Tests/Web.Tests.csproj \
  --configuration Release \
  --no-build \
  --logger "trx;LogFileName=test-results.trx" \
  --results-directory migrated-output/eShopOnWeb/.migration/test-results/ \
  --verbosity normal
```

Key flags:
- `--no-build`: Skip rebuild — use already-built binaries from step 5.
- `--logger trx`: Produces structured XML output for reliable parsing.
- `--results-directory`: All TRX files go to `migrated-output/{repoName}/.migration/test-results/`.

### Step 4 — Parse TRX Results
Parse each `.trx` XML file from `migrated-output/{repoName}/.migration/test-results/`:
- Extract `<UnitTestResult outcome="...">` nodes.
- Map outcomes: `Passed` / `Failed` / `NotExecuted` (Skipped) / `Error`.
- For each failure, extract: `testName`, `errorMessage`, `stackTrace`.

### Step 5 — Classify Test Failures

For every failed test, determine the failure category:

#### Category: `MigrationCaused`
A failure is migration-caused if:
- `errorMessage` contains a symbol from `compatibility-report.json` issues list.
- `stackTrace` references a file in `migrated-output/{repoName}/` that was modified by `code-refactoring-agent.md`.
- `errorMessage` matches known migration-induced patterns:

| Error Pattern | Likely Cause |
|---|---|
| `BinaryFormatter is not supported` | Rule N78001 / FW008 |
| `PlatformNotSupportedException` on crypto | Rules N78002 / N78003 |
| `System.NotSupportedException: Serialization` | BinaryFormatter removal |
| `The type or namespace 'System.Web'` | Framework-to-Core migration |
| `JsonException` / `JsonSerializerException` | Serializer switch (Newtonsoft → System.Text.Json) |
| `Nullable reference type` assertion failure | Nullable annotations enabled |
| `Required properties '{...}' are missing` (`DbUpdateException`) | EF Core 8 required-property enforcement (rule EFC004) — usually test seed data; recommend fixing the seed, not the migration |
| `cannot be configured as non-owned because it has already been configured as owned` | EF Core 3.0+ owned-type rule (EFC002) |
| `could not be translated` / client-evaluation `InvalidOperationException` | EF Core 3.0+ client-eval rule (EFC003) — often surfaces as a runtime 500 in functional tests |

#### Category: `PreExisting`
A failure is pre-existing if:
- No modified files from `refactoring-summary.json` appear in the stack trace.
- Error is business logic assertion (expected value ≠ actual value).

#### Category: `Incompatible`
A test itself cannot run on the new framework:
- Test uses `[Ignore]` or `[Skip]` with reason containing the old TFM.
- Test uses `AppDomain.CreateDomain()` (removed in Core).

#### Category: `Environmental`
The failure is caused by the run environment, NOT the migration — do not count these against migration quality:
- `Unable to load DLL '...SNI.dll' ... filename or extension is too long (0x800700CE)` → Windows `MAX_PATH`; re-run from a short output root.
- Failures requiring a real SQL Server / external service that isn't available (the app's `Database.Migrate()` against a SqlServer connection in a test host).
- Report these separately and recommend the environment fix; never misclassify them as migration defects or as a reason to roll back.

### Step 6 — Generate Recommendations
For each `MigrationCaused` failure:
- Look up `relatedRuleId` from `compatibility-report.json`.
- Provide the replacement guidance from that rule.
- Reference the `// TODO [MIGRATION]` comment location using the `outputFile` path in `migrated-output/{repoName}/`.

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
Write to `migrated-output/{repoName}/.migration/`.
Print to developer:
```
✅ Test Execution Complete (from migrated-output/{repoName}/)
   Total tests:    312
   Passed:         305  ✅
   Failed:           5  ❌
     Migration-caused: 3  (see TODO markers in migrated-output/{repoName}/)
     Pre-existing:     2  (unrelated to migration)
   Skipped:          2  ⏭️
   Original source:  untouched ✅
   Proceeding to Critique & Report Generation...
```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| `dotnet test` CLI | Test execution from `migrated-output/{repoName}/` |
| TRX XML parser | Structured result extraction |
| Stack trace analyzer | Map failures to modified files in `migrated-output/{repoName}/` |
| `compatibility-report.json` lookup | Classify migration-caused failures |

---

## SKILLS USED

### Skill: Unit Test Execution + Failure Classification
**Logic:**
1. Run `dotnet test --logger trx` per project in `migrated-output/{repoName}/`.
2. Parse `.trx` output XML from `migrated-output/{repoName}/.migration/test-results/`.
3. For each failure, extract stack trace and error message.
4. Cross-reference modified file list from `refactoring-summary.json` (uses `outputFile` paths).
5. If stack trace file matches a file in `migrated-output/{repoName}/` that was modified → `MigrationCaused`.
6. Else if error matches known migration patterns → `MigrationCaused`.
7. Else → `PreExisting`.

### Skill: Test Framework Compatibility Checker
**Logic:**
1. For each test project in `migrated-output/{repoName}/`, check test framework package version.
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
| Build & Compilation Agent | Pre-condition gate — only runs after successful build of `migrated-output/{repoName}/` |
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
| All tests fail | Report `AllFailed`, do NOT rollback — developer must review `migrated-output/{repoName}/` |
| No test projects found | Log `"outcome": "NoTests"`, continue to critique and report generation |

---

## TEST-HOST MIGRATION CHECKLIST — .NET Core 2.x/3.x → 5+/8 (v3.1)

`WebApplicationFactory` / `TestServer` fixtures written for 2.x routinely **compile but 500 at request time** on net8. Apply these proactively (hand to `code-refactoring-agent.md`; they are flagged TH001–TH004 by the API agent). This checklist is the highest-value addition: the 2.2→8 functional-test failures almost always come from the FIXTURE, not the application.

**Diagnose the real error first — never guess from the 500.** `WebApplicationFactory` swallows the server exception into a generic 500. To see it: (a) run the migrated app directly (`dotnet <app>.dll` with `ASPNETCORE_ENVIRONMENT=Development` + a known `ASPNETCORE_URLS`) and `curl` the failing route — the dev exception page returns the real stack; or (b) add a throwaway test that reads the response body. If the app returns 200 standalone but the test 500s, the defect is in the FIXTURE.

1. **TH001 — environment default changed.** Mvc.Testing no longer forces `Development` (it did on 2.2); the host runs as `Production`, so environment-named `Startup.Configure{Env}Services` conventions diverge (e.g. a `ConfigureProductionServices` that wires `UseSqlServer` with an empty connection string → 500). **Fix:** pin a neutral environment in the fixture — `builder.UseEnvironment("Testing")` — so the in-memory registration is the only DB path.
2. **TH002 — EF internal-service-provider cache.** `services.AddEntityFrameworkInMemoryDatabase()` + `options.UseInternalServiceProvider(provider)` injects EF Core's own **size-limited** `IMemoryCache` into the shared app container ahead of `AddMemoryCache` (which is `TryAdd`) → app caching throws *"Cache entry must specify a value for Size when SizeLimit is set."* **Fix:** delete that 2.x pattern; use `options.UseInMemoryDatabase(name, sharedRoot)` only.
3. **TH003 — shared store + parallel classes.** xUnit runs test classes in parallel; a `static` `InMemoryDatabaseRoot` (or fixed DB name shared across fixtures) races seeders/readers → flaky counts (e.g. pagination returns the wrong number). **Fix:** use a **per-fixture instance** `InMemoryDatabaseRoot`.
4. **TH004 — service-registration ordering flipped.** On net8 the fixture's `ConfigureServices` runs BEFORE `Startup.ConfigureServices`. If the fixture pre-registers Identity/auth, `Startup`'s later config wins and can override it (e.g. cookie `LoginPath` resolving to the wrong path). **Fix:** register only the DbContexts in the fixture; **seed post-build** via a `CreateServer(IWebHostBuilder)` override (legacy WebHost programs) or `CreateHost(IHostBuilder)` override (minimal-hosting programs) using the built host's own services — this preserves the app's real ordering and gives the seeder a fully-configured provider.
5. **EFC004 — required properties on SaveChanges.** EF Core 8 enforces required (non-nullable/`IsRequired`) properties even on the InMemory provider. If seed data omits them → `DbUpdateException`. **Fix the seed data, not the migration.**

Classify all of the above as `MigrationCaused` (sub-category: test-fixture), and — because the fixture lives in `migrated-output/` — FIX it rather than only reporting it. Re-run until green; record the resolved failures and their root causes in `test-result.json`.

---

*Agent Version: 3.1.0 | Tests from migrated-output/{repoName}/ only | Pipeline Step: 6 of 7*