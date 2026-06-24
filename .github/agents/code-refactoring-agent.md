# Code Refactoring Agent

> **Called by:** `dotnet-migration-orchestrator-agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 4.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load all three upstream reports from `migrated-output/{repoName}/.migration/` before touching any file.
- ALL edits happen ONLY inside `migrated-output/{repoName}/` — never touch the original source files.
- Process projects in the dependency-sorted order from `solution-map.json` (leaf projects first).
- Apply ALL auto-fixable issues from `compatibility-report.json` to the copies in `migrated-output/{repoName}/`.
- Insert `// TODO [MIGRATION]:` comments for every non-auto-fixable issue in the `migrated-output/{repoName}/` copies.
- After all edits, write `refactoring-summary.json` to `migrated-output/{repoName}/.migration/`.
- Validate that every modified file in `migrated-output/{repoName}/` is syntactically valid C# before moving to the next file.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   migrated-output/{repoName}/ (the unmodified copies placed there by codebase-analysis-agent)
             AND original source project (for reference only)
WRITE to:    migrated-output/{repoName}/ ONLY

Original source files are NEVER touched.
No backup is needed — migrated-output/{repoName}/ IS the output, not a replacement of the original.
If something goes wrong, rollback-agent simply deletes migrated-output/{repoName}/.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | Code Refactoring Agent |
| Role | Apply all code transformations, `<TargetFramework>` updates, and package version changes to files in `migrated-output/{repoName}/` |
| Pipeline Position | Step 4 of 7 |
| Mode | Read + Write — modifies files in `migrated-output/{repoName}/` only |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/{repoName}/.migration/solution-map.json`, `migrated-output/{repoName}/.migration/dependency-report.json`, `migrated-output/{repoName}/.migration/compatibility-report.json`, files in `migrated-output/{repoName}/` |
| Writes | Modified `.cs` and `.csproj` files inside `migrated-output/{repoName}/`, `migrated-output/{repoName}/.migration/refactoring-summary.json` |

---

## RESPONSIBILITY

Execute every code transformation required to migrate from `sourceVersion` to `targetVersion`. All work is done on the copies of files already sitting in `migrated-output/{repoName}/`. This includes updating project files (TFM, SDK, package versions), rewriting C# source code for API compatibility, migrating hosting models, and inserting TODO markers where manual intervention is needed.

The original source project is never touched. If the migration fails, `rollback-agent.md` simply deletes `migrated-output/{repoName}/` and the developer is back to square one with no damage done.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `migrated-output/{repoName}/.migration/solution-map.json` | Step 1 agent | ✅ |
| `migrated-output/{repoName}/.migration/dependency-report.json` | Step 2 agent | ✅ |
| `migrated-output/{repoName}/.migration/compatibility-report.json` | Step 3 agent | ✅ |
| All `.csproj` and `.cs` files inside `migrated-output/{repoName}/` | Filesystem | ✅ |

---

## OUTPUTS

| Output | Location |
|---|---|
| `refactoring-summary.json` | `migrated-output/{repoName}/.migration/` |
| Modified `.csproj` files | `migrated-output/{repoName}/src/.../` (in-place within migrated-output) |
| Modified `.cs` files | `migrated-output/{repoName}/src/.../` (in-place within migrated-output) |
| `global.json` (if updated) | `migrated-output/{repoName}/global.json` |

**`refactoring-summary.json` schema:**
```json
{
  "totalFilesModified": 23,
  "totalChangesApplied": 61,
  "todoMarkersInserted": 4,
  "allChangesInOutputDir": true,
  "outputDir": "migrated-output/eShopOnWeb/",
  "projectsUpdated": [
    {
      "sourceProject": "src/Web/Web.csproj",
      "outputProject": "migrated-output/eShopOnWeb/src/Web/Web.csproj",
      "changes": ["TFM: net6.0 → net8.0", "Updated 3 packages", "Removed NETStandard.Library"]
    }
  ],
  "sourceChanges": [
    {
      "sourceFile": "src/Web/Program.cs",
      "outputFile": "migrated-output/eShopOnWeb/src/Web/Program.cs",
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
- Confirm `migrated-output/{repoName}/` exists and contains a full copy of the source project (placed there by `codebase-analysis-agent.md`).
- Confirm `migrated-output/{repoName}/.migration/` contains all three upstream JSON files.
- If `migrated-output/{repoName}/` is missing or empty — halt and tell the orchestrator to re-run `codebase-analysis-agent.md`.
- No backup needed — the original source is the backup.

### Step 2 — Update `.csproj` Files in `migrated-output/{repoName}/`
For each project in dependency-sorted order, edit the file at its `outputProjectFile` path:

**2a. Update `<TargetFramework>`**
```xml
<!-- Before (in migrated-output/{repoName}/src/Web/Web.csproj) -->
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
Packages with `status: "NowInbox"` — remove their `<PackageReference>` entirely from the `migrated-output/{repoName}/` copy.

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

**2g. `FrameworkReference` and 2.x metapackage decomposition (high-frequency build breaker)**
- If the project has `<PackageReference Include="Microsoft.AspNetCore.App" />` (the versionless 2.x metapackage): **remove it**. For a Web SDK project it is implicit; for a `Microsoft.NET.Sdk` project (e.g. a test project using `WebApplicationFactory`, or a class library using ASP.NET types) replace it with `<FrameworkReference Include="Microsoft.AspNetCore.App" />`.
- If `dependency-report.json` marks a project `requiresFrameworkReference`, add `<FrameworkReference Include="Microsoft.AspNetCore.App" />`.
- After removing the metapackage, **re-add as explicit `<PackageReference>`** anything it used to bundle that the code still calls, e.g.:
  - `AddDefaultUI` / `AddDefaultIdentity` → `Microsoft.AspNetCore.Identity.UI`
  - `IdentityDbContext` / `AddEntityFrameworkStores` → `Microsoft.AspNetCore.Identity.EntityFrameworkCore`
  - `UseMigrationsEndPoint` → `Microsoft.AspNetCore.Diagnostics.EntityFrameworkCore`
  - `UseInMemoryDatabase` → `Microsoft.EntityFrameworkCore.InMemory`
  - `JsonConvert` (Newtonsoft) used directly → add `Newtonsoft.Json` (don't rely on it arriving transitively)
- `FrameworkReference Microsoft.AspNetCore.App` does **not** expose `Identity.UI` or `Identity.EntityFrameworkCore` — those remain explicit packages.

**2h. Hosting model — respect `modernizeHosting` (default false)**
- Default (`false`): **retain** the Generic Host + `Startup` model. `WebHost.CreateDefaultBuilder().UseStartup<Startup>()` still compiles and runs on net8, and the `Startup` environment-convention methods plus `WebApplicationFactory<Startup>` test fixtures keep working — no churn. Only fix the breaking APIs *inside* `Startup`/`Program` (see compatibility rules FD003–FD009).
- `modernizeHosting: true`: consolidate `Startup` into minimal-hosting `Program.cs`, delete `Startup.cs`, expose `public partial class Program {}`, and update every `WebApplicationFactory<Startup>` to `<Program>`.

### Step 3 — Update `global.json` in `migrated-output/{repoName}/`
If `migrated-output/{repoName}/global.json` exists and its `sdk.version` is below the minimum SDK for `targetVersion`:

| Target Version | Minimum SDK |
|---|---|
| net6.0 | 6.0.100 |
| net7.0 | 7.0.100 |
| net8.0 | 8.0.100 |
| net9.0 | 9.0.100 |

Update `sdk.version` in `migrated-output/{repoName}/global.json`. Original `global.json` untouched.

### Step 4 — Apply Source Code Transformations in `migrated-output/{repoName}/`
Process every issue in `compatibility-report.json` where `autoFixable: true`.
Use the `outputFile` path from each issue to locate the correct file in `migrated-output/{repoName}/`.

#### Transformation Rules

**Rule FW008 / N78001 — BinaryFormatter removal**
```csharp
// In migrated-output/{repoName}/src/.../SomeService.cs
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
// Before (in migrated-output/{repoName}/src/Web/Program.cs)
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
- `Startup.cs` exists in `migrated-output/{repoName}/`
- `migration.config.json` has `"migrateStartup": true` OR user confirmed in prompt

Work entirely on `migrated-output/{repoName}/src/.../Startup.cs` and `migrated-output/{repoName}/src/.../Program.cs`.
Original `Startup.cs` in source is never touched.

**Pattern applied to `migrated-output/{repoName}/` copies:**
```csharp
// migrated-output/{repoName}/src/Web/Program.cs (minimal hosting)
var builder = WebApplication.CreateBuilder(args);
// [ConfigureServices content moved here]
builder.Services.AddControllers();

var app = builder.Build();
// [Configure content moved here]
app.UseRouting();
app.MapControllers();
app.Run();
```
- Remove `migrated-output/{repoName}/src/.../Startup.cs` (the copy only — original untouched).

### Step 6 — Insert TODO Markers for Non-Auto-Fixable Issues
For every issue in `compatibility-report.json` where `autoFixable: false`:
Use `outputFile` to locate the file in `migrated-output/{repoName}/` and insert above the flagged line:
```csharp
// TODO [MIGRATION {ruleId}]: {description}
// Replacement: {replacement}
// See: https://learn.microsoft.com/dotnet/core/compatibility
```

### Step 7 — Validate Modified Files in `migrated-output/{repoName}/`
For each modified `.cs` file in `migrated-output/{repoName}/`:
- Parse with Roslyn `CSharpSyntaxTree.ParseText()`.
- Check `SyntaxTree.GetDiagnostics()` for errors.
- If syntax error introduced by transformation → restore that file from the original source (copy clean original back into `migrated-output/{repoName}/`), flag in report.

### Step 8 — Write `refactoring-summary.json`
- Write to `migrated-output/{repoName}/.migration/`.
- Print summary to developer:
  ```
  ✅ Code Refactoring Complete
     All changes written to:  migrated-output/{repoName}/
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
| Roslyn (`Microsoft.CodeAnalysis.CSharp`) | AST parsing, syntax validation, targeted token replacement on `migrated-output/{repoName}/` files |
| MSBuild XML editor | Safe `.csproj` editing within `migrated-output/{repoName}/` with namespace preservation |
| Regex replacer | Simple symbol swaps not requiring AST context |
| File system copy | Restore individual files from source if syntax validation fails |

---

## SKILLS USED

### Skill: Automated Code Rewriting Rules Engine
**Logic:**
1. Accept rule list from `compatibility-report.json` (autoFixable only).
2. For each rule, use `outputFile` to locate the file in `migrated-output/{repoName}/`.
3. Apply the corresponding transformation pattern.
4. Use Roslyn `SyntaxRewriter` for structural changes.
5. Use string replacement for simple `using` directive swaps.
6. Re-parse after each transformation to catch cascading changes.
**Edge cases:**
- Same symbol used in multiple files → apply to all `outputFile` paths.
- Transformation introduces a new `using` → add to top of file's using block in `migrated-output/{repoName}/` copy.
- File is auto-generated (`// <auto-generated>`) → skip transformation, flag in report.

### Skill: MSBuild Project Migration Handler
**Logic:**
1. Load `.csproj` from `migrated-output/{repoName}/` as XML with namespace-aware parser.
2. Locate `<TargetFramework>` node — update text content.
3. For each `<PackageReference>`, match by `Include` attribute to `dependency-report.json`.
4. Update `Version` attribute or remove node per report instruction.
5. Serialize back preserving whitespace and XML declaration.
**Edge cases:**
- `<TargetFrameworks>` (plural) multi-targeting — update only the matching TFM, leave others.
- Conditioned `<PackageReference Condition="...">` — flag for manual review, do not auto-update.

### Skill: File Restore from Source
**Logic:**
1. If a file in `migrated-output/{repoName}/` fails syntax validation after transformation.
2. Copy the original file from the source project back into `migrated-output/{repoName}/` at the same relative path.
3. Flag the file in `refactoring-summary.json` as `"restoredFromSource": true`.
4. Insert a top-level TODO comment explaining the file was not auto-migrated.

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| API Compatibility Agent | Reads `compatibility-report.json`; uses `outputFile` paths to target `migrated-output/{repoName}/` files |
| Dependency Mapping Agent | Reads `dependency-report.json`; uses `outputProjectPaths` to update `.csproj` files in `migrated-output/{repoName}/` |
| Build & Compilation Agent | Runs build against `migrated-output/{repoName}/` after this agent completes |
| Rollback Agent | If build fails, rollback-agent deletes `migrated-output/{repoName}/` — no complex restore needed |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| `migrated-output/{repoName}/` missing or empty | Halt — ask orchestrator to re-run codebase-analysis-agent |
| Syntax error in modified file in `migrated-output/{repoName}/` | Copy clean original back from source into `migrated-output/{repoName}/`, insert TODO, flag in report, continue |
| `.csproj` in `migrated-output/{repoName}/` becomes malformed XML | Copy clean original `.csproj` back from source into `migrated-output/{repoName}/`, flag, continue |
| Non-auto-fixable issue with no replacement | Insert TODO comment in `migrated-output/{repoName}/` copy only — never guess at a replacement |
| Startup.cs migration fails midway | Copy original `Program.cs` and `Startup.cs` back from source into `migrated-output/{repoName}/`, insert TODO |

---

## EXACT-FIX SNIPPETS (v3.1 — apply verbatim, do not re-derive)

**FD003 — `AddMvc().AddRazorPagesOptions(...).SetCompatibilityVersion(...)` → split registration**
```csharp
// After
services.AddControllersWithViews(options => { /* conventions kept as-is */ });
services.AddRazorPages(options => { options.Conventions.AuthorizePage("/Path"); });
// drop SetCompatibilityVersion and RazorPagesOptions.AllowAreas entirely
```

**FD005 — `app.UseMvc(routes => ...)` → endpoint routing (order is load-bearing)**
```csharp
app.UseRouting();
app.UseAuthentication();
app.UseAuthorization();
app.UseEndpoints(endpoints =>
{
    endpoints.MapControllerRoute("default", "{controller=Home}/{action=Index}/{id?}");
    endpoints.MapRazorPages();
});
```

**FD006 / FD007 / FD009 / SWASH01 — symbol swaps**
`IHostingEnvironment`→`IWebHostEnvironment`; `AddDefaultUI(UIFramework.Bootstrap4)`→`AddDefaultUI()`; `app.UseDatabaseErrorPage()`→`app.UseMigrationsEndPoint()`; `using Swashbuckle.AspNetCore.Swagger; new Info{...}`→`using Microsoft.OpenApi.Models; new OpenApiInfo{...}`.

**EFC001 — provider-prefix dropped**: `ForSqlServerUseSequenceHiLo("x")` → `UseHiLo("x")` (same for other `ForSqlServer*`).

**EFC002 — type configured as BOTH owned and standalone entity** (compiles, throws at model build):
```csharp
// remove: builder.Entity<Address>(ConfigureAddress);
// move its property config INTO the owner's OwnsOne lambda:
builder.OwnsOne(o => o.ShipToAddress, a => { a.Property(x => x.ZipCode).HasMaxLength(18).IsRequired(); /* ... */ });
```

**FD008 — `GroupCollection` LINQ ambiguity (CS1061)**: `match.Groups.LastOrDefault()` → `match.Groups.Values.LastOrDefault()`.

**EFMIG01 — index name in migration snapshots**: `HasIndex(...).HasName("X")` → `.HasDatabaseName("X")` (ONLY for indexes).

**Inbox / metapackage cleanup**: remove versionless `Microsoft.AspNetCore.App` (implicit in Web SDK; `<FrameworkReference>` for non-web), `Microsoft.AspNetCore.Razor.Design`, `System.Security.Claims`, `dotnet-xunit`. Re-add as explicit packages anything the metapackage used to bundle that the code still calls (`Identity.UI` for `AddDefaultUI`, `Diagnostics.EntityFrameworkCore` for `UseMigrationsEndPoint`, `EntityFrameworkCore.InMemory` for `UseInMemoryDatabase`).

## BATCH-FIX BY ERROR CLASS (v3.1)

When fixing — whether from the pre-flight sweep or build-loop errors — group by `(rule/code, symbol)` and fix **all sites of one class in a single search-replace pass** before rebuilding. One fix typically clears many sites (all `ForSqlServer*`, all `.HasName`, all `GroupCollection` LINQ). Never fix one site per build iteration. Re-run a syntax check after each class, not after each site.

---

*Agent Version: 3.1.0 | Read + Write inside migrated-output/{repoName}/ only | Pipeline Step: 4 of 7*