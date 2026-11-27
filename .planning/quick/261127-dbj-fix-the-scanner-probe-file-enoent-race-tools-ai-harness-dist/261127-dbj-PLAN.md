---
phase: quick-261127-dbj
plan: 01
type: execute
wave: 1
depends_on: []
files_modified:
  - tests/guards/source-scan.ts
  - tests/guards/source-scan.test.ts
  - tools/ai-harness/dist-check.test.ts
  - tests/guards/harness-isolation.test.ts
  - tests/app/session/death-flow.test.ts
  - tests/sim/npc/constants.test.ts
  - .planning/todos/completed/2026-11-20-dist-check-purity-probe-race.md
files_deleted:
  - .planning/todos/pending/2026-11-20-dist-check-purity-probe-race.md
autonomous: true
requirements: [quick-261127-dbj]

must_haves:
  truths:
    - "tools/ai-harness/dist-check.test.ts and tests/guards/harness-isolation.test.ts never read a `__purity_*` probe file and never descend into a `__purity_*` directory, so a probe that a parallel purity guard deletes after the listing cannot fail them with ENOENT"
    - "A subdirectory that vanishes between its parent's listing and its own listing (the transient src/sim/ai/nested/ and src/sim/ai/pilots/roles/ that withSimProbe creates and removes for tests/guards/ai-zone.test.ts) contributes no files instead of throwing; a directory that still exists but fails to list still throws"
    - "A missing scan root (a typo for src or public) still throws, so no scanner can pass vacuously; the existing non-vacuity assertions (dist-check `files.length > 100`, harness-isolation src/ and public/ entries walked) stay unchanged"
    - "listSrcFiles() returns the same list as before for the committed tree (repo-relative posix `.ts` paths under src/, code-unit ordered) and now also tolerates a vanished subdirectory, for every guard that already imports it"
    - "tests/app/session/death-flow.test.ts and tests/sim/npc/constants.test.ts, the two other scanners that read every `.ts` file under a probe-carrying src/ tree without skipping probes, scan through listSrcFiles and keep their assertions"
    - "The todo 2026-11-20-dist-check-purity-probe-race.md sits under .planning/todos/completed/ with a Resolution section, and is gone from .planning/todos/pending/"
  artifacts:
    - path: tests/guards/source-scan.ts
      provides: "readdirIfPresent and listFilesUnder (probe-skipping, vanished-directory-tolerant walker); listSrcFiles rebuilt on listFilesUnder"
    - path: tests/guards/source-scan.test.ts
      provides: "Behaviour tests of listFilesUnder and readdirIfPresent on temp trees, and of listSrcFiles on the committed tree"
    - path: tools/ai-harness/dist-check.test.ts
      provides: "The src/ and public/ marker scan lists files through listFilesUnder"
    - path: tests/guards/harness-isolation.test.ts
      provides: "shippedSources() lists src/ and public/ through listFilesUnder"
    - path: .planning/todos/completed/2026-11-20-dist-check-purity-probe-race.md
      provides: "The closed todo with its Resolution section"
  key_links:
    - from: tools/ai-harness/dist-check.test.ts
      to: tests/guards/source-scan.ts
      via: "listFilesUnder(\"src\") and listFilesUnder(\"public\") in the 'has none in any file under src/ or public/' case"
    - from: tests/guards/harness-isolation.test.ts
      to: tests/guards/source-scan.ts
      via: "shippedSources() builds its src/ and public/ entries from listFilesUnder"
    - from: tests/guards/sim-probe.ts
      to: tests/guards/source-scan.ts
      via: "withSimProbe normalises every probe basename to the `__purity_` prefix that the walker skips"
---

<objective>
Stop the source-tree scanners from racing the purity guards' probe files.

The purity guards write short-lived probes under `src/sim/` (and `src/app/`) and delete them again:
`tests/guards/sim-probe.ts` (`withSimProbe`, used by sim-purity, sim-determinism-bans and ai-zone)
normalises every probe basename to `__purity_*`, and `tests/guards/content-boundary.test.ts` uses
`__purity_*` names literally. For `tests/guards/ai-zone.test.ts`, `withSimProbe` also creates and removes the
directories `src/sim/ai/nested/` and `src/sim/ai/pilots/roles/`, which are not prefixed. Two scanners list
`src/` and then read every file, so a probe removed in between fails them with ENOENT:
`tools/ai-harness/dist-check.test.ts:184` (remote `verify` at 6bae6ac) and
`tests/guards/harness-isolation.test.ts` (remote `verify-full` at 0c5c72ca, on
`src/sim/ai/__purity_probe_2.ts`). Todo: `.planning/todos/pending/2026-11-20-dist-check-purity-probe-race.md`.

