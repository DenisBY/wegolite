# Phase 12: Inert Ships and the World Lifecycle - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md — this log preserves the alternatives considered.

**Date:** 2026-11-14
**Phase:** 12-Inert Ships and the World Lifecycle
**Areas discussed:** D-05 id counter, Inert ship motion, Below 24 fps, AI fault (FOUND-15)

---

## D-05 id counter and the traffic flag

| Option | Description | Selected |
|--------|-------------|----------|
| Keep as is | Seed and start counter independent of the flag; counter differs after populate by mode | ✓ |
| Burn the same ids with traffic off | Equal counters, but an empty world gets a holey counter | |

**User's choice:** Keep as is (recommended)

## Inert ship motion

| Option | Description | Selected |
|--------|-------------|----------|
| Hold placement | No motion; integrator skipped or speed 0 | ✓ |
| Phase 8 placeholder integrator | Constant speed along facing; not Oolite behaviour | |

**User's choice:** Hold placement (recommended)

## Below 24 fps

| Option | Description | Selected |
|--------|-------------|----------|
| Nothing, record the decision | Slow motion stays deliberate; evidence waits for the performance phase | ✓ |
| One-line notice | Threshold, hysteresis and test needed | |
| Auto drop High to Standard | Needs weak-GPU measurements that do not exist | |

**User's choice:** Nothing, record the decision (recommended)

## AI fault (FOUND-15)

| Option | Description | Selected |
|--------|-------------|----------|
| Replace with nullAI | Entity stays, stops thinking, reason recorded | ✓ |
| Remove the entity | Simpler, but the ship vanishes and mass lock drops | |

**User's choice:** Replace with nullAI (recommended)

## Claude's Discretion

- Refusal reason shape for `spawnEntity`; clearing of outside-world id holders; first-populator placement and mass-lock range (research).

## Deferred Ideas

- Planet and sun collision, cargo cost-basis tracking, terminal colour palette setting.
