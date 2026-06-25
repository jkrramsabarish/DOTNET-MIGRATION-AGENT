# API Compatibility Agent

> **Called by:** `dotnet-migration-orchestrator-agent.agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 3.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load both `solution-map.json` and `dependency-report.json` from `migrated-output/{repoName}/.migration/` immediately on invocation.
- Scan ALL `.cs` files from the **original source project** in one pass — do not process project by project and stop.
- Apply the full breaking-changes matrix for the exact `sourceVersion → targetVersion` path, not a generic list.
- Write `compatibility-report.json` to `migrated-output/{repoName}/.migration/` on completion.
- Never modify any source file — this agent is READ-ONLY on both source and `migrated-output/{repoName}/`.
- For every API removal or behavioral change found, produce a concrete replacement recommendation or a `// TODO [MIGRATION]` marker instruction.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   original source project .cs files
WRITE to:    migrated-output/{repoName}/.migration/compatibility-report.json

Never modify any file in the original source project.
Never modify any file in migrated-output/{repoName}/ — that is code-refactoring-agent's job.
```

---

## AGENT IDENTITY

| Property | Value |
|---|---|
| Agent Name | API Compatibility Agent |
| Role | Detect breaking .NET API changes between sourceVersion and targetVersion across all source files |
| Pipeline Position | Step 3 of 7 |
| Mode | Read-only — no file modifications anywhere |
| Invoked By | Migration Orchestrator Agent |
| Reads | `migrated-output/{repoName}/.migration/solution-map.json`, `migrated-output/{repoName}/.migration/dependency-report.json`, all original `.cs` files |
| Writes | `migrated-output/{repoName}/.migration/compatibility-report.json` |

---

## RESPONSIBILITY

Scan every C# source file in the original project for usage of APIs, patterns, and runtime behaviors that changed, were removed, or require explicit opt-in between `sourceVersion` and `targetVersion`. Produce a complete compatibility report with file locations, line numbers, severity levels, and recommended replacements. The report's file paths include both source and `migrated-output/{repoName}/` paths so `code-refactoring-agent.agent.md` knows exactly which output files to edit.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `sourceVersion` | Orchestrator context | ✅ |
| `targetVersion` | Orchestrator context | ✅ |
| `migrated-output/{repoName}/.migration/solution-map.json` | Previous agent | ✅ |
| `migrated-output/{repoName}/.migration/dependency-report.json` | Previous agent | ✅ |
| All `.cs` files in original source | Source filesystem | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/{repoName}/.migration/compatibility-report.json`

```json
{
  "sourceVersion": "net6.0",
  "targetVersion": "net8.0",
  "scannedFiles": 134,
  "issues": [
    {
      "id": "BC001",
      "severity": "Breaking",
      "category": "APIRemoval",
      "sourceFile": "src/Web/Program.cs",
      "outputFile": "migrated-output/eShopOnWeb/src/Web/Program.cs",
      "line": 14,
      "symbol": "IWebHostBuilder",
      "description": "IWebHostBuilder is removed in .NET 8 minimal hosting model",
      "replacement": "Use WebApplication.CreateBuilder() instead",
      "autoFixable": true
    },
    {
      "id": "BC002",
      "severity": "Warning",
      "category": "BehaviorChange",
      "sourceFile": "src/Infrastructure/Services/DateService.cs",
      "outputFile": "migrated-output/eShopOnWeb/src/Infrastructure/Services/DateService.cs",
      "line": 88,
      "symbol": "DateTime.Now",
      "description": "No breaking change — best practice: prefer DateTimeOffset for new code",
      "replacement": "DateTimeOffset.Now",
      "autoFixable": false
    }
  ],
  "summary": {
    "breaking": 3,
    "warnings": 8,
    "informational": 5,
    "autoFixable": 3
  }
}
```

Note: every issue has both `sourceFile` (where it was found) and `outputFile` (where `code-refactoring-agent.agent.md` must apply the fix in `migrated-output/{repoName}/`).

---

