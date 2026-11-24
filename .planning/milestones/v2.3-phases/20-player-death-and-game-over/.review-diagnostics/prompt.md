# Targeted fidelity review — Wegolite Phase 20 (player death)

Wegolite is a browser reimplementation of Oolite (repo: /home/opencode/git/wegolite; Oolite reference checkout: /home/opencode/git/oolite, pinned commit 7437f22 — read exact lines with `git -C /home/opencode/git/oolite show 7437f22:<path>`). The project's fidelity rule (AGENTS.md): Oolite's behaviour is the default; a divergence is allowed only where the result is clearly better, the reviewer models agree, and FIDELITY.md records the reason.

Context: `.planning/phases/20-player-death-and-game-over/20-CONTEXT.md` (D-01, D-01a, D-01b, D-01c) and the plans `20-04-PLAN.md`, `20-08-PLAN.md`, `20-10-PLAN.md` in the same directory. Read-only: do not modify files, do not run builds or tests.

Owner decisions taken after the first review round, to judge:

- **DIV-9 (one flash, D-01b):** the player's death explosion (eight Phase 16 explosion clouds: four "small" and four "big" with Oolite's per-kind speed, lifetime and size) carries exactly ONE bright flash, attached to the first burst. Oolite's `becomeLargeExplosion:` (`src/Core/Entities/ShipEntity.m:8300-8320`) adds no flash entity; the cloud+flash pair is Oolite's ordinary explosion (`ShipEntity.m:7957-7964`).
- **DIV-2 (updated, D-01a):** the remaining divergence of the explosion is now only the particle form (each burst is a Phase 16 cloud, not an Oolite particle system), with burst counts, kinds, speeds, lifetimes and start sizes taken from `src/Core/OOParticleSystem.m` at the pin.
- **DIV-7 (updated, D-01c):** the simulation freezes at the death tick (deterministic dead hash), but on screen explosions, shots, NPC debris (render-only extrapolation: last sim position + velocity × presentation time) and the black-and-white fade keep moving; ships, buoys, station and dust stand still. Oolite keeps the whole universe running during the dead window.

For each, verify against the cited Oolite source and the plans, then answer with exactly one line each, in this form:

`- DIV-9 (one flash): ACCEPT | OBJECT — <one or two sentences, citing Oolite lines>`
`- DIV-2 (explosion particle form, updated): ACCEPT | OBJECT — ...`
`- DIV-7 (frozen sim, moving presentation layers, updated): ACCEPT | OBJECT — ...`

Before the verdict lines you may add up to five short concerns about how 20-04/20-08/20-10 implement these decisions (cite path:line). Output markdown only.
