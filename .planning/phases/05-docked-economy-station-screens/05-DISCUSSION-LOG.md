# Phase 5: Docked Economy & Station Screens - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-05
**Phase:** 5-Docked Economy & Station Screens
**Areas discussed:** Station screen shell & navigation, Market trading interaction, Outfitting scope & removal semantics, Market state & determinism, Commodity display & Alien Items

---

## Station screen shell & navigation

| Option | Description | Selected |
|--------|-------------|----------|
| Single station computer | Docked panel becomes the home/menu; F-keys open full-screen sections; Esc/Backspace returns; one owner of visibility and focus | ✓ |
| Independent overlays | Each screen is a separate overlay with its own close path | |
| One screen with tabs | All sections as tabs in a single window | |

**User's choice:** Single station computer.
**Notes:** Closest to Oolite and keeps keyboard-only navigation tractable.

| Option | Description | Selected |
|--------|-------------|----------|
| Full-screen terminal with header and footer | Screens cover the 3D view; header shows system + credits, footer shows key hints and messages | ✓ |
| Full-screen terminal without persistent chrome | Each screen draws its own title and data | |
| Panels over the docked 3D view | Semi-transparent panels with the scene visible | |

**User's choice:** Full-screen terminal with header and footer.

| Option | Description | Selected |
|--------|-------------|----------|
| Two pages | Page 1 status, page 2 cargo manifest, switched with Tab/PageUp/PageDown | ✓ |
| Single status page | One page with no manifest | |
| Manifest as a separate screen | Own key for the manifest | |

**User's choice:** Two pages.

| Option | Description | Selected |
|--------|-------------|----------|
| Launch only from home | Esc/Backspace return to the menu; `1`/F1 launches only from the home screen | ✓ |
| Launch from any screen | `1`/F1 launches anywhere | |
| Esc launches | Backing out of a section launches the ship | |

**User's choice:** Launch only from the home screen.

| Option | Description | Selected |
|--------|-------------|----------|
| Structured fields + planetinfo description | Fields plus the compiled multi-line `description` | ✓ |
| Structured fields only | No description text | |
| Fields + generated prose | Build a paragraph from `sysdata-*` templates | |

**User's choice:** Structured fields plus the compiled planetinfo description.

---

## Market trading interaction

| Option | Description | Selected |
|--------|-------------|----------|
| Arrows ±1, Shift = max, footer Y/N | Step by one unit, jump to the feasible maximum, confirm in the footer | ✓ |
| 1 / max only | Two fixed quantities, no stepping | |
| Typed quantity | Numeric entry per trade | |

**User's choice:** Arrows ±1, Shift for maximum, footer confirmation.

| Option | Description | Selected |
|--------|-------------|----------|
| Clamp and explain | Reduce to the feasible amount and show why; never block the whole trade | ✓ |
| Reject the trade | Refuse the request entirely | |
| Silent clamp | Reduce without explanation | |

**User's choice:** Clamp and explain.

| Option | Description | Selected |
|--------|-------------|----------|
| 1 kg / 1 g steps | Gold and platinum per kg, gem-stones per g, price per unit | ✓ |
| Pod-based steps | Buy whole pods only | |
| Tonne steps | Treat all goods as tonnes | |

**User's choice:** 1 kg / 1 g steps with per-unit prices and pod conversion at 1,000 kg / 1,000,000 g.

| Option | Description | Selected |
|--------|-------------|----------|
| Fixed Oolite columns | Name, unit, price, stock, in hold, `Ex`; dimmed zero-stock rows; no detail pane | ✓ |
| Name and price only | Minimal two-column list | |
| List plus detail pane | Side pane with description and legality | |

**User's choice:** Fixed Oolite columns, dimmed zero-stock rows, no detail pane.

---

## Outfitting scope & removal semantics

| Option | Description | Selected |
|--------|-------------|----------|
| Buy-only + catalogue removal entries | "Remove" is satisfied by removal items bought like any other | ✓ |
| Resale at a fraction | Sell owned equipment back | |
| Free removal | Removal costs nothing | |

**User's choice:** Buy-only with catalogue removal entries.

| Option | Description | Selected |
|--------|-------------|----------|
| Peaceful research set | Fuel, cargo bay, dock computer, gal drive, compass, ANA, missile, berth, removals | ✓ |
| Only items with a visible v1 effect | Hide gal drive/compass/ANA until Phase 6 | |
| Whole catalogue filtered by TL | Show combat equipment when TL allows | |

**User's choice:** Peaceful research set; combat/defensive items hidden entirely.