## EXECUTION STEPS

### Step 1 — Build Breaking-Changes Scope
Determine the exact set of breaking-change rules to apply based on the version delta:

| Source → Target | Rules Set Applied |
|---|---|
| `netcoreapp2.x` → `net8.0` | Rules: **Framework Decomposition (FD001–FD009)** + 3.1→5, 5→6, 6→7, 7→8 |
| `netcoreapp3.1` → `net6.0` | Rules: 3.1→5, 5→6 |
| `net6.0` → `net8.0` | Rules: 6→7, 7→8 |
| `net6.0` → `net9.0` | Rules: 6→7, 7→8, 8→9 |
| `net4x` → any Core | Rules: Framework-to-Core full ruleset |

Always apply the **cumulative** rules across all intermediate versions, not just the final hop. **In every case also apply the Library/NuGet Package Breaking Changes and EF Core Behavior tables** (keyed off `dependency-report.json` major-version hops) — those, not the framework API rules, are where most build failures originate.

### Step 2 — Scan All Source Files
- Walk every `.cs` file listed in `solution-map.json` from the **original source**.
- Tokenize using a lightweight C# parser (Roslyn or regex pattern matching per rule).
- For each rule in the applicable rules set, check for matching symbol, namespace, or usage pattern.
- Record: source file path, output file path, line number, matched symbol, rule ID.

### Step 3 — Apply Breaking Changes Matrix

#### .NET Framework → .NET Core/5+ Breaking Changes (High Complexity)

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| FW001 | `System.Web.HttpContext` | Breaking | `Microsoft.AspNetCore.Http.HttpContext` |
| FW002 | `System.Web.HttpRequest` | Breaking | `Microsoft.AspNetCore.Http.HttpRequest` |
| FW003 | `System.Web.Mvc.*` | Breaking | `Microsoft.AspNetCore.Mvc.*` |
| FW004 | `ConfigurationManager.AppSettings` | Breaking | `IConfiguration` via DI |
| FW005 | `System.Web.HttpServerUtility` | Breaking | `IWebHostEnvironment` |
| FW006 | `Thread.Abort()` | Breaking | Removed — use `CancellationToken` |
| FW007 | `AppDomain.CreateDomain()` | Breaking | Removed — not supported on Core |
| FW008 | `BinaryFormatter` | Breaking (net7+) | Use `System.Text.Json` or `Newtonsoft.Json` |
| FW009 | `Regex` (default timeout) | Warning | Set explicit `Regex.Timeout` |
| FW010 | `WebClient` | Warning | `HttpClient` preferred |

#### .NET 5 → .NET 6 Breaking Changes

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| N56001 | `UseStartup<TStartup>()` | Warning | Minimal hosting model (`WebApplication.Create`) recommended |
| N56002 | `Startup.Configure(IApplicationBuilder)` | Warning | Move to `Program.cs` top-level statements |
| N56003 | `System.Drawing` on non-Windows | Breaking | Use `ImageSharp` or `SkiaSharp` |
| N56004 | `Newtonsoft.Json` default serializer in ASP.NET | Warning | ASP.NET Core 6 defaults to `System.Text.Json` |

#### .NET 6 → .NET 7 Breaking Changes

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| N67001 | `IApplicationBuilder.Use(Func<...>)` specific overload | Breaking | Use typed middleware overload |
| N67002 | Custom `JsonConverter` with write-back | Warning | Review for `JsonSerializerOptions` changes |
| N67003 | `[Obsolete]` `Microsoft.AspNetCore.Hosting.IWebHostEnvironment.EnvironmentName` assignments | Warning | Use `IHostEnvironment` |
| N67004 | `HttpClient` default request version | Info | Now defaults to HTTP/1.1 — set explicitly if 2.0 required |

