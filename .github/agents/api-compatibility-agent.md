# API Compatibility Agent

> **Called by:** `agent.md` (Migration Orchestrator)
> **Do not invoke this file directly.** The orchestrator loads it automatically at pipeline step 3.

---

## IMMEDIATE ACTIONS — DO THESE AUTOMATICALLY, NO CONFIRMATION NEEDED

- Load both `solution-map.json` and `dependency-report.json` from `migrated-output/.migration/` immediately on invocation.
- Scan ALL `.cs` files from the **original source project** in one pass — do not process project by project and stop.
- Apply the full breaking-changes matrix for the exact `sourceVersion → targetVersion` path, not a generic list.
- Write `compatibility-report.json` to `migrated-output/.migration/` on completion.
- Never modify any source file — this agent is READ-ONLY on both source and `migrated-output/`.
- For every API removal or behavioral change found, produce a concrete replacement recommendation or a `// TODO [MIGRATION]` marker instruction.

---

## GOLDEN RULE — OUTPUT DIRECTORY

```
READ from:   original source project .cs files
WRITE to:    migrated-output/.migration/compatibility-report.json

Never modify any file in the original source project.
Never modify any file in migrated-output/ — that is code-refactoring-agent's job.
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
| Reads | `migrated-output/.migration/solution-map.json`, `migrated-output/.migration/dependency-report.json`, all original `.cs` files |
| Writes | `migrated-output/.migration/compatibility-report.json` |

---

## RESPONSIBILITY

Scan every C# source file in the original project for usage of APIs, patterns, and runtime behaviors that changed, were removed, or require explicit opt-in between `sourceVersion` and `targetVersion`. Produce a complete compatibility report with file locations, line numbers, severity levels, and recommended replacements. The report's file paths include both source and `migrated-output/` paths so `code-refactoring-agent.md` knows exactly which output files to edit.

---

## INPUTS

| Input | Source | Required |
|---|---|---|
| `sourceVersion` | Orchestrator context | ✅ |
| `targetVersion` | Orchestrator context | ✅ |
| `migrated-output/.migration/solution-map.json` | Previous agent | ✅ |
| `migrated-output/.migration/dependency-report.json` | Previous agent | ✅ |
| All `.cs` files in original source | Source filesystem | ✅ |

---

## OUTPUTS

**Primary output:** `migrated-output/.migration/compatibility-report.json`

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
      "outputFile": "migrated-output/src/Web/Program.cs",
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
      "outputFile": "migrated-output/src/Infrastructure/Services/DateService.cs",
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

Note: every issue has both `sourceFile` (where it was found) and `outputFile` (where `code-refactoring-agent.md` must apply the fix in `migrated-output/`).

---

## EXECUTION STEPS

### Step 1 — Build Breaking-Changes Scope
Determine the exact set of breaking-change rules to apply based on the version delta:

| Source → Target | Rules Set Applied |
|---|---|
| `netcoreapp3.1` → `net6.0` | Rules: 3.1→5, 5→6 |
| `net6.0` → `net8.0` | Rules: 6→7, 7→8 |
| `net6.0` → `net9.0` | Rules: 6→7, 7→8, 8→9 |
| `net4x` → any Core | Rules: Framework-to-Core full ruleset |

Always apply the **cumulative** rules across all intermediate versions, not just the final hop.

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

### Step 4 — Detect `Startup.cs` Pattern (Pre-.NET 6)
If `sourceVersion` is `net5.0` or lower and a `Startup.cs` file is present:
- Flag as `category: "HostingModelMigration"`.
- Mark all `Configure` and `ConfigureServices` methods.
- `code-refactoring-agent.md` will offer to consolidate into minimal `Program.cs` in `migrated-output/`.

### Step 5 — Detect Nullable Reference Type Gaps
If `targetVersion` is `net6.0` or higher and `<Nullable>` is not `enable` in any project:
- Flag as `severity: "Warning"`, `category: "NullabilityAlignment"`.
- Recommend enabling nullable in `migrated-output/` `.csproj` files.

### Step 6 — Write `compatibility-report.json`
- Write to `migrated-output/.migration/`.
- Print summary to developer:
  ```
  ✅ API Compatibility Check Complete
     Files scanned:        134
     Breaking issues:        3  ❌
     Warnings:               8  ⚠️
     Informational:          5  ℹ️
     Auto-fixable:           3  🔧
     Output: migrated-output/.migration/compatibility-report.json
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
| Dependency Mapping Agent | Reads package report from `migrated-output/.migration/` to cross-reference package-level API changes |
| Code Refactoring Agent | Reads `compatibility-report.json` — uses `outputFile` paths to know which files in `migrated-output/` to patch |
| Reporting Agent | Reads `compatibility-report.json` for final migration report |

---

## FAILURE HANDLING

| Failure | Action |
|---|---|
| File cannot be parsed by Roslyn | Fall back to regex scan; flag file as "partially analyzed" |
| Rule match has no known replacement | Set `autoFixable: false`, emit `// TODO [MIGRATION]: {description}` instruction for `code-refactoring-agent.md` to insert in `migrated-output/` copy |
| More than 50 breaking issues found | Log all, continue — do not halt (refactoring agent handles them in `migrated-output/`) |

---

*Agent Version: 2.1.0 | Read-only on source | Writes to migrated-output/.migration/ | Pipeline Step: 3 of 7*