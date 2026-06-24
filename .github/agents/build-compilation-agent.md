# Build & Compilation Agent

> **Called by:** `dotnet-migration-orchestrator-agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 5.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Run `dotnet build` against `migrated-output/{repoName}/` immediately on invocation — never against the original source.
- Use `--configuration Release` and `--no-incremental` flags for a clean build.
- Capture the full MSBuild output — do not truncate error logs.
- Classify every error and warning by category before writing output.
- If build FAILS: invoke `rollback-agent.md` automatically and halt the pipeline.
- If build PASSES: write `build-result.json` to `migrated-output/{repoName}/.migration/` and signal the orchestrator to proceed.
- Never attempt to fix build errors directly — errors are fed back to `code-refactoring-agent.md` for a targeted retry if configured.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
BUILD from:  migrated-output/{repoName}/ (the upgraded project copies)
WRITE to:    migrated-output/{repoName}/.migration/build-result.json

Never run dotnet build against the original source project.
Never write any file to the original source project.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Build & Compilation Agent |
| Role | Execute MSBuild against `migrated-output/{repoName}/`, capture output, classify errors, gate pipeline progression |
| Pipeline Position | Step 5 of 7 |
| Mode | Execute (runs `dotnet` CLI against `migrated-output/{repoName}/`) — no source file modifications |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/{repoName}/.migration/refactoring-summary.json`, all `.csproj` files in `migrated-output/{repoName}/` |
| Writes | `migrated-output/{repoName}/.migration/build-result.json` |

---

## RESPONSIBILITY