#### .NET 7 → .NET 8 Breaking Changes

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| N78001 | `BinaryFormatter` | Breaking | Removed entirely — use `System.Text.Json` |
| N78002 | `System.Security.Cryptography.DES` | Breaking | Use `Aes` |
| N78003 | `System.Security.Cryptography.RC2` | Breaking | Use `Aes` |
| N78004 | `IDistributedCache.Set(string, byte[])` | Warning | Prefer async overload `SetAsync` |
| N78005 | Route handler `IResult.ExecuteAsync` return without `Task` | Breaking | All `IResult` implementations must return `ValueTask` |
| N78006 | `[JsonSerializable]` source gen missing partial | Warning | Add `partial` keyword to context class |
| N78007 | `UseSwagger()` from Swashbuckle | Warning | Verify Swashbuckle 6.5+ compatibility |

#### .NET 8 → .NET 9 Breaking Changes

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| N89001 | `TlsStream` internal APIs | Breaking | Use `SslStream` public API |
| N89002 | `System.Runtime.Loader.AssemblyLoadContext` isolation changes | Warning | Review plugin loading scenarios |
| N89003 | `HttpClientFactory` named client default scope change | Warning | Explicitly set `HandlerLifetime` |
| N89004 | LINQ `Order()` / `OrderDescending()` behavior with nulls | Info | Verify sort order assumptions |

#### .NET Core 2.x → 3.0 Breaking Changes (Framework Decomposition — apply for ANY 2.x source)

These are the highest-frequency build breakers when the source is 2.1/2.2. Always apply them.

| Rule ID | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| FD001 | `<PackageReference Include="Microsoft.AspNetCore.App" />` (no version — the 2.x metapackage) | Breaking | Remove. The Web SDK adds the framework implicitly; non-web projects use `<FrameworkReference Include="Microsoft.AspNetCore.App" />`. |
| FD002 | `<PackageReference Include="Microsoft.AspNetCore.Razor.Design" />` | Breaking | Remove (bundled in the SDK since 3.0). |
| FD003 | `services.AddMvc()` / `.SetCompatibilityVersion(CompatibilityVersion.*)` | Breaking | `AddControllersWithViews()` + `AddRazorPages()`; drop `SetCompatibilityVersion`. |
| FD004 | `RazorPagesOptions.AllowAreas` | Breaking | Remove (areas always enabled in 3.0+). |
| FD005 | `app.UseMvc(routes => ...)` | Breaking | Endpoint routing: `UseRouting(); UseAuthentication(); UseAuthorization(); UseEndpoints(e => { e.MapControllerRoute(...); e.MapRazorPages(); });` (auth must sit between `UseRouting` and `UseEndpoints`). |
| FD006 | `IHostingEnvironment` | Breaking | `IWebHostEnvironment` (or `IHostEnvironment`). |
| FD007 | `IdentityBuilder.AddDefaultUI(UIFramework.Bootstrap4)` | Breaking | `AddDefaultUI()` — the `UIFramework` enum was removed. Requires the `Microsoft.AspNetCore.Identity.UI` package. |
| FD008 | `GroupCollection` LINQ (`match.Groups.LastOrDefault()` / `.First()` etc.) | Breaking | `match.Groups.Values.LastOrDefault()`. In 3.0+ `GroupCollection` also implements `IReadOnlyDictionary<string,Group>`, so LINQ element-type inference becomes ambiguous (CS1061). |
| FD009 | `app.UseDatabaseErrorPage()` | Breaking | `app.UseMigrationsEndPoint()` (needs `Microsoft.AspNetCore.Diagnostics.EntityFrameworkCore`). |

#### Library / NuGet Package Breaking Changes (per major version — the build breaks live here)

Cross-reference `dependency-report.json`: when a package's resolved major differs from the current one, apply its rules.

