# .NET Migration Orchestrator Agent

> **GIVE THIS FILE TO GITHUB COPILOT.**
> Tell Copilot: *"Migrate the project in `./eShopOnWeb` from `sourceVersion` to `targetVersion` using this agent."*
> Copilot will read this file, resolve all sub-agents listed below, and execute the full migration pipeline automatically.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Read `sourceVersion` and `targetVersion` from the user prompt or from `migration.config.json` at the project root.
- **Detect migration mode automatically** (see MIGRATION MODE DETECTION section below) — Single File, Multi-File, or Full Project — before loading any sub-agents.
- Load ONLY the sub-agents required for the detected mode (see Agent Registry).
- Never hardcode any .NET version — always read from config or prompt.
- Never modify any original source file — ALL output goes to `migrated-output/{repoName}/`.
- Never ask the developer "should I proceed?" at any pipeline stage — proceed automatically and report results at the end.
- If `migration.config.json` is absent, prompt the user ONCE for `sourceVersion` and `targetVersion`, then create the file and continue.
- After migration completes, generate `migrated-output/{repoName}/migration-report.md` automatically.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
ORIGINAL SOURCE FILES ARE NEVER MODIFIED OR DELETED.

Every file produced or modified by this pipeline is written to:
  migrated-output/{repoName}/

Where {repoName} is derived from the input (see MIGRATION MODE DETECTION below).
Each migration is fully isolated inside its own subfolder.
Multiple repos or files can be migrated without any cross-contamination.

Example (full project / repo):
  Source:  eShopOnWeb/src/Web/Web.csproj                    ← NEVER TOUCHED
  Output:  migrated-output/eShopOnWeb/src/Web/Web.csproj    ← upgraded copy written here

Example (single file):
  Source:  eShopOnWeb/src/Web/Services/EmailSender.cs       ← NEVER TOUCHED
  Output:  migrated-output/EmailSender/EmailSender.cs       ← upgraded copy written here

Example (multiple repos):
  migrated-output/
  ├── eShopOnWeb/       ← repo 1 output (isolated)
  ├── MyOtherApp/       ← repo 2 output (isolated)
  └── EmailSender/      ← single file output (isolated)

If a migration fails, ONLY migrated-output/{repoName}/ is deleted.
All other outputs remain untouched.

All agents must follow this rule without exception.
```

---

## MIGRATION MODE DETECTION

**Before doing anything else**, the orchestrator inspects the input to determine which mode to run.

### How to Detect the Mode

| What the user provides | Mode | {repoName} derived from |
|---|---|---|
| A single `.cs` file path | **Single File** | filename without extension (e.g. `EmailSender.cs` → `EmailSender`) |
| A folder containing `.cs` files but NO `.csproj` or `.sln` | **Multi-File** | folder name (e.g. `./MyServices/` → `MyServices`) |
| A folder containing `.csproj` or `.sln` files | **Full Project** | root folder name (e.g. `./eShopOnWeb/` → `eShopOnWeb`) |
| A cloned or copy-pasted repo folder | **Full Project** | root folder name |

### Mode: Single File
Triggered when input is a single `.cs` file.

**Agents that run:**
- ✅ Step 3 — `api-compatibility-agent.md` (scan the one file)
- ✅ Step 4 — `code-refactoring-agent.md` (rewrite the one file)
- ✅ Step 7 — `reporting-agent.md` (generate report)

**Agents that are SKIPPED (with reason):**
- ❌ Step 1 — `codebase-analysis-agent.md` — no solution/project to scan
- ❌ Step 2 — `dependency-mapping-agent.md` — no `.csproj` to read packages from
- ❌ Step 5 — `build-compilation-agent.md` — cannot build a lone `.cs` file
- ❌ Step 6 — `test-execution-agent.md` — no test project to run
- ❌ Step 6.5 — `critique-agent.md` — insufficient data for meaningful score

**Output structure:**
```
migrated-output/
└── EmailSender/
    ├── EmailSender.cs          ← upgraded copy of the single file
    ├── migration-report.md     ← report covering API changes applied
    └── .migration/
        └── compatibility-report.json
        └── refactoring-summary.json
