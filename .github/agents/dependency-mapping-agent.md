# Dependency Mapping Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 2.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load `solution-map.json` from `migrated-output/.migration/` before doing anything else.
- Read package references from the **original source** `.csproj` files — do not read from `migrated-output/` yet (those are unmodified copies at this stage).
- Query NuGet API for every package found — do not rely on cached or training-data package versions.
- Resolve compatible versions against `targetVersion` TFM automatically.
- Write `dependency-report.json` to `migrated-output/.migration/` on completion.
- Never modify any `.csproj` file — resolution only, no edits. Edits happen in `code-refactoring-agent.md`.
- If NuGet API is unreachable, fall back to the offline compatibility matrix embedded in the Skills section below.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   original source project .csproj files
WRITE to:    migrated-output/.migration/dependency-report.json

Never modify any file in the original source project.
Never modify any .csproj file — this agent produces a report only.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Dependency Mapping Agent |
| Role | NuGet dependency graph extraction and version compatibility resolution |
| Pipeline Position | Step 2 of 7 |
| Mode | Read + network (NuGet API queries) — no file modifications |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/.migration/solution-map.json`, original source `.csproj` files |
| Writes | `migrated-output/.migration/dependency-report.json` |

---

## RESPONSIBILITY

Build a complete NuGet dependency graph for the entire solution. For every `<PackageReference>` across all projects, determine whether the current version is compatible with `targetVersion`. Produce a resolution plan: which packages to upgrade, which to replace with alternatives, and which have no compatible version.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/.migration/solution-map.json` | Previous agent output | ✅ |
| `targetVersion` TFM token | Orchestrator context | ✅ |
| NuGet v3 API | `https://api.nuget.org/v3/index.json` | Optional (falls back to matrix) |
| Each `.csproj` file | Original source filesystem | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/.migration/dependency-report.json`

```json
{
  "targetVersion": "net8.0",
  "resolvedAt": "2026-01-15T10:31:00Z",
  "packages": [
    {
      "name": "Microsoft.EntityFrameworkCore",
      "currentVersion": "6.0.10",
      "resolvedVersion": "8.0.0",
      "status": "Upgradeable",
      "usedInProjects": ["src/Web/Web.csproj", "src/Infrastructure/Infrastructure.csproj"],
      "outputProjectPaths": ["migrated-output/src/Web/Web.csproj", "migrated-output/src/Infrastructure/Infrastructure.csproj"],
      "breaking": false,
      "notes": ""
    },
    {
      "name": "Newtonsoft.Json",
      "currentVersion": "13.0.1",
      "resolvedVersion": "13.0.3",
      "status": "Upgradeable",
      "usedInProjects": ["src/Web/Web.csproj"],
      "outputProjectPaths": ["migrated-output/src/Web/Web.csproj"],
      "breaking": false,
      "notes": "Consider migrating to System.Text.Json for native .NET 8 support"
    },
    {
      "name": "SomeOldPackage",
      "currentVersion": "1.0.0",
      "resolvedVersion": null,
      "status": "NoCompatibleVersion",
      "usedInProjects": ["src/Infrastructure/Infrastructure.csproj"],
      "outputProjectPaths": ["migrated-output/src/Infrastructure/Infrastructure.csproj"],
      "breaking": true,
      "notes": "No version compatible with net8.0. Manual replacement required."
    }
  ],
  "summary": {
    "total": 24,
    "upgradeable": 21,
    "alreadyCompatible": 1,
    "noCompatibleVersion": 1,
    "replacementRecommended": 1
  }
}
```

Note: `outputProjectPaths` tells `code-refactoring-agent.md` exactly which files in `migrated-output/` to edit.

---

## EXECUTION STEPS

### Step 1 — Load `solution-map.json`
- Read from `migrated-output/.migration/solution-map.json`.
- Read all projects and their `PackageReference` lists from the **original source** `.csproj` files.
- Deduplicate packages across projects — track which projects use each package.
- Build master package list: `{ name, currentVersion, usedInProjects[], outputProjectPaths[] }`.

### Step 2 — Categorize Package Types
For each package, determine its category to apply the correct resolution strategy:

| Category | Examples | Strategy |
|---|---|---|
| Microsoft.AspNetCore.* | AspNetCore.Mvc, Authentication | Must match target major version exactly |
| Microsoft.EntityFrameworkCore.* | EFCore, EFCore.SqlServer | Must match target major version |
| Microsoft.Extensions.* | DI, Logging, Configuration | Must match target major version |
| Microsoft.NET.Test.Sdk | Test SDK | Upgrade to latest compatible |
| xUnit / NUnit / MSTest | Test frameworks | Upgrade to latest |
| Third-party (Newtonsoft, AutoMapper, etc.) | General NuGet | Find latest version supporting targetTFM |
| System.* packages | System.Text.Json, etc. | Check if now inbox (built into runtime) |

### Step 3 — Check Inbox Packages (Built into Target Runtime)
Some packages that were NuGet dependencies in older versions are now **built into the .NET runtime** at `targetVersion`. These should be **removed** from `migrated-output/` `.csproj` files, not upgraded.

**Known inbox packages by version:**

| Package | Became Inbox At |
|---|---|
| `System.Text.Json` | .NET 5+ |
| `System.Threading.Channels` | .NET 5+ |
| `Microsoft.Extensions.Hosting` | .NET 6+ |
| `System.Diagnostics.DiagnosticSource` | .NET 6+ |
| `System.Runtime.CompilerServices.Unsafe` | .NET 6+ |

Flag these as `status: "NowInbox"` — `code-refactoring-agent.md` will remove the `<PackageReference>` from files in `migrated-output/`.

### Step 4 — Resolve Compatible Versions via NuGet API

For each package NOT inbox:
```
GET https://api.nuget.org/v3-flatcontainer/{package-id-lowercase}/index.json
```
- Get list of all available versions.
- Filter to versions that support `targetVersion` TFM.
- Select the highest stable version (no pre-release unless `allowPrerelease: true` in config).
- If no compatible version exists → status: `NoCompatibleVersion`.

### Step 5 — Apply Known Replacement Mappings
Some deprecated packages have standard modern replacements:

| Deprecated Package | Replacement | Target Versions |
|---|---|---|
| `Microsoft.AspNetCore.All` | `Microsoft.AspNetCore.App` (framework reference) | .NET 6+ |
| `System.Web.Http.*` | `Microsoft.AspNetCore.Mvc.*` | All Core versions |
| `Microsoft.AspNet.WebApi.*` | `Microsoft.AspNetCore.Mvc` | All Core versions |
| `Newtonsoft.Json` (if replacing) | `System.Text.Json` | .NET 5+ |
| `Microsoft.EntityFrameworkCore.Tools` | Keep, upgrade to target major | n/a |
| `NETStandard.Library` | Remove (no longer needed for net5.0+) | .NET 5+ |
| `Microsoft.NETCore.App` | Remove (implicit SDK reference) | .NET 5+ |

### Step 6 — Detect Transitive Dependency Conflicts
- For each resolved upgrade, check if two projects require conflicting versions of the same transitive dependency.
- Flag conflicts as `status: "VersionConflict"` with both required versions.
- Recommend a common version that satisfies both where possible.

### Step 7 — Write `dependency-report.json`
- Write to `migrated-output/.migration/`.
- Print summary to developer:
  ```
  ✅ Dependency Mapping Complete
     Total packages:           24
     Upgradeable:              21
     Now inbox (remove):        1
     No compatible version:     1 ⚠️
     Output: migrated-output/.migration/dependency-report.json
     Proceeding to API Compatibility Check...
  ```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| NuGet v3 REST API | Live package version resolution |
| XML parser | Read `<PackageReference>` from source `.csproj` files |
| Semver comparator | Compare and select version ranges |
| Offline compatibility matrix (skill) | Fallback when NuGet API unreachable |

---

## SKILLS USED

### Skill: NuGet Version Resolution Engine
**Logic:**
1. Fetch version list from `api.nuget.org/v3-flatcontainer/{id}/index.json`.
2. Parse semver for each version.
3. Filter: discard pre-release unless config allows.
4. For each candidate version, fetch `{id}/{version}/{id}.nuspec`.
5. Parse `<dependencies>` inside `.nuspec` for `<group targetFramework="{tfm}">`.
6. Check if `targetVersion` TFM is listed or if a compatible `netstandard` group exists.
7. Return highest passing version.
**Edge cases:**
- Package targets `netstandard2.0` or `netstandard2.1` — compatible with all .NET 5+ targets.
- Package has no TFM groups in `.nuspec` — treat as compatible (old-style packages).
- Package is unlisted on NuGet — flag as `status: "Unlisted"`.

### Skill: Dependency Graph Extractor
**Logic:**
1. Build adjacency list: `project → [direct packages]`.
2. Expand to transitive graph by resolving each package's own dependencies.
3. Detect version conflicts at transitive level.
4. Output: flat deduplicated list with source projects and output project paths annotated.

### Skill: Offline Compatibility Matrix
Used when NuGet API is unreachable. Known-good version mappings:

| Package | net6.0 | net7.0 | net8.0 | net9.0 |
|---|---|---|---|---|
| Microsoft.EntityFrameworkCore | 6.x | 7.x | 8.x | 9.x |
| Microsoft.AspNetCore.Authentication.JwtBearer | 6.x | 7.x | 8.x | 9.x |
| AutoMapper | 12.x | 12.x | 12.x | 13.x |
| FluentValidation | 11.x | 11.x | 11.x | 11.x |
| Serilog | 3.x | 3.x | 3.x | 4.x |
| MediatR | 12.x | 12.x | 12.x | 12.x |
| Polly | 8.x | 8.x | 8.x | 8.x |
| Swashbuckle.AspNetCore | 6.x | 6.x | 6.x | 6.x |

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Codebase Analysis Agent | Reads `solution-map.json` from `migrated-output/.migration/` for project + package list |
| API Compatibility Agent | Reads `dependency-report.json` from `migrated-output/.migration/` |
| Code Refactoring Agent | Reads `dependency-report.json` and uses `outputProjectPaths` to apply `<PackageReference>` version updates in `migrated-output/` |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| NuGet API unreachable | Fall back to offline matrix; flag in report as "Resolved offline — verify before build" |
| Package has no compatible version | Set `status: "NoCompatibleVersion"`, continue; `code-refactoring-agent.md` will insert TODO comment in `migrated-output/` copy |
| Transitive conflict with no resolution | Flag both versions, recommend lowest common version, continue |
| Malformed `.nuspec` | Skip transitive analysis for that package, log warning |

---

*Agent Version: 2.1.0 | Read source + NuGet API | Writes to migrated-output/.migration/ | Pipeline Step: 2 of 7*