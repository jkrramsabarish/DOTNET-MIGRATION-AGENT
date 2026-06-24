# Codebase Analysis Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 1.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Determine `{repoName}` from the root folder name of the source project (e.g. if source is `./eShopOnWeb/`, then `repoName = "eShopOnWeb"`).
- Recursively scan the **original source project** for `.sln`, `.csproj`, `.fsproj`, `.vbproj` files on invocation.
- Read `sourceVersion` and `targetVersion` from the orchestrator context — never prompt the developer again.
- Classify every discovered project by type before writing any output.
- Write `solution-map.json` to `migrated-output/{repoName}/.migration/` — create the folder if absent.
- Never modify any original source file — this agent is READ-ONLY on the source.
- Before writing solution-map.json, confirm `migrated-output/{repoName}/` exists and has a full copy of the source project inside it. If not, create it now by copying the entire source tree into `migrated-output/{repoName}/`.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   original source project (e.g. ./eShopOnWeb/)
WRITE to:    migrated-output/{repoName}/.migration/solution-map.json

Where {repoName} is the root folder name of the source repo (e.g. "eShopOnWeb").
Each repo gets its own isolated subfolder inside migrated-output/.

Never write to the original source project.
Never modify any file in the original source project.
Never write into another repo's subfolder inside migrated-output/.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Codebase Analysis Agent |
| Role | Discovery & classification of the full solution structure |
| Pipeline Position | Step 1 of 7 |
| Mode | Read-only on source — writes only to `migrated-output/.migration/` |
| Invoked By | Migration Orchestrator Agent |
| Reads | Original source project files |
| Writes | `migrated-output/{repoName}/.migration/solution-map.json` |

---

## RESPONSIBILITY

Perform a complete structural analysis of the .NET solution or workspace. Identify every project, its current target framework moniker (TFM), project type, inter-project dependencies, and readiness classification for migration from `sourceVersion` to `targetVersion`.

Also ensure `migrated-output/` is initialized with a full unmodified copy of the source project before handing off to the next agent.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `sourceVersion` | Orchestrator context | ✅ |
| `targetVersion` | Orchestrator context | ✅ |
| Source project root path | Orchestrator context | ✅ |
| `.sln` files | Source filesystem scan | Optional |
| `.csproj` / `.fsproj` / `.vbproj` files | Source filesystem scan | ✅ |
| `global.json` | Source project root | Optional |

---

## OUTPUTS

**Primary output:** `migrated-output/{repoName}/.migration/solution-map.json`

```json
{
  "repoName": "eShopOnWeb",
  "sourceVersion": "net6.0",
  "targetVersion": "net8.0",
  "sourceProjectRoot": "./eShopOnWeb",
  "outputRoot": "./migrated-output/eShopOnWeb",
  "scanTimestamp": "2026-01-15T10:30:00Z",
  "solutions": [
    {
      "solutionFile": "eShopOnWeb.sln",
      "outputSolutionFile": "migrated-output/eShopOnWeb/eShopOnWeb.sln",
      "projects": [
        {
          "projectFile": "src/Web/Web.csproj",
          "outputProjectFile": "migrated-output/eShopOnWeb/src/Web/Web.csproj",
          "projectName": "Web",
          "projectType": "WebApi",
          "currentTFM": "net6.0",
          "targetTFM": "net8.0",
          "outputType": "Exe",
          "nullable": true,
          "implicitUsings": true,
          "projectReferences": ["src/ApplicationCore/ApplicationCore.csproj"],
          "packageCount": 12,
          "sourceFileCount": 47,
          "migrationReadiness": "Ready",
          "warnings": []
        }
      ]
    }
  ],
  "orphanProjects": [],
  "globalJsonFound": true,
  "globalJsonSdkVersion": "6.0.400"
}
```

Note: every `projectFile` path has a corresponding `outputProjectFile` path pointing into `migrated-output/{repoName}/`. The `repoName` field at the top of this file is used by all downstream agents to scope their reads and writes correctly.

---

## EXECUTION STEPS

### Step 0 — Determine repoName and Initialize `migrated-output/{repoName}/`
Before doing anything else:
- Derive `{repoName}` from the root folder name of the source project path (e.g. `./eShopOnWeb` → `repoName = "eShopOnWeb"`).
- Check if `migrated-output/{repoName}/` exists.
- If absent, create it and copy the entire source project tree into it:
  ```
  migrated-output/
  └── eShopOnWeb/               ← repo-scoped output folder
      ├── eShopOnWeb.sln        ← unmodified copy
      ├── src/                  ← unmodified copy
      ├── tests/                ← unmodified copy
      └── global.json           ← unmodified copy
  ```
- Create `migrated-output/{repoName}/.migration/` subfolder.
- All subsequent agents will read originals from source and write modified versions to `migrated-output/{repoName}/`.
- If another repo's folder already exists in `migrated-output/` (e.g. `migrated-output/AnotherRepo/`), leave it completely untouched.

### Step 1 — Discover Solution Files
- Recursively scan the **source project root** for `*.sln` files.
- If no `.sln` found, treat every discovered `.csproj` as a standalone project.
- Record absolute paths for all solution files.

### Step 2 — Discover Project Files
- For each `.sln`, parse the `Project(...)` entries to extract `.csproj` / `.fsproj` / `.vbproj` paths.
- Also scan for any project files NOT referenced by a solution (orphan projects).

### Step 3 — Read Project Metadata
For each project file in the **source**, extract:
- `<TargetFramework>` or `<TargetFrameworks>` (multi-targeting)
- `<OutputType>` (Exe / Library / WinExe)
- `<Nullable>` setting
- `<ImplicitUsings>` setting
- `<LangVersion>` if set
- All `<ProjectReference>` entries
- All `<PackageReference>` entries (name + version)
- Count of `.cs` / `.fs` / `.vb` source files