| Package (version hop) | Symbol / Pattern | Severity | Replacement |
|---|---|---|---|
| **MediatR** 8/9/11 → 12 | `services.AddMediatR(Assembly)` | Breaking | `services.AddMediatR(cfg => cfg.RegisterServicesFromAssembly(asm))` (remove `MediatR.Extensions.Microsoft.DependencyInjection`, merged in). |
| **MediatR** → 12 | `IPipelineBehavior.Handle(request, cancellationToken, next)` | Breaking | Reorder to `Handle(request, next, cancellationToken)`. |
| **MediatR** → 12 | void `IRequestHandler<TRequest>` returning `Task<Unit>` / `return Unit.Value;` | Breaking | Return `Task` (no `Unit.Value`). |
| **AutoMapper** 9 → 12 | `Profile` / `CreateMap` / `services.AddAutoMapper(Assembly)` | None at 12 | Keep `AutoMapper.Extensions.Microsoft.DependencyInjection` 12.x for minimal churn. (13+ merges DI extensions and changes registration; flag NU1903 advisory on 12.0.1.) |
| **FluentValidation** 8 → 11 | `new ValidationContext(obj)` (non-generic) | Breaking | `new ValidationContext<T>(obj)`. |
| **FluentValidation** 8 → 11 | `Must(..., PropertyValidatorContext ctx)` | Breaking | `ValidationContext<T> ctx` (3-arg `Must` overload). |
| **FluentValidation.AspNetCore** 8 → 11 | `mvcBuilder.AddFluentValidation(...)` | Breaking | `services.AddFluentValidationAutoValidation(); services.AddValidatorsFromAssemblyContaining<T>();` |
| **CsvHelper** 12 → 33 | `new CsvWriter(stream)` | Breaking | `new CsvWriter(stream, CultureInfo.InvariantCulture)`. |
| **CsvHelper** 12 → 33 | `csv.Configuration.RegisterClassMap<T>()` | Breaking | `csv.Context.RegisterClassMap<T>()`. |
| **CsvHelper** 12 → 33 | `ClassMap`: `AutoMap()` / `Map(...).ConvertUsing(c => ...)` | Breaking | `AutoMap(CultureInfo.InvariantCulture)`; `Map(...).Convert(args => args.Value...)`. |
| **NSwag** 13 → 14 | `app.UseSwaggerUi3(...)` | Breaking | `app.UseSwaggerUi(...)`. NSwag.MSBuild: `NSwagExe_Core30` → `NSwagExe_Net80`. |
| **Swashbuckle** 4/5 → 6+ | `new Swashbuckle.AspNetCore.Swagger.Info {...}` | Breaking | `new Microsoft.OpenApi.Models.OpenApiInfo {...}`. |

#### EF Core Behavior & API Changes (compile AND runtime)

| Rule ID | Symbol / Pattern | Severity | Replacement / Note |
|---|---|---|---|
| EFC001 | `ForSqlServerUseSequenceHiLo(...)` / other `ForSqlServer*` builder methods | Breaking | `UseHiLo(...)` etc. (3.0 dropped the provider prefix). |
| EFC002 | An owned type (`OwnsOne`/`OwnsMany`) also configured via `modelBuilder.Entity<T>()` | Breaking (runtime) | Remove the standalone `Entity<T>` config; configure owned-type properties inside the `OwnsOne` lambda. EF Core 3.0+ throws "cannot be configured as non-owned because it has already been configured as owned". |
| EFC003 | Implicit client evaluation in LINQ queries | Breaking (runtime) | 3.0+ throws `InvalidOperationException` instead of silently evaluating client-side. Rewrite the query or add `.AsEnumerable()` before the client part. Often surfaces as a runtime 500, not a compile error. |
| EFC004 | Required (non-nullable / `IsRequired`) properties missing on `SaveChanges` | Breaking (runtime) | EF Core 8 throws `DbUpdateException` even on the InMemory provider. Populate required fields (commonly breaks test seed data). |

#### Discontinued / EOL Packages — detect BEFORE build, not at build time

