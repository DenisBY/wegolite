# Phase 9: NPC Content - Context

**Gathered:** 2026-11-13
**Status:** Ready for planning

<domain>
## Phase Boundary

Compile the ships of the six populator roles (traders, pirates, police Vipers, hunters, shuttles, scavengers) as content: models and WebP textures from the pinned Oolite snapshot with provenance, ship records carrying the fields the inert world uses (roles, AI name, scan class, model; `like_ship` resolved), and lazy loading that keeps all of it out of the first load (cold-start transfer under 9,437,184 bytes). No sound, music, cargo pod, missile, capsule, wreckage or asteroid. No combat or flight stats (DATA-15 deferred). Mass is Phase 10.

Requirements: DATA-10, DATA-13. Staged check: DATA-11 stage 1 (the record fields).

</domain>

<decisions>
## Implementation Decisions

### Ship set per role
- **D-01:** Use a small set, not every record carrying a role. Target 1-3 models per role, about 9-10 new models: Viper (police); Adder, Moray and/or Python (trader); Sidewinder, Mamba and/or Krait (pirate); Gecko (hunter); Shuttle (shuttle); Cobra Mk I (scavenger). The researcher confirms the exact list against the `roles` fields and the vendored plist; the Cobra Mk III model is already vendored. Remaining role models join with the populator when it needs them. — **Reversibility:** reversible — adding a model later is another vendor-script entry plus drift-gate regeneration.
- **D-02:** Only records whose model is in the chosen set are compiled with the NPC field list. Variants that reuse a chosen model (pirate/trader variants, `oolite_template_*` duplicates) are included only if the first populator needs that role string; the planner decides per record and states why.

### Asset scope per ship
- **D-03:** Per ship, vendor and encode diffuse + normal + specular maps (the same material path as the Cobra Mk III), as WebP via the existing texture encoder and `texture-encodings.json`. Illumination maps only where the Oolite material already uses them for that ship. — **Reversibility:** costly — dropping maps later changes the material path and goldens.
- **D-04:** Sub-entities (flashers, lasers) are not compiled into models in this phase; sub-entity data is not part of the inert-world field list.

### Carried from roadmap (already locked, not re-discussed)
- **D-05:** No sound, music, pod, missile, capsule, wreckage or asteroid assets. Every vendored file is recorded in `ASSETS.md`, `NOTICE` and `CHECKSUMS.sha256`; `assets:check` fails on drift.
- **D-06:** Record fields: roles, AI name, scan class, model, from `shipdata.plist` with `like_ship` resolved. Worked examples pin at least the Viper, one trader and one pirate.
- **D-07:** NPC models and textures sit outside the first-load set; a cold start fetches none; a role model is fetchable on demand and decodes; the 9,437,184-byte ceiling is raised only on a recorded measurement (D11).

### Claude's Discretion
- Shape of the client catalogue: extend `ships-client.json` (now two entries) with an explicit field list, or add a separate lazily loaded NPC catalogue. Must not hand-edit generated data and must respect Pitfall 20 (catalogue growth behind the content golden and drift gate).
- Lazy-loading granularity (per ship or per role), where files live, and how a test proves a cold start fetches none of them.
- Texture dedup between ships that share a model.

</decisions>

<canonical_refs>
## Canonical References

**Downstream agents MUST read these before planning or implementing.**

### Planning
- `.planning/ROADMAP.md` §Phase 9 — goal, success criteria, pitfalls (20, 29, 12), decisions to settle
- `.planning/REQUIREMENTS.md` — DATA-10, DATA-11, DATA-13; DATA-12/14/15/16 deferred
- `.planning/PROJECT.md` — Key Decisions, licensing constraints, scope rule ("less, but better", 2026-11-13)
- `AGENTS.md` — Docker-only verification, provenance rule (`NOTICE`/`ASSETS.md`), Oolite checkout at `/home/opencode/git/oolite`

### Oolite sources
- `/home/opencode/git/oolite/Resources/Config/shipdata.plist` — ship records, roles, `like_ship`
- `/home/opencode/git/oolite/Resources/Models/` — `.dat` meshes (e.g. `oolite_viper.dat`)
- `/home/opencode/git/oolite/Resources/Textures/` — diffuse/normal/specular PNGs
- `third_party/oolite/` (`pin.json`, `SOURCE.md`, `CHECKSUMS.sha256`) and `scripts/vendor-oolite.sh` — the vendoring path

### Pipeline
- `tools/oolite-ingest/` (`generate.ts`, `like-ship.ts`, `manifest.ts`, `convert/`) — content build
- `src/content/ships.ts`, `src/content/schemas/ship.ts`, `src/content/generated/` — catalogue and goldens
- `src/render/asset-cache.ts` — runtime asset loading

</canonical_refs>

<code_context>
## Existing Code Insights

### Reusable Assets
- `tools/oolite-ingest/like-ship.ts`: `like_ship` resolution, already ported from `OOShipRegistry.m`.
- `tools/oolite-ingest/convert/` (dat parser, GLB writer, WebP texture encoder) and `generated/texture-encodings.json`.
- `src/content/generated/ships.json`: full 194-entry catalogue with `model`, `modelVendored`, `roles`, `extras` (ai_type, scan_class live in `extras`); only 17 records have a vendored model today.

### Established Patterns
- Client loads `ships-client.json` (two entries) as a code-split `?raw` chunk; `ships.json` (~706 KB) stays out of the bundle.
- Vendored inputs are checksummed; generated data is never hand-edited.

### Integration Points
- `scripts/vendor-oolite.sh` whitelist, `ASSETS.md`/`NOTICE`, manifest and drift check, `asset-cache.ts`.

</code_context>

<specifics>
## Specific Ideas

No specific requirements beyond the small ship set; open to standard approaches.

</specifics>

<deferred>
## Deferred Ideas

- Remaining role models (Anaconda, Boa, Asp, Ferdelance, Transporter, Worm, pirate variants): join with the populator in Phase 12 if needed.
- Sub-entity data (flashers, lasers): with NPC combat/flight phases.

</deferred>

---

*Phase: 9-NPC Content*
*Context gathered: 2026-11-13*