| Option | Description | Selected |
|--------|-------------|----------|
| Immediate, no clock advance | Effects apply at once; no install delay | ✓ |
| Immediate + clock advance | Apply at once and advance the docked clock | |
| Apply on next launch | Effects deferred until undocking | |

**User's choice:** Immediate effects, no clock advance, no ship-mass fuel scaling.

| Option | Description | Selected |
|--------|-------------|----------|
| Purchasable + dimmed unavailable | Unavailable rows visible, dimmed, with a short reason | ✓ |
| Only purchasable items | Hide everything unavailable | |
| Full list with status column | Show availability in a column | |

**User's choice:** Purchasable items plus dimmed, non-interactive unavailable rows with reasons. This refines ROADMAP criterion 4: nothing unavailable can be purchased.

| Option | Description | Selected |
|--------|-------------|----------|
| Missiles up to 3, berths by space | Multi-instance with per-item limits | ✓ |
| Everything single-instance | One of each item | |
| No limits | Unlimited stacking | |

**User's choice:** Missiles up to 3 at 30 Cr, berths at 82.5 Cr with 5 t each while space remains.

| Option | Description | Selected |
|--------|-------------|----------|
| Separate rows | Removal rows appear only when something can be removed | ✓ |
| Sub-rows under the item | Nested under the owned item | |
| Delete key | Removal via a dedicated key | |

**User's choice:** Separate removal rows confirmed like ordinary purchases.

| Option | Description | Selected |
|--------|-------------|----------|
| Shared footer Y/N | Same confirmation pattern as F8 | ✓ |
| Instant purchase on Enter | No confirmation | |
| Modal dialog | Separate confirmation dialog | |

**User's choice:** Shared footer Y/N confirmation.

---

## Market state & determinism

| Option | Description | Selected |
|--------|-------------|----------|
| On docking | Generate on every docking for the current system | ✓ |
| On first F8 open | Lazy generation per visit | |
| On session load | Generate once per session | |

**User's choice:** On every docking.

| Option | Description | Selected |
|--------|-------------|----------|
| Seed from system + visit | Deterministic PRNG over `(systemId, arrival counter)` | ✓ |
| Seed from system only | Market identical on every visit | |
| True randomness | `Math.random` with injected values in tests | |

**User's choice:** Deterministic PRNG seeded from system and visit; no `Math.random` in `src/sim`.

| Option | Description | Selected |
|--------|-------------|----------|
| Cargo saved, market in memory | Cargo and credits autosaved; stock regenerated on load | ✓ |
| Save both market and cargo | Extend the save with a market snapshot | |
| Everything in memory | Nothing survives reload | |

**User's choice:** Cargo in the save, market in memory; Phase 6 owns market persistence.

| Option | Description | Selected |
|--------|-------------|----------|
| Golden files per system | Fixed-seed JSON goldens for representative systems, all 17 commodities | ✓ |
| Expected-value table in a test | A few inline expectations | |
| Formula plus screen-text snapshots | Pin rendered text too | |

**User's choice:** Golden files per system under `tests/golden/`.

---

## Commodity display & Alien Items

| Option | Description | Selected |
|--------|-------------|----------|
| Expand `name` at build time | `name` becomes the display name from `descriptions.plist`; `key` stays identity | ✓ |
| Add `displayName` | Keep `name` as the localization key | |
| Map in `labels.json` | Resolve keys in the UI | |

**User's choice:** Expand `name` at build time.

| Option | Description | Selected |
|--------|-------------|----------|
| Hide Alien Items | 16 rows only | |
| Show dimmed | 17th row visible, non-interactive, stock `—` | ✓ |

**User's choice:** Show Alien Items as a dimmed row.

---

## the agent's Discretion

- Save-schema mechanism for cargo (optional v1 field vs version bump), provided existing v1 blobs stay readable and no Phase 6 migration is invented.
- PRNG algorithm, hash construction, and arrival-counter storage.
- DOM structure, class names, focus model, scroll behaviour.
- Location of market generation, provided it stays pure and deterministic.
- Numeric formatting helpers and column widths.

## Deferred Ideas

- F6 Charts and F2 Save/load screens — Phase 6.
- Effects of Galactic Hyperdrive, Advanced Space Compass, Advanced Navigational Array — Phase 6.
- F8 filter/sort — P2.
- Legal consequences for illegal goods — out of v1.
- Combat/defensive equipment — v2 with combat.
- Equipment resale — deliberately absent.
- Oolite install delay and ship-mass fuel pricing — out of v1.
- Other-language commodity names — English only in v1.
