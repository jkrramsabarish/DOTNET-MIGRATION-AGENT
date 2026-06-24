# TestMigrationApp — Sample Repo for Testing the Migration Pipeline

This is a deliberately small, deliberately broken .NET **6.0** solution, built to give
your migration agents (`agent.md` + the 7 sub-agents) real, easy-to-verify work to do
without needing a 30-minute real-world codebase.

## What's inside

| Project | Type | Why it exists |
|---|---|---|
| `src/Web` | ASP.NET Core Web API (net6.0) | Uses pre-minimal-hosting `Startup.cs` pattern — should trigger `HostingModelMigration` |
| `src/Infrastructure` | Class library (net6.0) | Contains `ReportArchiveService.cs` with deliberate breaking-change bait |
| `tests/Web.Tests` | xUnit test project | Has tests that exercise the code paths above |

## Breaking changes baked in on purpose

These map directly to rules already defined in `api-compatibility-agent.md`:

| Code pattern | File | Rule ID | What should happen |
|---|---|---|---|
| `BinaryFormatter` | `ReportArchiveService.cs` | FW008 / N78001 | Removed entirely on net8.0 — should become a `// TODO [MIGRATION]` marker (no safe auto-fix) |
| `Thread.Abort()` | `ReportArchiveService.cs` | FW006 | Removed on Core — should suggest `Thread.Interrupt()` + TODO |
| `ConfigurationManager.AppSettings` | `ReportArchiveService.cs` | FW004 | Should flag for `IConfiguration` DI replacement |
| `Startup.cs` + `UseStartup<Startup>()` | `Program.cs`, `Startup.cs` | N56001/N56002 | Should offer minimal-hosting consolidation into `Program.cs` |
| `AddNewtonsoftJson()` | `Startup.cs` | N56004 | Should flag — System.Text.Json is the .NET 6+ default |
| `global.json` pinned to `6.0.100` | root | — | Should be flagged/updated when target is net8.0+ |

## How to use it

1. Unzip this next to your `agent.md` and the other 7 agent files (or point your AI
   assistant's working directory at it).
2. In Copilot / Claude Code, say:
   ```
   Migrate the TestMigrationApp project from net6.0 to net8.0
   ```
3. Watch the pipeline run through all 7 steps. Because the repo is tiny, this should
   take well under a minute for analysis/refactor, plus however long `dotnet build`/
   `dotnet test` take once you have the SDK installed.
4. Check `migrated-output/TestMigrationApp/migration-report.md` at the end — you should
   see at least 3 TODO markers (BinaryFormatter, Thread.Abort, ConfigurationManager) and
   one Startup.cs → minimal hosting suggestion.

## Expected outcome if everything works

- **Build:** should succeed once `BinaryFormatter`/`Thread.Abort` calls are either
  TODO'd-out or you manually resolve them (the agent won't guess at unsafe replacements).
- **Tests:** the two tests in `ArchivedReportTests.cs` don't touch `BinaryFormatter`
  directly, so they should still pass post-migration — good for confirming a "clean"
  test run end-to-end.

This is intentionally minimal — no database, no real config files, no auth — just enough
surface area to prove the pipeline works before you point it at something real.