| Package | Status | Action |
|---|---|---|
| `Microsoft.AspNetCore.ApiAuthorization.IdentityServer` | EOL after .NET 7 (no net8) | Migrate to **Duende.IdentityServer**; isolate behind `// TODO [MIGRATION]`. |
| `IdentityServer4.*` | EOL | Migrate to Duende.IdentityServer. |
| `Microsoft.AspNetCore.Identity.UI` `UIFramework` | enum removed (3.0) | Use parameterless `AddDefaultUI()`. |
| `dotnet-xunit` (DotNetCliToolReference) | Obsolete, unsupported on net8 SDK | Remove. |
| `System.Security.Claims`, `Microsoft.AspNetCore.Mvc` (as standalone pkg), `Microsoft.AspNetCore.Identity` | Inbox / in shared framework | Remove the PackageReference; use `<FrameworkReference>` where needed. |

> **Note for `code-refactoring-agent.agent.md`:** items previously bundled in the 2.x `Microsoft.AspNetCore.App` metapackage (e.g. `AddDefaultUI` → Identity.UI, `UseMigrationsEndPoint` → Diagnostics.EntityFrameworkCore, `UseInMemoryDatabase` → EntityFrameworkCore.InMemory) must be re-added as **explicit** PackageReferences after the metapackage is removed.

### Step 4 — Detect `Startup.cs` Pattern (Pre-.NET 6)
If `sourceVersion` is `net5.0` or lower and a `Startup.cs` file is present:
- Flag as `category: "HostingModelMigration"`.
- Mark all `Configure` and `ConfigureServices` methods.
- `code-refactoring-agent.agent.md` will offer to consolidate into minimal `Program.cs` in `migrated-output/{repoName}/`.

### Step 5 — Detect Nullable Reference Type Gaps
If `targetVersion` is `net6.0` or higher and `<Nullable>` is not `enable` in any project:
- Flag as `severity: "Warning"`, `category: "NullabilityAlignment"`.
- Recommend enabling nullable in `migrated-output/{repoName}/` `.csproj` files.

### Step 6 — Write `compatibility-report.json`
- Write to `migrated-output/{repoName}/.migration/`.
- Print summary to developer:
  ```
  ✅ API Compatibility Check Complete
     Files scanned:        134
     Breaking issues:        3  ❌
     Warnings:               8  ⚠️
     Informational:          5  ℹ️
     Auto-fixable:           3  🔧
     Output: migrated-output/{repoName}/.migration/compatibility-report.json
     Proceeding to Code Refactoring...
  ```

---

## TOOLS USED

| Tool | Purpose |
|---|---|
| Roslyn (Microsoft.CodeAnalysis) | AST-level C# parsing and symbol resolution on source files |
| Regex pattern scanner | Fast pre-filter before Roslyn for known string patterns |
| .NET API Diff reference (dotnet/core GitHub) | Ground truth for breaking changes per version |

---

## SKILLS USED

### Skill: Roslyn AST Parser
**Logic:**
1. Load `.cs` file from source via `CSharpSyntaxTree.ParseText()`.
2. Walk `SyntaxTree` for `InvocationExpressionSyntax`, `IdentifierNameSyntax`, `UsingDirectiveSyntax`.
3. Resolve symbol names against known removed/changed API list.
4. Return: matched symbol, line span, containing method/class name, source path, output path.
**Edge cases:**
- File uses `#if` preprocessor — scan both branches.
- Generated files (`*.g.cs`, `*.Designer.cs`) — skip unless `scanGenerated: true` in config.
- Partial classes — merge symbol resolution across all partial files.

### Skill: .NET API Compatibility Matrix Lookup
**Logic:**
1. Accept `(symbol, sourceVersion, targetVersion)`.
2. Look up symbol in embedded breaking-changes matrix.
3. Return: `{ breaking: bool, replacement: string, autoFixable: bool, ruleId: string }`.
4. Chain lookups across intermediate versions if multi-hop migration.

---

## INTERACTION WITH OTHER AGENTS

