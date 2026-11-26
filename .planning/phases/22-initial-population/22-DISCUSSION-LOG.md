# Phase 22: Initial Population - Discussion Log

> **Audit trail only.** Do not use as input to planning, research, or execution agents.
> Decisions are captured in CONTEXT.md. This log preserves the alternatives considered.

**Date:** 2026-11-26
**Phase:** 22-initial-population
**Areas discussed:** Placement at the station, Oracle size, Entity cap overflow, Real-Oolite spike

---

## Placement at the station

| Option | Description | Selected |
|--------|-------------|----------|
| Oolite + measure | Exact Oolite placement through the existing samplers. The census counts launch-corridor hits, and any hit becomes a todo with a tripwire that Phase 23 closes | ✓ |
| Exclusion zone at the dock | Temporarily keep ships out of the launch corridor (FIDELITY row). The extra rejections move draws away from the oracle | |
| Measure first, then decide | Research measures the frequency, and the owner decides mid-phase | |

**User's choice:** Oolite + measure.

---

## Oracle size

| Option | Description | Selected |
|--------|-------------|----------|
| ~32 systems × 3 seeds | Stratified: governments, economy, tech, isolated, bottleneck, largest anarchy, several galaxies | ✓ |
| All of galaxy 0 (256) × 1 seed | Broad, one seed, megabytes of fixtures | |
| Minimum (~6-8 systems) | Only what criterion 1 names | |

**User's choice:** ~32 systems × 3 seeds.
**Notes:** The owner asked whether the oracle size affects gameplay. The answer: no, it is test coverage only. The game populates all 2,048 systems either way; the sample decides which port bugs the tests catch.

---

## Entity cap overflow

| Option | Description | Selected |
|--------|-------------|----------|
| Skip and continue + reserve | A group that does not fit is skipped, later groups may still fit, and the debris reserve comes from measurement | ✓ |
| Stop populating | Stop at the first group that does not fit | |
| Rule after measurement | The census first, then the owner decides | |

**User's choice:** Skip and continue + reserve.

---

## Real-Oolite spike

| Option | Description | Selected |
|--------|-------------|----------|
| One plan, non-blocking | At most two attempts per obstacle. Success = census for one anarchy and one quiet system plus a repeat script; failure is recorded | ✓ |
| Minimum: start-system choice only | Census itself in Phase 26 | |
| Drop the spike | QUAL-13 compares against the oracle only (roadmap change) | |

**User's choice:** One plan, non-blocking.

## Claude's Discretion

- The plan split after the recorder plan; the neighbourhood-facts method; the debris-reserve number; the corridor-hit measurement method.

## Deferred Ideas

None.
