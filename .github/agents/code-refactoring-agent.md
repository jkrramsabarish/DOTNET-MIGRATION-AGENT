# Code Refactoring Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 4.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load all three upstream reports from `migrated-output/.migration/` before touching any file.
- ALL edits happen ONLY inside `migrated-output/` — never touch the original source files.
- Process projects in the dependency-sorted order from `solution-map.json` (leaf projects first).
- Apply ALL auto-fixable issues from `compatibility-report.json` to the copies in `migrated-output/`.
- Insert `// TODO [MIGRATION]:` comments for every non-auto-fixable issue in the `migrated-output/` copies.
- After all edits, write `refactoring-summary.json` to `migrated-output/.migration/`.
- Validate that every modified file in `migrated-output/` is syntactically valid C# before moving to the next file.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   migrated-output/ (the unmodified copies placed there by codebase-analysis-agent)
             AND original source project (for reference only)
WRITE to:    migrated-output/ ONLY

Original source files are NEVER touched.
No backup is needed — migrated-output/ IS the output, not a replacement of the original.
If something goes wrong, rollback-agent simply deletes migrated-output/.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Code Refactoring Agent |
| Role | Apply all code transformations, `<TargetFramework>` updates, and package version changes to files in `migrated-output/` |
| Pipeline Position | Step 4 of 7 |
| Mode | Read + Write — modifies files in `migrated-output/` only |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/.migration/solution-map.json`, `migrated-output/.migration/dependency-report.json`, `migrated-output/.migration/compatibility-report.json`, files in `migrated-output/` |
| Writes | Modified `.cs` and `.csproj` files inside `migrated-output/`, `migrated-output/.migration/refactoring-summary.json` |

---

## RESPONSIBILITY

Execute every code transformation required to migrate from `sourceVersion` to `targetVersion`. All work is done on the copies of files already sitting in `migrated-output/`. This includes updating project files (TFM, SDK, package versions), rewriting C# source code for API compatibility, migrating hosting models, and inserting TODO markers where manual intervention is needed.

The original source project is never touched. If the migration fails, `rollback-agent.md` simply deletes `migrated-output/` and the developer is back to square one with no damage done.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/.migration/solution-map.json` | Step 1 agent | ✅ |
| `migrated-output/.migration/dependency-report.json` | Step 2 agent | ✅ |
| `migrated-output/.migration/compatibility-report.json` | Step 3 agent | ✅ |
| All `.csproj` and `.cs` files inside `migrated-output/` | Filesystem | ✅ |

---

## OUTPUTS

| Output | Location |
|---|---|
| `refactoring-summary.json` | `migrated-output/.migration/` |
| Modified `.csproj` files | `migrated-output/src/.../` (in-place within migrated-output) |
| Modified `.cs` files | `migrated-output/src/.../` (in-place within migrated-output) |
| `global.json` (if updated) | `migrated-output/global.json` |

**`refactoring-summary.json` schema:**
```json
{
  "totalFilesModified": 23,
  "totalChangesApplied": 61,
  "todoMarkersInserted": 4,
  "allChangesInOutputDir": true,
  "outputDir": "migrated-output/",
  "projectsUpdated": [
    {
      "sourceProject": "src/Web/Web.csproj",
      "outputProject": "migrated-output/src/Web/Web.csproj",
      "changes": ["TFM: net6.0 → net8.0", "Updated 3 packages", "Removed NETStandard.Library"]
    }
  ],
  "sourceChanges": [
    {
      "sourceFile": "src/Web/Program.cs",
      "outputFile": "migrated-output/src/Web/Program.cs",
      "rulesApplied": ["N78001", "N78005"],
      "linesModified": 4,
      "todoMarkersInserted": 0
    }
  ]
}
```

---

## EXECUTION STEPS

### Step 1 — Verify Output Directory Is Ready
- Confirm `migrated-output/` exists and contains a full copy of the source project (placed there by `codebase-analysis-agent.md`).
- Confirm `migrated-output/.migration/` contains all three upstream JSON files.
- If `migrated-output/` is missing or empty — halt and tell the orchestrator to re-run `codebase-analysis-agent.md`.
- No backup needed — the original source is the backup.

### Step 2 — Update `.csproj` Files in `migrated-output/`
For each project in dependency-sorted order, edit the file at its `outputProjectFile` path:

**2a. Update `<TargetFramework>`**
```xml
<!-- Before (in migrated-output/src/Web/Web.csproj) -->
<TargetFramework>net6.0</TargetFramework>

<!-- After -->
<TargetFramework>net8.0</TargetFramework>
```

