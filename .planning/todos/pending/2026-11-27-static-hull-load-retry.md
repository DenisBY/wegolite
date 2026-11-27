---
created: 2026-11-27T19:30:00.000Z
title: A failed static hull artifact load stays failed until reload (the loaders cache their rejection)
source: Phase 22.1 plan 22.1-09 (Issues Encountered), closed out in plan 22.1-13
area: content
severity: minor
files:
  - src/content/ships-static-hulls.ts
  - src/app/session/station-install.ts
  - tests/guards/static-hull-retry-tripwire.test.ts
---

## Problem

`loadStationHulls(kind)` memoises the promise of the Dodecahedron or Icosahedron hull artifact in
`cachedStations`, and `loadStaticHulls()` memoises the shared artifact in `cachedArtifact`. Both keep a
rejected promise: a transient failure of the lazy chunk fetch (a dropped connection, a stalled request)
makes every later call return the same rejection until the page is reloaded.

`ensureStationHulls` (`src/app/session/station-install.ts`) is written to ask the loader again after a
rejection ("a rejection leaves the session as it was and the next ask loads again"), but the loader's own
cache hands it the same failure, so the second ask cannot succeed. With NPC traffic on, in a Biarge or
Zaonce arrival the station then stays a non-candidate for lasers and ident, and an F2 Load into such a
system keeps failing with "Save could not be loaded", until the player reloads the page. The shared
artifact has had the same pattern since Phase 18; there a failure sits on the boot failure surface, so a
reload is the retry anyway. Plan 22.1-09 left it as it was (outside its files, and the planned failure
surfaces hold); Phase 22.1 closes with the todo and the tripwire below, not with a fix.

## Solution

1. In `src/content/ships-static-hulls.ts` evict the memo on rejection in both loaders (a `catch` that deletes
   the `cachedStations` entry, or resets `cachedArtifact`, and rethrows), so the next ask fetches again.
2. Test it with a loader whose first read rejects and second resolves (the file read is behind
   `import.meta.glob`, so give `readArtifact` an injectable reader or mock the glob module), and check that
   `ensureStationHulls` recovers on its second ask.
3. Delete the guard `tests/guards/static-hull-retry-tripwire.test.ts` and move this todo to
   `.planning/todos/completed/`.

## Tripwire

`tests/guards/static-hull-retry-tripwire.test.ts` fails when `src/content/ships-static-hulls.ts` starts
evicting a rejected load (the fix landed without this todo being closed) and when it no longer memoises at
all (the loaders changed shape). It is green while the loaders cache their rejection, as today.