### Step 4 — Read `global.json`
- If present in source root, extract `sdk.version`.
- Flag if SDK version is incompatible with `targetVersion`.
- Record recommendation to update `global.json` in `migrated-output/`.

### Step 5 — Classify Project Types

| Detected Pattern | Project Type Assigned |
|---|---|
| `Microsoft.NET.Sdk.Web` + `Startup.cs` or `Program.cs` with `WebApplication` | `WebApi` |
| `Microsoft.NET.Sdk.Web` + Razor files | `BlazorServer` or `MvcWebApp` |
| `Microsoft.NET.Sdk` + `OutputType=Library` | `ClassLibrary` |
| `Microsoft.NET.Sdk.Worker` | `WorkerService` |
| `Microsoft.NET.Sdk` + `OutputType=Exe` | `ConsoleApp` |
| `Microsoft.NET.Test.Sdk` reference | `TestProject` |
| `Microsoft.NET.Sdk.BlazorWebAssembly` | `BlazorWasm` |
| `Microsoft.NET.Sdk.Grpc` | `GrpcService` |

### Step 6 — Classify Migration Readiness

| Status | Condition |
|---|---|
| `Ready` | Current TFM matches `sourceVersion`, no multi-targeting |
| `AlreadyMigrated` | Current TFM already equals `targetVersion` |
| `MultiTargeted` | Has multiple TFMs — flag for manual review |
| `UnknownTFM` | TFM not recognized — flag for manual review |
| `FrameworkOnly` | Targets `net4x` (full .NET Framework) — flag as high-complexity migration |

### Step 7 — Build Project Dependency Graph
- Map all `<ProjectReference>` links between projects.
- Detect circular references — flag as errors.
- Order projects by dependency depth (leaf projects first, then consumers).
- This order determines the sequence in which `code-refactoring-agent.md` processes files in `migrated-output/`.

### Step 8 — Write `solution-map.json`
- Write to `migrated-output/{repoName}/.migration/`.
- Print summary to developer:
  ```
  ✅ Codebase Analysis Complete
     Repo:               {repoName}
     Output folder:      migrated-output/{repoName}/
     Solutions found:    1
     Projects found:     8
     Ready to migrate:   7
     Already migrated:   0
     Needs review:       1 (multi-targeted)
     migrated-output/{repoName}/ initialized with full source copy.
     Other repos in migrated-output/: untouched ✅
     Proceeding to Dependency Mapping...
  ```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| Filesystem glob scan | Discover `.sln`, `.csproj`, `.cs` files in source |
| Filesystem copy | Initialize `migrated-output/` with full source copy |
| XML parser | Read `.csproj` project file structure |
| MSBuild SDK reference lookup | Classify SDK type |
| Dependency graph builder | Order projects for sequential migration |

---

## SKILLS USED

### Skill: Solution Structure Parser
- Parse `.sln` file text format to extract project GUIDs and paths.
- Handle both old-style (`Project("{FAE04EC0...}")`) and SDK-style entries.
- Edge case: nested solution folders — flatten to flat project list.

### Skill: TFM Normalizer
- Normalize version strings: `netcoreapp3.1` → `net3.1`, `net6.0` → `net6.0`.
- Map human-readable input (`".NET 8"`, `"dotnet8"`) to canonical token (`net8.0`).
- Support multi-TFM strings: `net6.0;net8.0` → array `["net6.0", "net8.0"]`.

### Skill: Project Dependency Sorter
- Build adjacency list from `<ProjectReference>` entries.
- Topological sort using Kahn's algorithm.
- On circular dependency: halt and report cycle path to developer.

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Migration Orchestrator | Receives `sourceVersion` / `targetVersion`; returns `solution-map.json` |
| Dependency Mapping Agent | Passes full project list and package references (reads source, outputs to `migrated-output/.migration/`) |
| Code Refactoring Agent | Passes ordered project list — agent modifies copies in `migrated-output/` |
| Build & Compilation Agent | Passes list of `.csproj` files to build from `migrated-output/` |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| No `.csproj` found in source | Halt pipeline, report: "No .NET project files found. Verify source project path." |
| Circular project reference | Halt pipeline, report the cycle, ask developer to resolve |
| `sourceVersion` mismatch (project TFM ≠ declared sourceVersion) | Log warning, continue — include mismatch in `solution-map.json` |
| Unreadable `.csproj` (malformed XML) | Skip project, flag in output, continue with remaining projects |
| Cannot create `migrated-output/{repoName}/` (permissions) | Halt pipeline, report: "Cannot create migrated-output/{repoName}/. Check folder permissions." |

---

## EDGE CASES

- **Multi-targeted projects** (`<TargetFrameworks>net6.0;net8.0</TargetFrameworks>`): Record both TFMs, flag as `MultiTargeted`, do not auto-migrate — include in warnings.
- **`Directory.Build.props`**: Read from source and apply inherited properties before reading individual `.csproj` values. Copy to `migrated-output/` as-is for refactoring agent to update.
- **SDK-style vs non-SDK `.csproj`**: Detect non-SDK format (contains `<Import Project="$(MSBuildToolsPath)\..."`), classify as `LegacyFormat` — flag for `code-refactoring-agent.md` to convert in `migrated-output/`.
- **Solution filters (`.slnf`)**: Treat as a subset solution — only scan included projects.

---

*Agent Version: 2.1.0 | Read-only on source | Writes to migrated-output/.migration/ | Pipeline Step: 1 of 7*