| Agent | Interaction |
|---|---|
| Dependency Mapping Agent | Reads package report from `migrated-output/{repoName}/.migration/` to cross-reference package-level API changes |
| Code Refactoring Agent | Reads `compatibility-report.json` — uses `outputFile` paths to know which files in `migrated-output/{repoName}/` to patch |
| Reporting Agent | Reads `compatibility-report.json` for final migration report |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| File cannot be parsed by Roslyn | Fall back to regex scan; flag file as "partially analyzed" |
| Rule match has no known replacement | Set `autoFixable: false`, emit `// TODO [MIGRATION]: {description}` instruction for `code-refactoring-agent.agent.md` to insert in `migrated-output/{repoName}/` copy |
| More than 50 breaking issues found | Log all, continue — do not halt (refactoring agent handles them in `migrated-output/{repoName}/`) |

---

## PRE-FLIGHT SYMBOL SWEEP (v3.1 — find ALL breakers in one pass before deep analysis)

Run a single repo-wide ripgrep for the known-breaking symbols up front and emit every hit into `compatibility-report.json` with `autoFixable: true` and its rule ID. This is the single biggest accuracy/speed lever: it lets `code-refactoring-agent.agent.md` fix **all** known classes in pass 1, instead of the build→fix loop discovering one error class per iteration.

Generic pattern set for any `netcoreapp2.x/3.x → net5+/net8` migration (extend per detected `dependency-report.json` package hops):

```
rg -n "ForSqlServer|IHostingEnvironment|app\.UseMvc|AddMvc\(|SetCompatibilityVersion|AllowAreas|AddDefaultUI\(UIFramework|UseDatabaseErrorPage|Swashbuckle\.AspNetCore\.Swagger|new Info\b|\.HasName\(|BinaryFormatter|\.Groups\.\w*OrDefault\(|\.Groups\.(First|Last|Single|ElementAt)\(|Microsoft\.AspNetCore\.App|Microsoft\.AspNetCore\.Razor\.Design|DotNetCliToolReference|UseInternalServiceProvider|AddEntityFrameworkInMemoryDatabase|WebApplicationFactory<" -g "*.cs" -g "*.csproj"
```

Triage each hit:
- `.HasName(` — only on `HasIndex(...)` is it a breaker (→ `HasDatabaseName`); on keys/sequences it is NOT. Inspect 1 line of context before flagging.
- `WebApplicationFactory<` / `UseInternalServiceProvider` / `AddEntityFrameworkInMemoryDatabase` — these are TEST-HOST breakers; cross-reference the test-host checklist in `test-execution-agent.agent.md`.

## TEST-HOST BREAKING CHANGES (v3.1 — compile-clean but 500 at runtime)

Add these to the scope whenever a test project references `Microsoft.AspNetCore.Mvc.Testing` / `WebApplicationFactory`. They typically COMPILE on net8 but fail at request time — pre-flag them so they are fixed proactively (full guidance + fixes live in `test-execution-agent.agent.md`):

| Rule ID | Pattern | Severity | Replacement |
|---|---|---|---|
| TH001 | `WebApplicationFactory` with no `UseEnvironment` | Breaking (runtime) | Mvc.Testing no longer defaults to `Development`; pin a neutral env so environment-named `Startup.Configure{Env}Services` conventions don't wire a real DB. |
| TH002 | `AddEntityFrameworkInMemoryDatabase()` + `UseInternalServiceProvider` | Breaking (runtime) | Injects EF's size-limited `IMemoryCache` into the app container → "Cache entry must specify a value for Size when SizeLimit is set." Use `UseInMemoryDatabase(name, sharedRoot)` only. |
| TH003 | `static` InMemory store/root in a fixture | Breaking (flaky) | xUnit runs test classes in parallel → racing seeders. Use a per-fixture `InMemoryDatabaseRoot`. |
| TH004 | Fixture pre-registers Identity/auth in `ConfigureServices` | Warning | Fixture services run before `Startup` on net8 → `Startup` can override (e.g. cookie `LoginPath`). Register only DbContexts; seed post-build via `CreateServer`/`CreateHost`. |

---

*Agent Version: 3.1.0 | Read-only on source (pre-flight sweep first) | Writes to migrated-output/{repoName}/.migration/ | Pipeline Step: 3 of 7*