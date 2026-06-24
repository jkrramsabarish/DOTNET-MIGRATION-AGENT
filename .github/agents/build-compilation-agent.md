# Build & Compilation Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 5.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Run `dotnet build` against `migrated-output/` immediately on invocation — never against the original source.
- Use `--configuration Release` and `--no-incremental` flags for a clean build.
- Capture the full MSBuild output — do not truncate error logs.
- Classify every error and warning by category before writing output.
- If build FAILS: invoke `rollback-agent.md` automatically and halt the pipeline.
- If build PASSES: write `build-result.json` to `migrated-output/.migration/` and signal the orchestrator to proceed.
- Never attempt to fix build errors directly — errors are fed back to `code-refactoring-agent.md` for a targeted retry if configured.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
BUILD from:  migrated-output/ (the upgraded project copies)
WRITE to:    migrated-output/.migration/build-result.json

Never run dotnet build against the original source project.
Never write any file to the original source project.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Build & Compilation Agent |
| Role | Execute MSBuild against `migrated-output/`, capture output, classify errors, gate pipeline progression |
| Pipeline Position | Step 5 of 7 |
| Mode | Execute (runs `dotnet` CLI against `migrated-output/`) — no source file modifications |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/.migration/refactoring-summary.json`, all `.csproj` files in `migrated-output/` |
| Writes | `migrated-output/.migration/build-result.json` |

---

## RESPONSIBILITY

Perform a clean release build of the entire solution from `migrated-output/`. Classify every MSBuild diagnostic (error / warning / message) into actionable categories. Gate the pipeline: the test execution agent only runs if the build succeeds. On failure, trigger rollback (which clears `migrated-output/`).

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| Solution file path | `migrated-output/` filesystem | ✅ |
| `targetVersion` TFM | Orchestrator context | ✅ |
| `migrated-output/.migration/refactoring-summary.json` | Step 4 agent | ✅ |
| Installed .NET SDK | Developer machine / CI environment | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/.migration/build-result.json`

```json
{
  "buildTimestamp": "2026-01-15T10:45:00Z",
  "targetVersion": "net8.0",
  "builtFrom": "migrated-output/",
  "command": "dotnet build migrated-output/eShopOnWeb.sln --configuration Release --no-incremental",
  "outcome": "Success",
  "exitCode": 0,
  "duration": "00:01:23",
  "errors": [],
  "warnings": [
    {
      "code": "CS0618",
      "message": "SomeClass is obsolete",
      "file": "migrated-output/src/Infrastructure/Services/LegacyService.cs",
      "line": 44,
      "category": "ObsoleteUsage"
    }
  ],
  "projects": [
    {
      "project": "migrated-output/src/Web/Web.csproj",
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

### Step 2 — Restore NuGet Packages from `migrated-output/`
Run:
```bash
dotnet restore migrated-output/eShopOnWeb.sln --verbosity normal
```
- Capture restore output.
- If restore fails: capture exact error, write `build-result.json` with `"outcome": "RestoreFailed"`, halt pipeline.

### Step 3 — Execute Build from `migrated-output/`
Run:
```bash
dotnet build migrated-output/eShopOnWeb.sln --configuration Release --no-incremental --verbosity normal 2>&1
```
- `--no-incremental` ensures a full clean build.
- Capture full stdout + stderr.
- Record exit code and wall-clock duration.

If no `.sln` file is found in `migrated-output/`, build each `.csproj` individually:
```bash
dotnet build migrated-output/src/Web/Web.csproj --configuration Release --no-incremental
```

### Step 4 — Parse MSBuild Output
Parse the captured output for diagnostic lines matching the MSBuild format:
```
{file}({line},{col}): {severity} {code}: {message} [{project}]
```

All file paths in output will reference `migrated-output/` — this is expected and correct.

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
- Write `migrated-output/.migration/build-result.json` with `"outcome": "Success"`.
- Print to developer:
  ```
  ✅ Build Succeeded (from migrated-output/)
     Duration:    00:01:23
     Errors:      0
     Warnings:    2
     Original source: untouched ✅
     Proceeding to Test Execution...
  ```

**If `exitCode != 0` (Build Failed):**
- Write `migrated-output/.migration/build-result.json` with `"outcome": "Failed"` and full error list.
- Print to developer:
  ```
  ❌ Build Failed (migrated-output/ build)
     Errors:   5
     Original source is safe — invoking rollback to clear migrated-output/...
  ```
- Invoke `rollback-agent.md` automatically.
- Halt pipeline.

### Step 8 — Retry Logic (Optional)
If `migration.config.json` has `"retryOnBuildFailure": true`:
- After first build failure, pass `build-result.json` errors back to `code-refactoring-agent.md`.
- `code-refactoring-agent.md` attempts targeted fixes in `migrated-output/` for `MissingType` and `PackageIncompatible` errors.
- Re-run build from `migrated-output/` once. If still fails → invoke rollback and halt.
- Maximum 1 retry — never loop.

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| `dotnet` CLI | `restore` and `build` commands targeting `migrated-output/` |
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
- All file paths in output reference `migrated-output/` — treat these as expected, not as warnings.
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
| Code Refactoring Agent | Receives modified `migrated-output/` files; on retry, sends error classification back |
| Test Execution Agent | Gated: only invoked if `outcome == "Success"` |
| Rollback Agent | Invoked automatically on `outcome == "Failed"` — clears `migrated-output/` |
| Reporting Agent | Passes `build-result.json` for final report |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| SDK not installed | Halt, report SDK version and download link, do NOT rollback (source unchanged) |
| NuGet restore fails for `migrated-output/` | Halt, report missing packages, do NOT rollback (source unchanged) |
| Build fails on first attempt | Invoke rollback (clear `migrated-output/`), write error report, halt |
| Build fails on retry | Invoke rollback, write error report with both attempt logs, halt |
| `dotnet` CLI not found in PATH | Halt immediately, report: "dotnet CLI not found. Install .NET SDK." |

---

*Agent Version: 2.1.0 | Builds from migrated-output/ only | Pipeline Step: 5 of 7*