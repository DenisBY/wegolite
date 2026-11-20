---
created: 2026-11-20T10:15:00.000Z
title: Name ident locks on statics and debris with traffic off
area: app
severity: minor
files:
  - src/app/session/start-session.ts
  - src/app/session/event-router.ts
  - tests/app/session/event-router-ident.test.ts
---

## Problem

Plan 18-06 made ident lock the station, both buoys, cargo pods and alloy plates, and names them from the
compiled static artifact's `names`. `startSession` installs those names as `ctx.core.targetNames` only when
`loadSessionContent()` loads the static artifact, which happens with traffic on. With traffic off
(`?traffic=0`, and the browser-test bundle's default) no name is loaded, so `identName`
(`src/app/session/event-router.ts`) falls back to the spec key and the HUD prints the raw hull key, for
example "Ident system locked onto coriolis-station." instead of "Ident system locked onto Coriolis Station.".

The behaviour is pinned by "prints the raw key with traffic off, where no name is loaded" in
`tests/app/session/event-router-ident.test.ts`, and recorded in `.planning/PROJECT.md` ("the raw key with
traffic off"). The Node twin in `tests/app/session/tick-parity.test.ts` also installs no names, so its
kill-tick re-lock on the nav buoy reads "Ident system locked onto buoy.".

Oolite always shows the ship's display name; it has no traffic-off mode.

## Fix

Load the static names independently of traffic (they are small and part of the static hull artifact), or
accept the raw key as a test-bundle-only divergence and record it in FIDELITY.md. Either way, update the
traffic-off pin in `event-router-ident.test.ts` and the PROJECT.md wording.

Owner decision 2026-11-20: deferred out of plan 18-06; triage at phase close (plan 18-12).