**2b. Update `<PackageReference>` versions**
Using `dependency-report.json` resolutions:
```xml
<!-- Before -->
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="6.0.10" />

<!-- After -->
<PackageReference Include="Microsoft.EntityFrameworkCore" Version="8.0.0" />
```

**2c. Remove inbox packages**
Packages with `status: "NowInbox"` — remove their `<PackageReference>` entirely from the `migrated-output/` copy.

**2d. Remove legacy package references**
- `NETStandard.Library` → remove
- `Microsoft.NETCore.App` → remove
- `Microsoft.AspNetCore.All` → replace with `<FrameworkReference Include="Microsoft.AspNetCore.App" />`

**2e. Add SDK implicit usings if missing (net6.0+)**
```xml
<ImplicitUsings>enable</ImplicitUsings>
<Nullable>enable</Nullable>
```
Only add `<Nullable>enable</Nullable>` if target is net6.0+ AND project does not already have it. Do NOT force this on test projects — add a warning instead.

**2f. Update `<LangVersion>` if explicitly pinned**
If `<LangVersion>` is set below the default for `targetVersion`, remove the explicit override:

| Target | Default C# Version |
|---|---|
| net6.0 | C# 10 |
| net7.0 | C# 11 |
| net8.0 | C# 12 |
| net9.0 | C# 13 |

### Step 3 — Update `global.json` in `migrated-output/`
If `migrated-output/global.json` exists and its `sdk.version` is below the minimum SDK for `targetVersion`:

| Target Version | Minimum SDK |
|---|---|
| net6.0 | 6.0.100 |
| net7.0 | 7.0.100 |
| net8.0 | 8.0.100 |
| net9.0 | 9.0.100 |

Update `sdk.version` in `migrated-output/global.json`. Original `global.json` untouched.

### Step 4 — Apply Source Code Transformations in `migrated-output/`
Process every issue in `compatibility-report.json` where `autoFixable: true`.
Use the `outputFile` path from each issue to locate the correct file in `migrated-output/`.

#### Transformation Rules

**Rule FW008 / N78001 — BinaryFormatter removal**
```csharp
// In migrated-output/src/.../SomeService.cs
// Before
var formatter = new BinaryFormatter();
formatter.Serialize(stream, obj);

// After (TODO inserted — no safe auto-replacement)
// TODO [MIGRATION FW008]: BinaryFormatter removed in .NET 8. Replace with System.Text.Json or Newtonsoft.Json serialization.
// var formatter = new BinaryFormatter();
// formatter.Serialize(stream, obj);
```

**Rule FW006 — Thread.Abort() removal**
```csharp
// Before
thread.Abort();

// After
thread.Interrupt(); // TODO [MIGRATION FW006]: Thread.Abort() removed. Review cancellation pattern — prefer CancellationToken.
```

**Rule FW004 — ConfigurationManager → IConfiguration**
```csharp
// Before
var value = ConfigurationManager.AppSettings["MyKey"];

// After
// TODO [MIGRATION FW004]: Replace ConfigurationManager with IConfiguration injected via DI. See https://docs.microsoft.com/aspnet/core/fundamentals/configuration
```

**Rule N56004 — Newtonsoft.Json as default serializer**
```csharp
// Before (in migrated-output/src/Web/Program.cs)
services.AddControllers().AddNewtonsoftJson();

// After — keep as-is if package is retained, OR if replacing:
// services.AddControllers(); // System.Text.Json is default in .NET 6+
```

**Rule N78005 — IResult.ExecuteAsync must return ValueTask**
```csharp
// Before
public Task ExecuteAsync(HttpContext httpContext)

// After
public ValueTask ExecuteAsync(HttpContext httpContext)
```

**Rule FW001 — System.Web.HttpContext**
```csharp
// Before
using System.Web;
...
HttpContext.Current.Request.QueryString["id"]

// After — TODO: requires architectural change
// TODO [MIGRATION FW001]: System.Web.HttpContext removed. Inject IHttpContextAccessor and use httpContextAccessor.HttpContext.Request.Query["id"]
```

### Step 5 — Migrate `Startup.cs` to Minimal Hosting (Optional)
Only apply if:
- `sourceVersion` ≤ `net5.0`
- `Startup.cs` exists in `migrated-output/`
- `migration.config.json` has `"migrateStartup": true` OR user confirmed in prompt

Work entirely on `migrated-output/src/.../Startup.cs` and `migrated-output/src/.../Program.cs`.
Original `Startup.cs` in source is never touched.

**Pattern applied to `migrated-output/` copies:**
```csharp
// migrated-output/src/Web/Program.cs (minimal hosting)
var builder = WebApplication.CreateBuilder(args);
// [ConfigureServices content moved here]
builder.Services.AddControllers();

var app = builder.Build();
// [Configure content moved here]
app.UseRouting();
app.MapControllers();
app.Run();
```
- Remove `migrated-output/src/.../Startup.cs` (the copy only — original untouched).