Perform a clean release build of the entire solution from `migrated-output/{repoName}/`. Classify every MSBuild diagnostic (error / warning / message) into actionable categories. Gate the pipeline: the test execution agent only runs if the build succeeds. On failure, trigger rollback (which clears `migrated-output/{repoName}/`).

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| Solution file path | `migrated-output/{repoName}/` filesystem | ✅ |
| `targetVersion` TFM | Orchestrator context | ✅ |
| `migrated-output/{repoName}/.migration/refactoring-summary.json` | Step 4 agent | ✅ |
| Installed .NET SDK | Developer machine / CI environment | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/{repoName}/.migration/build-result.json`

```json
{
  "buildTimestamp": "2026-01-15T10:45:00Z",
  "targetVersion": "net8.0",
  "builtFrom": "migrated-output/eShopOnWeb/",
  "command": "dotnet build migrated-output/eShopOnWeb/eShopOnWeb.sln --configuration Release --no-incremental",
  "outcome": "Success",
  "exitCode": 0,
  "duration": "00:01:23",
  "errors": [],
  "warnings": [
    {
      "code": "CS0618",
      "message": "SomeClass is obsolete",
      "file": "migrated-output/eShopOnWeb/src/Infrastructure/Services/LegacyService.cs",
      "line": 44,
      "category": "ObsoleteUsage"
    }
  ],
  "projects": [
    {
      "project": "migrated-output/eShopOnWeb/src/Web/Web.csproj",
      "outcome": "Success",
      "errors": 0,
      "warnings": 2
    }
  ]
}
```

---

## EXECUTION STEPS

### Step 1 — Verify SDK Installation
Run:
```bash
dotnet --version
```
- Verify the installed SDK version supports `targetVersion`.
- Minimum SDK requirements:

| Target | Min SDK |
|---|---|
| net6.0 | 6.0.100 |
| net7.0 | 7.0.100 |
| net8.0 | 8.0.100 |
| net9.0 | 9.0.100 |

- If SDK version is too low: halt pipeline, report exact SDK version needed, do NOT invoke rollback.

**Path-length pre-flight (Windows):** measure the longest expected output path (e.g. `migrated-output/{repoName}/tests/.../bin/Release/{tfm}/runtimes/win-x64/native/Microsoft.Data.SqlClient.SNI.dll`). If it risks exceeding `MAX_PATH` (260), warn the developer to use a short output root or enable long paths. A too-long path does not fail the build but causes runtime native-DLL load failures (`0x800700CE`) that show up as test errors — record this in `build-result.json` so they aren't misclassified as migration defects.

### Step 2 — Restore NuGet Packages from `migrated-output/{repoName}/`
Run:
```bash
dotnet restore migrated-output/eShopOnWeb/eShopOnWeb.sln --verbosity normal
```
- Capture restore output.
- If restore fails: capture exact error, write `build-result.json` with `"outcome": "RestoreFailed"`, halt pipeline.

### Step 3 — Execute Build from `migrated-output/{repoName}/`
Run:
```bash
dotnet build migrated-output/eShopOnWeb/eShopOnWeb.sln --configuration Release --no-incremental --verbosity normal 2>&1
```
- `--no-incremental` ensures a full clean build.
- Capture full stdout + stderr.
- Record exit code and wall-clock duration.

If no `.sln` file is found in `migrated-output/{repoName}/`, build each `.csproj` individually:
```bash
dotnet build migrated-output/eShopOnWeb/src/Web/Web.csproj --configuration Release --no-incremental
```

### Step 4 — Parse MSBuild Output
Parse the captured output for diagnostic lines matching the MSBuild format:
```
{file}({line},{col}): {severity} {code}: {message} [{project}]
```

All file paths in output will reference `migrated-output/{repoName}/` — this is expected and correct.

### Step 5 — Classify Errors

| Error Code Prefix | Category | Description |
|---|---|---|
| `CS0` series | `CompilerError` | C# language/type errors |
| `CS0246` | `MissingType` | Type not found — likely removed API or missing using |
| `CS0234` | `MissingNamespace` | Namespace not found |
| `CS0619` | `ObsoleteError` | Used obsolete member with `error` severity |
| `CS8600`–`CS8655` | `NullabilityError` | Nullable reference type violations |
| `MSB3277` | `AssemblyConflict` | Multiple versions of same assembly |
| `MSB4018` | `TaskError` | MSBuild task failure |
| `NU1202` | `PackageIncompatible` | Package not compatible with TFM |
| `NU1701` | `PackageTargetFallback` | Package restored with fallback TFM |
| `NETSDK1138` | `SDKVersionMismatch` | Project TFM not supported by installed SDK |
| `NETSDK1045` | `TFMNotSupported` | Target framework requires higher SDK |

### Step 6 — Classify Warnings

| Warning Code | Category | Action |
|---|---|---|
| `CS0618` | `ObsoleteUsage` | Log — obsolete but still compiles |
| `CS8618` | `UninitializedNonNullable` | Log — nullable annotation issue |
| `NU1701` | `TargetFallback` | Log — package using netstandard fallback |
| `CS0067` | `UnusedEvent` | Log |
| `CS0414` | `UnusedField` | Log |

### Step 7 — Determine Outcome and Act

**If `exitCode == 0` (Build Succeeded):**
- Write `migrated-output/{repoName}/.migration/build-result.json` with `"outcome": "Success"`.
- Print to developer:
  ```
  ✅ Build Succeeded (from migrated-output/{repoName}/)
     Duration:    00:01:23
     Errors:      0
     Warnings:    2
     Original source: untouched ✅
     Proceeding to Test Execution...
  ```

**If `exitCode != 0` (Build Failed):**
- Do **not** roll back yet. Enter the **Build → Fix Loop (Step 8)** — classify the errors and hand them to `code-refactoring-agent.md`, then rebuild.
- Only if the build is still red after `maxBuildFixIterations`:
  - Write `build-result.json` with `"outcome": "Failed"`, the full error list, and `buildIterationsToGreen`.
  - `rollbackOnFailure: false` (**default**) → **preserve** `migrated-output/{repoName}/`, continue to `reporting-agent.md` so the developer gets a report of the remaining errors + TODO markers. Do not delete the output.
  - `rollbackOnFailure: true` → invoke `rollback-agent.md`, then halt.

### Step 8 — Build → Fix Loop (default behavior)
Real migrations rarely go green on the first build — a single retry is not enough. Run an **iterative loop** (default on; `retryOnBuildFailure: true`):

```
restore once
for iteration in 1..maxBuildFixIterations (default 6):
    build (incremental — NOT --no-incremental during the loop)
    if exitCode == 0: break  → run one final clean `--no-incremental` build to confirm, then succeed
    parse + classify errors → hand the structured error list to code-refactoring-agent.md
    code-refactoring-agent.md applies targeted fixes in migrated-output/{repoName}/ for, e.g.:
      - MissingType / MissingNamespace  → add using, FrameworkReference, or the explicit package
        the 2.x metapackage used to bundle (Identity.UI, Diagnostics.EntityFrameworkCore, EFCore.InMemory…)
      - renamed APIs (ForSqlServer* → UseHiLo, UseSwaggerUi3 → UseSwaggerUi, Info → OpenApiInfo…)
      - signature changes (MediatR Handle order / Task<Unit>→Task, FluentValidation ValidationContext<T>)
      - ambiguous LINQ (GroupCollection → .Values)
