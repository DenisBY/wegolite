---
created: 2026-11-24T00:00:00.000Z
title: "A second F5 on Status and a second F8 on Market re-open the same screen; Oolite opens Manifest and Market Info"
source: debug session docked-f-keys (2026-11-24), out of its scope by the coordinator's decision
area: input
severity: minor
type: divergence
files:
  - src/app/session/station-controller.ts
  - src/ui/station-tabs.ts
  - FIDELITY.md
---

## Problem

An unrecorded divergence from Oolite, found while fixing the docked F-keys
(`.planning/debug/resolved/docked-f-keys.md`). In Oolite, `pollGuiScreenControlsWithFKeyAlias`
(`src/Core/Entities/PlayerEntityControls.m:3904-3916` and `:3955-3967` at the pin 7437f22) does this:

- F5 on the Status screen opens the Manifest; F5 anywhere else, the Manifest included, opens Status.
- F8 on the Market screen opens Market Info; F8 anywhere else, Market Info included, opens the Market.

In Wegolite, a section key re-runs its open path on its own screen (`navigateByKey` ->
`openStationScreen` in `src/app/session/station-controller.ts`), so a second F5 on Status stays on
Status page 1, where Oolite shows the Manifest (Wegolite's Status page 2; Tab and the sub-tab reach it),
and a second F8 on the Market re-opens the Market. Wegolite has no Market Info screen: it is a hidden
slot in `src/ui/station-tabs.ts`. F5 on the Manifest page already returns to Status, as in Oolite.

## Done when

- A second F5 on Status shows the Manifest page, or a FIDELITY.md divergence row records why not.
- A second F8 on the Market is either ported once a Market Info screen exists, or recorded as a
  divergence in FIDELITY.md while that screen is missing.
- A unit test (and a browser case in `tests/e2e/station-fkeys.spec.ts`) pins the chosen behaviour.

## Resolution (2026-11-24, quick 261124-nbu)

Ported both second presses. F5 on Status page 1 now shows the Manifest (Status page 2) and F5 elsewhere
opens Status page 1; F8 on the Market opens Market Info (page 2 of the market screen, ported from
`setGuiToMarketInfoScreen`, with the commodity comment compiled from `trade-goods.plist` and
`descriptions.plist` by the content build) and F8 elsewhere opens the Market list; with no selected
commodity F8 stays on the Market, as in Oolite. An open chart or F2 screen makes either key open the
list or Status page 1. FIDELITY rows E-185 to E-189 record the behaviour as faithful. The owner asked
for an on-screen hint about the second press, which Oolite does not have: the docked footer names the
next F5 or F8 press, recorded as a divergence in the two FIDELITY E-185 and E-186 divergence rows and
in the PROJECT.md Key Decisions row of 2026-11-24. Commits: e2b26d0e (Market Info), 8cdd8502 (F5 and
the footer hints) and the commit that closes this todo.