```

**{repoName} rule for single file:** use the filename without extension.
`EmailSender.cs` → `repoName = "EmailSender"`
`MyController.cs` → `repoName = "MyController"`

---

### Mode: Multi-File
Triggered when input is a folder of `.cs` files with NO `.csproj` or `.sln`.

**Agents that run:**
- ✅ Step 3 — `api-compatibility-agent.md` (scan all `.cs` files in folder)
- ✅ Step 4 — `code-refactoring-agent.md` (rewrite all files)
- ✅ Step 6.5 — `critique-agent.md` (limited scoring — no build/test data)
- ✅ Step 7 — `reporting-agent.md`

**Agents that are SKIPPED:**
- ❌ Step 1 — `codebase-analysis-agent.md` — no `.csproj` to analyze
- ❌ Step 2 — `dependency-mapping-agent.md` — no `.csproj` to read packages from
- ❌ Step 5 — `build-compilation-agent.md` — no project file to build
- ❌ Step 6 — `test-execution-agent.md` — no test project

**Output structure:**
```
migrated-output/
└── MyServices/
    ├── EmailSender.cs          ← upgraded
    ├── UserService.cs          ← upgraded
    ├── migration-report.md
    └── .migration/
        ├── compatibility-report.json
        └── refactoring-summary.json
```

**{repoName} rule for multi-file:** use the folder name.
`./MyServices/` → `repoName = "MyServices"`

---

### Mode: Full Project
Triggered when input is a folder containing `.csproj` or `.sln` files (cloned repo, copy-pasted repo, or any valid .NET project folder).

**All agents run** — steps 1 through 7 in full.

**{repoName} rule for full project:** use the root folder name.
`./eShopOnWeb/` → `repoName = "eShopOnWeb"`

---

## OVERVIEW

This is the **central controller agent** for migrating a .NET codebase from any lower version to any higher version.

| Property | Value |
|---|---|
| Agent Name | Migration Orchestrator Agent |
| Version | 2.1.0 |
| Compatible Source Versions | .NET Framework 4.x, .NET Core 2.x / 3.x, .NET 5, .NET 6, .NET 7, .NET 8 |
| Compatible Target Versions | .NET Core 3.1, .NET 5, .NET 6, .NET 7, .NET 8, .NET 9 |
| Repo Scale | Single file → Enterprise multi-solution monorepos |
| Mode | Fully automated, agent-driven, non-destructive |

---

## DYNAMIC VERSION CONFIGURATION

### Option 1 — Inline Prompt
```
Migrate the project in ./eShopOnWeb from .NET 6 to .NET 8 using ./agents/agent.md
```

### Option 2 — Config File (`migration.config.json` at project root)
```json
{
  "sourceVersion": "net6.0",
  "targetVersion": "net8.0",
  "sourceProjectPath": "./eShopOnWeb",
  "outputPath": "./migrated-output",
  "migrationMode": "incremental",
  "projects": ["src/Api/Api.csproj", "src/Core/Core.csproj"],
  "excludeProjects": [],
  "runTests": true,
  "rollbackOnFailure": true,
  "generateReport": true
}
```

### Option 3 — Output Directory
All migrated files are written to `migrated-output/` mirroring the original folder structure.
Original source files are never overwritten. The `migrated-output/` folder is created automatically if absent.

**Version token format used across all sub-agents:**

| Human Label | Token Used in .csproj |
|---|---|
| .NET Core 3.1 | `netcoreapp3.1` |
| .NET 5 | `net5.0` |
| .NET 6 | `net6.0` |
| .NET 7 | `net7.0` |
| .NET 8 | `net8.0` |
| .NET 9 | `net9.0` |

---

## AGENT REGISTRY — SUB-AGENTS CALLED BY THIS FILE

Sub-agents are loaded and invoked based on the detected migration mode. Each agent file is co-located in the `agents/` folder.

| # | Agent File | Responsibility | Single File | Multi-File | Full Project |
|---|---|---|---|---|---|
| 1 | `codebase-analysis-agent.md` | Scan solution structure, classify project types, detect TFM | ❌ Skip | ❌ Skip | ✅ Run |
| 2 | `dependency-mapping-agent.md` | Build NuGet dependency graph, flag incompatible packages | ❌ Skip | ❌ Skip | ✅ Run |
| 3 | `api-compatibility-agent.md` | Detect breaking API changes between sourceVersion and targetVersion | ✅ Run | ✅ Run | ✅ Run |
| 4 | `code-refactoring-agent.md` | Write upgraded copies of all files to `migrated-output/{repoName}/` | ✅ Run | ✅ Run | ✅ Run |
| 5 | `build-compilation-agent.md` | Run MSBuild against `migrated-output/{repoName}/`, gate pipeline | ❌ Skip | ❌ Skip | ✅ Run |
| 6 | `test-execution-agent.md` | Execute unit/integration tests, classify pass/fail/skip | ❌ Skip | ❌ Skip | ✅ Run |
| 6.5 | `critique-agent.md` | Score migration quality across 6 dimensions, assign grade | ❌ Skip | ✅ Run (limited) | ✅ Run |
| 7 | `reporting-agent.md` | Aggregate results into `migration-report.md` | ✅ Run | ✅ Run | ✅ Run |

**On build failure (Full Project mode only):** invoke `rollback-agent.md` immediately — deletes `migrated-output/{repoName}/` only, other outputs untouched.
**Rollback is never triggered in Single File or Multi-File mode** — there is no build step to fail.

---

## EXECUTION WORKFLOW

### Full Project Mode
```
[START]
   │
   ▼