if still failing after the loop:
    honor rollbackOnFailure (default false → preserve output + report remaining errors; true → rollback)
```

Always tell the developer how many iterations were used (`buildIterationsToGreen`) and list any error that recurred unchanged across two iterations (likely needs a manual `// TODO [MIGRATION]`).

**Speed rules:**
- `dotnet restore` once, then build with the incremental cache during the loop; reserve `--no-incremental` for the single final confirmation build.
- Build in dependency order **leaf projects first** (from `solution-map.json` `migrationOrder`) so the earliest failure surfaces fastest, rather than rebuilding the whole solution each pass.
- Parse errors by **code**, dedup by `(file,line,code)`, and group identical errors (one fix often clears many sites).

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| `dotnet` CLI | `restore` and `build` commands targeting `migrated-output/{repoName}/` |
| MSBuild diagnostic parser | Structured error extraction from console output |
| Process executor | Capture stdout/stderr and exit code |

---

## SKILLS USED

### Skill: MSBuild Output Parser
**Logic:**
1. Read raw build output line by line.
2. Match against regex: `^(.+)\((\d+),(\d+)\): (error|warning|message) ([A-Z]+\d+): (.+) \[(.+)\]$`
3. Group into structured `Diagnostic` objects.
4. Handle multi-line error messages.
5. Aggregate by project and severity.
**Edge cases:**
- All file paths in output reference `migrated-output/{repoName}/` — treat these as expected, not as warnings.
- Build output in non-English locales — parse by code, not message text.
- Errors without file references (project-level MSBuild errors) — assign to project file.

### Skill: SDK Version Validator
**Logic:**
1. Run `dotnet --list-sdks` to get all installed SDKs.
2. Parse version list.
3. Find the highest installed SDK that satisfies `>= minSdkForTarget`.
4. If found: pass. If not found: report exact SDK download URL.
**SDK download URLs:**
- .NET 8 SDK: `https://dotnet.microsoft.com/download/dotnet/8.0`
- .NET 9 SDK: `https://dotnet.microsoft.com/download/dotnet/9.0`

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Code Refactoring Agent | Receives modified `migrated-output/{repoName}/` files; on retry, sends error classification back |
| Test Execution Agent | Gated: only invoked if `outcome == "Success"` |
| Rollback Agent | Invoked automatically on `outcome == "Failed"` — clears `migrated-output/{repoName}/` |
| Reporting Agent | Passes `build-result.json` for final report |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| SDK not installed | Halt, report SDK version and download link, do NOT rollback (source unchanged) |
| NuGet restore fails for `migrated-output/{repoName}/` | Halt, report missing packages, do NOT rollback (source unchanged) |
| Build fails on first attempt | Invoke rollback (clear `migrated-output/{repoName}/`), write error report, halt |
| Build fails on retry | Invoke rollback, write error report with both attempt logs, halt |
| `dotnet` CLI not found in PATH | Halt immediately, report: "dotnet CLI not found. Install .NET SDK." |

---

## SOLUTION HYGIENE PRE-FLIGHT (v3.1 — avoid a guaranteed wasted iteration)

Before building, remove from the OUTPUT `.sln` copy (never the source) any project the `dotnet` CLI cannot build, then build the cleaned solution:
- `.dcproj` (Docker Compose), `.sqlproj`, `.wapproj`, `.vcxproj`, Node/`.esproj`. Delete their `Project(...)`/`EndProject` block AND their `{GUID}.*` lines under `ProjectConfigurationPlatforms`. Record the removal in `build-result.json` and the report.
- Alternative: build an explicit project list — the test projects transitively cover all `src` projects, so building the test projects builds everything.

## SPEED RULES (reinforced v3.1)
- `dotnet restore` ONCE. In the fix loop, build WITHOUT `--no-incremental` (reuse the cache). Use `--no-incremental` only for the single final confirmation build. Re-restore only when a `.csproj` package set changes.
- Parse errors by **code**, dedup by `(file,line,code)`, group identical errors, and hand `code-refactoring-agent.md` the whole grouped set so it batch-fixes by class (one fix clears many sites). Expect 1–2 iterations when the pre-flight sweep ran, not 6.
- Most first-iteration errors after a 2.x decomposition are `CS0246`/`CS1061` "missing type/member": map them to the explicit package the metapackage used to bundle (InMemory, Identity.UI, Diagnostics.EntityFrameworkCore) or a `<FrameworkReference>` for ASP.NET types in non-web projects.

---

*Agent Version: 3.1.0 | Builds from migrated-output/{repoName}/ only | Pipeline Step: 5 of 7*