The fix reuses the established pattern from `tests/guards/sim-purity.test.ts`, `tests/sim/rng.test.ts` and
`tests/guards/entity-id-scope.test.ts`: skip `__purity_*` entries, and tolerate a directory that vanished after
its parent listed it. That pattern now gets one shared home in `tests/guards/source-scan.ts`, which already
holds `listSrcFiles` for about fifteen guards ("one home, so a fix ... is one edit"). File reads stay strict:
only `__purity_*` files and the two transient directories ever vanish, so a read ENOENT on any other file
still fails loudly.

Two more scanners have the same race and are cheap to include: `tests/app/session/death-flow.test.ts`
(the D-12 reload test reads every `.ts` file under `src/`) and `tests/sim/npc/constants.test.ts` (reads
every `.ts` file under `src/sim/`). Neither skips probes.

Purpose: remove a recurring flaky failure from `verify` and `verify-full` without weakening either scan.
Output: the shared walker and its tests, four scanners switched to it, the todo moved to completed.
Internal test tooling: no CHANGELOG entry (AGENTS.md, "Internal-only changes ... may be omitted").
</objective>

<execution_context>
@~/.claude/gsd-core/workflows/execute-plan.md
@~/.claude/gsd-core/templates/summary.md
</execution_context>

<context>
@AGENTS.md
@.planning/STATE.md
@.planning/todos/pending/2026-11-20-dist-check-purity-probe-race.md
@tests/guards/source-scan.ts
@tests/guards/sim-probe.ts
@tools/ai-harness/dist-check.test.ts
@tests/guards/harness-isolation.test.ts

Reference walkers (already correct, do not modify): `tests/guards/sim-purity.test.ts:63-87` (`listTsFiles`),
`tests/sim/rng.test.ts:407-428` (`collectSimFiles`), `tests/guards/entity-id-scope.test.ts:96-120`.
Temp-fixture pattern to copy for the new test: `tools/ai-harness/dist-check.test.ts:27-47`
(`mkdtempSync` under `tmpdir()`, removed in `afterAll`).
Import precedents: `tools/ai-harness/populator-host.ts` imports from `../../tests/oracles/...`, so a tools test
may import from `tests/`; `tests/app/session/event-router-damage.test.ts` imports
`../../guards/source-scan.js`.

## Reviewer and subagent brief