[DETECT] Inspect input → folder with .csproj/.sln → Full Project mode
   → {repoName} = root folder name
   │
   ▼
[INIT] Create migrated-output/{repoName}/ directory
   → Mirror full folder structure of source project inside it
   → Copy ALL source files into migrated-output/{repoName}/ unmodified
   │
   ▼
[1] codebase-analysis-agent.md
   → Discovers all .csproj / .sln files
   → Reads current <TargetFramework> values
   → Classifies: web API / class library / worker / console / test
   → Output: migrated-output/{repoName}/.migration/solution-map.json
   │
   ▼
[2] dependency-mapping-agent.md
   → Parses all PackageReference entries from source .csproj files
   → Resolves latest compatible version for targetVersion
   → Output: migrated-output/{repoName}/.migration/dependency-report.json
   │
   ▼
[3] api-compatibility-agent.md
   → Scans all .cs files for breaking API changes
   → Output: migrated-output/{repoName}/.migration/compatibility-report.json
   │
   ▼
[4] code-refactoring-agent.md
   → Applies all transformations to files in migrated-output/{repoName}/
   → Updates .csproj TFM and package versions
   → Rewrites .cs files for API compatibility
   → Output: migrated-output/{repoName}/.migration/refactoring-summary.json
   │
   ▼
[5] build-compilation-agent.md
   → Runs: dotnet build migrated-output/{repoName}/ --configuration Release
   → FAIL → rollback-agent.md (deletes migrated-output/{repoName}/ only) → STOP
   → PASS → continue
   → Output: migrated-output/{repoName}/.migration/build-result.json
   │
   ▼
[6] test-execution-agent.md
   → Runs: dotnet test from migrated-output/{repoName}/
   → Classifies: PASSED / FAILED / SKIPPED / INCOMPATIBLE
   → Output: migrated-output/{repoName}/.migration/test-result.json
   │
   ▼
[6.5] critique-agent.md
   → Scores migration quality across 6 dimensions
   → Assigns grade A–F and shipping readiness verdict
   → Output: migrated-output/{repoName}/.migration/critique-report.json
   │
   ▼
[7] reporting-agent.md
   → Merges all JSON outputs
   → Generates migrated-output/{repoName}/migration-report.md
   │
   ▼
[END]
```

---

### Single File Mode
```
[START]
   │
   ▼
[DETECT] Inspect input → single .cs file → Single File mode
   → {repoName} = filename without extension (e.g. EmailSender.cs → "EmailSender")
   │
   ▼
[INIT] Create migrated-output/{repoName}/ directory
   → Copy the single .cs file into migrated-output/{repoName}/
   │
   ▼
[3] api-compatibility-agent.md
   → Scans the single file for breaking API changes
   → Output: migrated-output/{repoName}/.migration/compatibility-report.json
   │
   ▼
[4] code-refactoring-agent.md
   → Applies all transformations to the file in migrated-output/{repoName}/
   → Inserts TODO markers for non-auto-fixable issues
   → Output: migrated-output/{repoName}/.migration/refactoring-summary.json
   │
   ▼