### Step 6 — Insert TODO Markers for Non-Auto-Fixable Issues
For every issue in `compatibility-report.json` where `autoFixable: false`:
Use `outputFile` to locate the file in `migrated-output/` and insert above the flagged line:
```csharp
// TODO [MIGRATION {ruleId}]: {description}
// Replacement: {replacement}
// See: https://learn.microsoft.com/dotnet/core/compatibility
```

### Step 7 — Validate Modified Files in `migrated-output/`
For each modified `.cs` file in `migrated-output/`:
- Parse with Roslyn `CSharpSyntaxTree.ParseText()`.
- Check `SyntaxTree.GetDiagnostics()` for errors.
- If syntax error introduced by transformation → restore that file from the original source (copy clean original back into `migrated-output/`), flag in report.

### Step 8 — Write `refactoring-summary.json`
- Write to `migrated-output/.migration/`.
- Print summary to developer:
  ```
  ✅ Code Refactoring Complete
     All changes written to:  migrated-output/
     Original source:         untouched ✅
     Projects updated:        8
     Source files modified:   23
     Changes applied:         61
     TODO markers inserted:    4
     Syntax errors found:      0
     Proceeding to Build & Compilation...
  ```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| Roslyn (`Microsoft.CodeAnalysis.CSharp`) | AST parsing, syntax validation, targeted token replacement on `migrated-output/` files |
| MSBuild XML editor | Safe `.csproj` editing within `migrated-output/` with namespace preservation |
| Regex replacer | Simple symbol swaps not requiring AST context |
| File system copy | Restore individual files from source if syntax validation fails |

---

## SKILLS USED

### Skill: Automated Code Rewriting Rules Engine
**Logic:**
1. Accept rule list from `compatibility-report.json` (autoFixable only).
2. For each rule, use `outputFile` to locate the file in `migrated-output/`.
3. Apply the corresponding transformation pattern.
4. Use Roslyn `SyntaxRewriter` for structural changes.
5. Use string replacement for simple `using` directive swaps.
6. Re-parse after each transformation to catch cascading changes.
**Edge cases:**
- Same symbol used in multiple files → apply to all `outputFile` paths.
- Transformation introduces a new `using` → add to top of file's using block in `migrated-output/` copy.
- File is auto-generated (`// <auto-generated>`) → skip transformation, flag in report.

### Skill: MSBuild Project Migration Handler
**Logic:**
1. Load `.csproj` from `migrated-output/` as XML with namespace-aware parser.
2. Locate `<TargetFramework>` node — update text content.
3. For each `<PackageReference>`, match by `Include` attribute to `dependency-report.json`.
4. Update `Version` attribute or remove node per report instruction.
5. Serialize back preserving whitespace and XML declaration.
**Edge cases:**
- `<TargetFrameworks>` (plural) multi-targeting — update only the matching TFM, leave others.
- Conditioned `<PackageReference Condition="...">` — flag for manual review, do not auto-update.

### Skill: File Restore from Source
**Logic:**
1. If a file in `migrated-output/` fails syntax validation after transformation.
2. Copy the original file from the source project back into `migrated-output/` at the same relative path.
3. Flag the file in `refactoring-summary.json` as `"restoredFromSource": true`.
4. Insert a top-level TODO comment explaining the file was not auto-migrated.

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| API Compatibility Agent | Reads `compatibility-report.json`; uses `outputFile` paths to target `migrated-output/` files |
| Dependency Mapping Agent | Reads `dependency-report.json`; uses `outputProjectPaths` to update `.csproj` files in `migrated-output/` |
| Build & Compilation Agent | Runs build against `migrated-output/` after this agent completes |
| Rollback Agent | If build fails, rollback-agent deletes `migrated-output/` — no complex restore needed |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| `migrated-output/` missing or empty | Halt — ask orchestrator to re-run codebase-analysis-agent |
| Syntax error in modified file in `migrated-output/` | Copy clean original back from source into `migrated-output/`, insert TODO, flag in report, continue |
| `.csproj` in `migrated-output/` becomes malformed XML | Copy clean original `.csproj` back from source into `migrated-output/`, flag, continue |
| Non-auto-fixable issue with no replacement | Insert TODO comment in `migrated-output/` copy only — never guess at a replacement |
| Startup.cs migration fails midway | Copy original `Program.cs` and `Startup.cs` back from source into `migrated-output/`, insert TODO |

---

*Agent Version: 2.1.0 | Read + Write inside migrated-output/ only | Pipeline Step: 4 of 7*