- Tests and builds run in Docker only. Host Node/npm/Playwright are not authoritative, and a green host run is not evidence.
- Commands: `docker compose run --rm test` (Vitest), `docker compose run --rm test npx vitest run <file>` (targeted), `docker compose run --rm typecheck`, `docker compose run --rm lint`, `docker compose run --rm verify` (full gate).
- The full Vitest suite runs on the remote machine only: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test`, from the worktree root, after committing (the wrapper syncs the committed HEAD). Locally run only targeted files, lint and typecheck.
- A reproduction that needs a scratch script or test must live under `/tmp` and be mounted into the container: `docker compose run --rm -v /tmp/<dir>:/scratch test ...`. Never add scratch files to the repository.
- Read-only reviewers must not modify tracked files; report findings instead.
- When the codebase-memory MCP is available, use it (project `wegolite`) before grepping; otherwise prefer `rg` over grep.
- All project files are written in English.
</context>

<tasks>

<task type="tracer" tdd="true">
  <name>Task 1: Shared probe-skipping walker in source-scan.ts, proven through the dist-check scan</name>
  <files>tests/guards/source-scan.ts, tests/guards/source-scan.test.ts, tools/ai-harness/dist-check.test.ts</files>
  <behavior>
    - listFilesUnder("scan", tempRoot) over `scan/b.ts`, `scan/a.json`, `scan/Z.ts`, `scan/sub/c.png`, `scan/sub/deeper/d.ts` returns exactly ["scan/Z.ts", "scan/a.json", "scan/b.ts", "scan/sub/c.png", "scan/sub/deeper/d.ts"] (posix, repo-relative, code-unit order: uppercase Z sorts before lowercase a; a locale compare would not)
    - listFilesUnder skips probe files and probe directories at any depth and nothing else: `scan/__purity_probe.ts`, `scan/sub/__purity_ban_x.ts` and `scan/__purity_dir/real.ts` are absent; the near-miss names `scan/not__purity_x.ts` and `scan/_purity_x.ts` are present
    - listFilesUnder on a root that does not exist throws an error whose `code` is "ENOENT" (non-vacuity: a mistyped scan root fails loudly)
    - readdirIfPresent on an existing directory returns its entries (compare the sorted names with a literal list)
    - readdirIfPresent on a directory that existed and was then removed returns an empty array (the vanished-mid-walk case)
    - readdirIfPresent on a path that is a regular file throws an error whose `code` is "ENOTDIR" (only a vanished directory is tolerated)
    - listSrcFiles() on the committed tree: contains "src/sim/ai/time.ts" and "src/ui/game-over.ts"; every path starts with "src/" and ends with ".ts"; no path segment starts with "__purity_"; the list equals its own code-unit-sorted copy; it has more than 100 entries
  </behavior>
  <action>
    Write the tests first (RED), then the implementation (GREEN).

    1. New `tests/guards/source-scan.test.ts` with the two-line SPDX header (copy from any guard file). One `describe` per exported function (`listFilesUnder`, `readdirIfPresent`, `listSrcFiles`), `it` names starting with "should", Arrange/Act/Assert visible. Build the temp trees with `mkdtempSync(join(tmpdir(), "wegolite-source-scan-"))` and remove them in `afterAll`, as `tools/ai-harness/dist-check.test.ts` does; nothing is written into the repository. Expected values are literal lists taken from the behavior block, never computed by the code under test. Assert error codes by catching the error and reading its `code` (do not pin message wording).

    2. `tests/guards/source-scan.ts` (Claude's discretion on naming, fixed here so the gates and later tasks agree):
       - Add a non-exported module constant for the probe prefix `"__purity_"`, with a comment naming `tests/guards/sim-probe.ts` (which normalises every probe basename to it) and `tests/guards/content-boundary.test.ts` as the writers.
       - Add `export function readdirIfPresent(directory: string)` returning the node:fs `Dirent` array that a `withFileTypes: true` listing yields. On an error whose `code` is "ENOENT" and `existsSync(directory)` is now false, return an empty array; rethrow every other error, including ENOENT while the directory still exists (do not swallow a real failure). Doc comment: a parallel guard can remove a transient probe directory (src/sim/ai/nested/, src/sim/ai/pilots/roles/) between its parent's listing and its own.
       - Add `export function listFilesUnder(relativeDir: string, root: string = process.cwd()): string[]`: every regular file (`Dirent.isFile()`) under `join(root, relativeDir)`, recursively, as posix paths built `${relative}/${entry.name}` starting with `relativeDir`, sorted with the code-unit comparator `listSrcFiles` uses today. Skip every entry, file or directory, whose name starts with the probe prefix, before any stat or read. List the root with a plain `withFileTypes` listing so a missing root throws; list every subdirectory through `readdirIfPresent`. Symlinks and other non-file, non-directory entries are not listed (`find src public -type l` is empty today).
       - Rebuild `listSrcFiles()` as `listFilesUnder("src")` filtered to names ending in ".ts". Its output for the committed tree must not change; its doc comment says it skips probe files and tolerates a vanished subdirectory. Update the module header comment to mention listing files under a repository directory.

    3. `tools/ai-harness/dist-check.test.ts`: import `listFilesUnder` from "../../tests/guards/source-scan.js". In the case "has none in any file under src/ or public/, comments included", build `files` from `listFilesUnder("src")` and `listFilesUnder("public")`; keep `expect(files.length).toBeGreaterThan(100)`, the marker loop and the offender assertion unchanged. Delete the file-local recursive walker helper and the node:fs names only it used (lint reports unused imports). Add one comment line: the purity guards' `__purity_*` probes are skipped by the shared walker (todo 2026-11-20). Do not touch `tools/ai-harness/dist-check.ts`: it scans the built dist/, which no probe ever reaches.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/guards/source-scan.test.ts tools/ai-harness/dist-check.test.ts && docker compose run --rm test npx vitest run $(rg -l --glob '*.test.ts' 'listSrcFiles' tests) && docker compose run --rm lint && docker compose run --rm typecheck && test "$(grep -cE '^export function listFilesUnder\(' tests/guards/source-scan.ts)" -ge 1 && test "$(grep -cE '^export function readdirIfPresent\(' tests/guards/source-scan.ts)" -ge 1 && test "$(grep -c 'tests/guards/source-scan.js' tools/ai-harness/dist-check.test.ts)" -ge 1 && test "$(grep -cE '^function walk\(' tools/ai-harness/dist-check.test.ts)" -eq 0</automated>
    Gate baselines: exported listFilesUnder in source-scan.ts [HEAD=0 EXPECT>=1]; exported readdirIfPresent in source-scan.ts [HEAD=0 EXPECT>=1]; source-scan import in dist-check.test.ts [HEAD=0 EXPECT>=1]; file-local walker in dist-check.test.ts [HEAD=1 EXPECT==0].
  </verify>
  <done>source-scan.test.ts passes with every behavior case; dist-check.test.ts passes and lists src/ and public/ through listFilesUnder; every existing listSrcFiles consumer still passes; lint and typecheck are clean; the three gates hold.</done>
</task>

<task type="auto">
  <name>Task 2: Switch harness-isolation, death-flow and the COMBAT_AI_ ledger scan to the shared walker</name>
  <files>tests/guards/harness-isolation.test.ts, tests/app/session/death-flow.test.ts, tests/sim/npc/constants.test.ts</files>
  <action>
    1. `tests/guards/harness-isolation.test.ts` (second sighting, 2026-11-26): import `listFilesUnder` from "./source-scan.js". Rebuild `shippedSources()` from repo-relative posix paths: `listFilesUnder("src")`, `listFilesUnder("public")`, then "index.html", then `rootViteConfigs()`; read each with `readFileSync(join(REPO_ROOT, path))` and keep `path` as the repo-relative posix string the `Source` interface expects. Delete the file-local recursive walker and the directory-existence guard around it: a missing src/ or public/ now throws, which is stronger than the old silent skip, and the case "walks every root Vite config, the seams config included" still requires src/ and public/ entries. Remove helpers and imports that become unused (lint reports them). Keep every `it` case and assertion unchanged. Add one sentence to the header doc comment: `__purity_*` probes written by the purity guards are skipped.

    2. `tests/app/session/death-flow.test.ts`, case "no in-session load function exists and only the overlay reloads the page" (around line 840, D-12): replace the recursive listing of "src" with `listSrcFiles()` imported from "../../guards/source-scan.js". Paths now carry the "src/" prefix, so read each with `readFileSync(path, "utf8")` and change the expected reloaders to `["src/ui/game-over.ts"]`. Keep the loadSavedGame loop. Drop the node:fs name that becomes unused.

    3. `tests/sim/npc/constants.test.ts`, case "no other file under src/sim defines a COMBAT_AI_ constant": replace the inline walk with `listSrcFiles().filter((path) => path.startsWith("src/sim/"))` (import from "../../guards/source-scan.js"), read each with `readFileSync(path, "utf8")`, and keep the regex, the definitions map and both expectations. Remove `SRC_SIM` and the node:fs, node:path and node:url names that become unused.

    Out of scope, do not modify (record in the SUMMARY): `tests/compliance.test.ts` and the six `tests/content/` scanners (ai-map, explosions, ships-debris, ships-hulls, ships-npc, ships-static-hulls) already skip `__purity_*` files; they still descend into the two transient probe directories without vanished-directory tolerance, a window of microseconds between two listings that has never been seen. `tests/guards/sim-purity.test.ts`, `tests/sim/rng.test.ts` and `tests/guards/entity-id-scope.test.ts` are already tolerant. `tests/helpers/session-source.ts` (src/app/session/) and `tests/guards/economy-purity.test.ts` (src/sim/economy/) walk directories that no probe is written into.
  </action>
  <verify>
    <automated>docker compose run --rm test npx vitest run tests/guards/harness-isolation.test.ts tests/app/session/death-flow.test.ts tests/sim/npc/constants.test.ts tests/guards/source-scan.test.ts && docker compose run --rm lint && docker compose run --rm typecheck && test "$(grep -cE '^function walk\(' tests/guards/harness-isolation.test.ts)" -eq 0 && test "$(grep -c 'listFilesUnder' tests/guards/harness-isolation.test.ts)" -ge 2 && test "$(grep -c 'listSrcFiles' tests/app/session/death-flow.test.ts)" -ge 2 && test "$(grep -c 'listSrcFiles' tests/sim/npc/constants.test.ts)" -ge 2</automated>
    Gate baselines: file-local walker in harness-isolation.test.ts [HEAD=1 EXPECT==0]; listFilesUnder in harness-isolation.test.ts [HEAD=0 EXPECT>=2]; listSrcFiles in death-flow.test.ts [HEAD=0 EXPECT>=2]; listSrcFiles in constants.test.ts [HEAD=0 EXPECT>=2].
  </verify>
  <done>The three files pass with unchanged assertions apart from the src/-prefixed reloader path; none of them reads a `__purity_*` file; lint and typecheck are clean; the four gates hold.</done>
</task>

<task type="auto">
  <name>Task 3: Close the todo and run the full suite on the remote</name>
  <files>.planning/todos/completed/2026-11-20-dist-check-purity-probe-race.md</files>
  <action>
    1. `git mv .planning/todos/pending/2026-11-20-dist-check-purity-probe-race.md .planning/todos/completed/` and append a `## Resolution` section in the style of `.planning/todos/completed/2026-11-17-fix-content-boundary-probe-race.md`. Write: "Done 2026-11-27 (quick 261127-dbj)"; the shared walker `listFilesUnder` / `readdirIfPresent` in `tests/guards/source-scan.ts` skips `__purity_*` entries and tolerates a probe directory that vanished mid-walk, and `listSrcFiles` is built on it; dist-check.test.ts, harness-isolation.test.ts, death-flow.test.ts and npc/constants.test.ts scan through it; the out-of-scope list from Task 2 with its reason. Keep the existing frontmatter and sections unchanged.
    2. Commit the work (atomic per task), then run the full Vitest suite on the remote from the worktree root: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test`. This is a tests-only change, so the gate is test, lint and typecheck (AGENTS.md gate selection); `verify` and `verify-full` are not needed. If an unrelated flaky case fails, rerun once and record both runs. Record the pass and failure counts in the SUMMARY.
  </action>
  <verify>
    <automated>test "$(ls .planning/todos/pending | grep -c '^2026-11-20-dist-check-purity-probe-race\.md$')" -eq 0 && test "$(grep -c '^## Resolution' .planning/todos/completed/2026-11-20-dist-check-purity-probe-race.md)" -ge 1 && /home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test</automated>
    Gate baselines: pending todo listed under pending/ [HEAD=1 EXPECT==0]; Resolution heading in the completed todo (file absent at HEAD) [HEAD=0 EXPECT>=1].
  </verify>
  <done>The todo lives only under completed/ with a Resolution section; the remote full Vitest suite passes at the committed HEAD and the SUMMARY records its counts.</done>
</task>

</tasks>

<threat_model>
## Trust Boundaries

| Boundary | Description |
|----------|-------------|
| test process to repository tree | The scanners read files under src/ and public/ inside the test container; the only inputs are tracked files and the purity guards' transient probes. No untrusted input crosses into shipped code. |

## STRIDE Threat Register

| Threat ID | Category | Component | Severity | Disposition | Mitigation Plan |
|-----------|----------|-----------|----------|-------------|-----------------|
| T-dbj-01 | Tampering | listFilesUnder probe-prefix skip | low | mitigate | A real file under src/ or public/ named with the probe prefix would escape the two source scans. The built bundle is still scanned with no skip by `npm run check:dist` (tools/ai-harness/dist-check.ts walks dist/ unfiltered) in every gate; the prefix is reserved by the probe normalisation in tests/guards/sim-probe.ts; source-scan.test.ts pins that only the exact prefix is skipped (near-miss names are listed). |
| T-dbj-02 | Repudiation | readdirIfPresent ENOENT tolerance | low | mitigate | Tolerated only when the directory no longer exists; ENOENT on an existing directory, every other error and a missing scan root still throw; dist-check keeps `files.length > 100` and harness-isolation keeps its src/ and public/ non-vacuity assertions. |
| T-dbj-03 | Information disclosure | temp fixture trees in source-scan.test.ts | low | accept | Written under os.tmpdir() inside the container, removed in afterAll, contain only fixture names. |
| T-dbj-SC | Tampering | npm/pip/cargo installs | low | accept | This plan adds and installs no package. |
</threat_model>

<verification>
- `docker compose run --rm test npx vitest run tests/guards/source-scan.test.ts tools/ai-harness/dist-check.test.ts tests/guards/harness-isolation.test.ts tests/app/session/death-flow.test.ts tests/sim/npc/constants.test.ts` passes.
- Every existing `listSrcFiles` consumer passes: `docker compose run --rm test npx vitest run $(rg -l --glob '*.test.ts' 'listSrcFiles' tests)`.
- `docker compose run --rm lint` and `docker compose run --rm typecheck` are clean.
- Remote full suite at the committed HEAD: `/home/opencode/.claude/scripts/wegolite-remote-run.sh run --rm test` passes.
- `git status` shows no stray file in the repository (the temp trees live under os.tmpdir()).
</verification>

<success_criteria>
- The two sighted scanners and the two other unskipped src/ scanners list files through the shared walker, which skips `__purity_*` entries and tolerates a vanished probe directory.
- A missing scan root and any non-vanish listing error still fail; no scan assertion was loosened apart from the src/-prefixed reloader path in death-flow.
- The todo is closed under completed/ with a Resolution section.
- No CHANGELOG entry (internal test tooling).
</success_criteria>

<output>
Create `.planning/quick/261127-dbj-fix-the-scanner-probe-file-enoent-race-tools-ai-harness-dist/261127-dbj-SUMMARY.md` when done
</output>