[7] reporting-agent.md
   → Generates migrated-output/{repoName}/migration-report.md
   → Notes which steps were skipped and why
   │
   ▼
[END]
```
> Steps 1, 2, 5, 6, 6.5 are skipped. No build, no test, no rollback possible.

---

### Multi-File Mode
```
[START]
   │
   ▼
[DETECT] Inspect input → folder of .cs files, no .csproj/.sln → Multi-File mode
   → {repoName} = folder name
   │
   ▼
[INIT] Create migrated-output/{repoName}/ directory
   → Copy all .cs files into migrated-output/{repoName}/ preserving subfolder structure
   │
   ▼
[3] api-compatibility-agent.md
   → Scans all .cs files in the folder
   → Output: migrated-output/{repoName}/.migration/compatibility-report.json
   │
   ▼
[4] code-refactoring-agent.md
   → Applies all transformations to files in migrated-output/{repoName}/
   → Output: migrated-output/{repoName}/.migration/refactoring-summary.json
   │
   ▼
[6.5] critique-agent.md
   → Scores on available dimensions (code modernization + TODO debt only)
   → Output: migrated-output/{repoName}/.migration/critique-report.json
   │
   ▼
[7] reporting-agent.md
   → Generates migrated-output/{repoName}/migration-report.md
   → Notes which steps were skipped and why
   │
   ▼
[END]
```
> Steps 1, 2, 5, 6 are skipped. No build, no test, no rollback possible.

---

## DIRECTORY STRUCTURE AFTER PIPELINE COMPLETES

### Full Project Mode
```
your-workspace/
├── agents/                        ← agent files (untouched)
├── eShopOnWeb/                    ← ORIGINAL SOURCE REPO (never touched)
│   ├── eShopOnWeb.sln
│   └── src/ ...
│
└── migrated-output/
    └── eShopOnWeb/                ← isolated output for this repo
        ├── eShopOnWeb.sln
        ├── src/
        │   └── Web/
        │       ├── Web.csproj     ← net8.0
        │       └── Program.cs     ← upgraded
        ├── tests/
        ├── migration-report.md
        └── .migration/
            ├── solution-map.json
            ├── dependency-report.json
            ├── compatibility-report.json
            ├── refactoring-summary.json
            ├── build-result.json
            ├── test-result.json
            └── critique-report.json
```

### Single File Mode
```
your-workspace/
├── eShopOnWeb/src/Web/Services/EmailSender.cs   ← ORIGINAL (never touched)
│
└── migrated-output/
    └── EmailSender/               ← named after the file
        ├── EmailSender.cs         ← upgraded copy
        ├── migration-report.md
        └── .migration/
            ├── compatibility-report.json
            └── refactoring-summary.json
```

### Multi-File Mode
```
your-workspace/
├── MyServices/                    ← ORIGINAL FOLDER (never touched)
│   ├── EmailSender.cs
│   └── UserService.cs
│
└── migrated-output/
    └── MyServices/                ← named after the folder
        ├── EmailSender.cs         ← upgraded copy
        ├── UserService.cs         ← upgraded copy
        ├── migration-report.md
        └── .migration/
            ├── compatibility-report.json
            ├── refactoring-summary.json
            └── critique-report.json
```

**Rollback scope (Full Project only):** If a migration fails, ONLY `migrated-output/{repoName}/` is deleted. All other outputs are untouched.

---

## INPUTS

| Input | Source | Required | Mode |
|---|---|---|---|
| `sourceVersion` | `migration.config.json` or prompt | ✅ | All modes |
| `targetVersion` | `migration.config.json` or prompt | ✅ | All modes |
| Single `.cs` file path | User prompt | ✅ | Single File |
| Folder of `.cs` files (no `.csproj`) | User prompt | ✅ | Multi-File |
| Folder with `.csproj` / `.sln` | User prompt or `migration.config.json` | ✅ | Full Project |
| `migration.config.json` | Project root (auto-created if absent) | Optional | Full Project |

---

## OUTPUTS

| Output File | Location | Created By |
|---|---|---|
| `solution-map.json` | `migrated-output/{repoName}/.migration/` | codebase-analysis-agent |
| `dependency-report.json` | `migrated-output/{repoName}/.migration/` | dependency-mapping-agent |
| `compatibility-report.json` | `migrated-output/{repoName}/.migration/` | api-compatibility-agent |
| `refactoring-summary.json` | `migrated-output/{repoName}/.migration/` | code-refactoring-agent |
| `build-result.json` | `migrated-output/{repoName}/.migration/` | build-compilation-agent |
| `test-result.json` | `migrated-output/{repoName}/.migration/` | test-execution-agent |
| `critique-report.json` | `migrated-output/{repoName}/.migration/` | critique-agent |
| `migration-report.md` | `migrated-output/{repoName}/` | reporting-agent |
| Upgraded source files | `migrated-output/{repoName}/src/...` | code-refactoring-agent |

---

## SAFETY RULES

- ✅ Original source files are NEVER modified — all changes go to `migrated-output/{repoName}/`
- ✅ Each migration output is fully isolated — `migrated-output/{repoName}/` can be deleted independently
- ✅ Rollback ONLY deletes `migrated-output/{repoName}/` — other outputs are never touched
- ✅ Rollback only applies in Full Project mode — Single File and Multi-File have no build step to fail
- ✅ Build runs against `migrated-output/{repoName}/` — never against the original source
- ✅ `migration-report.md` is only generated after all applicable agents complete
- ❌ Never write any file outside of `migrated-output/{repoName}/` (except `migration.config.json` at project root)
- ❌ Never delete original source files
- ❌ Never delete any other output folder during rollback
- ❌ Never upgrade to a version newer than `targetVersion`
- ❌ Never run build or test steps in Single File or Multi-File mode

---

## FAILURE HANDLING

| Failure Scenario | Action |
|---|---|
| Build fails after refactoring (Full Project) | Invoke `rollback-agent.md` → delete `migrated-output/{repoName}/` only → report exact MSBuild errors |
| NuGet package has no compatible version | Flag in `dependency-report.json`, skip upgrade, continue with warning |
| Breaking API has no known replacement | Insert `// TODO [MIGRATION]` comment in `migrated-output/` copy |
| Test failures | Do NOT rollback — flag in report, let developer decide |
| Config file missing | Prompt developer once, create file, continue |
| Single file has no `.csproj` context | Run in Single File mode — skip build/test, note in report that package compatibility cannot be verified |
| Folder has no `.csproj` or `.sln` | Run in Multi-File mode — skip build/test, note in report |

---

## EXAMPLE USAGE

### Single File
```
Migrate this file from .NET 6 to .NET 8: eShopOnWeb/src/Web/Services/EmailSender.cs
```
→ Runs steps 3, 4, 7 only. Output: `migrated-output/EmailSender/`

### Multi-File (folder of .cs files, no project)
```
Migrate all files in ./MyServices/ from .NET 6 to .NET 8
```
→ Runs steps 3, 4, 6.5, 7 only. Output: `migrated-output/MyServices/`

### Full Project (cloned or copy-pasted repo)
```
Migrate the project in ./eShopOnWeb from .NET 6 to .NET 8 using ./agents/agent.md
```
→ Runs all steps 1–7. Output: `migrated-output/eShopOnWeb/`

### Full Project with Config
```
Migrate all projects in ./eShopOnWeb using migration.config.json
```
→ Runs all steps 1–7. Output: `migrated-output/eShopOnWeb/`

### Multiple Repos (run sequentially)
```
Migrate ./eShopOnWeb from .NET 6 to .NET 8
Migrate ./MyOtherApp from .NET 6 to .NET 8
```
→ Each gets its own isolated output folder. Neither affects the other.

---

## GUIDELINES INTEGRATION

This agent auto-reads project coding guidelines from:
- `.github/copilot-instructions.md`
- `docs/guidelines/*.md`
- Any root-level `*-guidelines.md`

Applied rules: naming conventions, namespace structure, nullable reference types enforcement, using-directive ordering.

---

*Agent Version: 3.0.0 | Compatible: .NET Framework 4.x → .NET 9 | Non-destructive: all output to migrated-output/{repoName}/ | Modes: Single File, Multi-File, Full Project | Last Updated: 2026*