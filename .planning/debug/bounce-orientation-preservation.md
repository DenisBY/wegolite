# Debug Session: bounce-orientation-preservation

## Symptoms

- Expected: through a straddle or hull contact, `stepDocking` emits exactly one
  `bounce`, leaves the orientation quaternion unchanged, and keeps the mode
  `inFlight`.
- Actual: the behaviour exists in code but no committed test asserts orientation
  invariance; only an ad-hoc Docker check observed `unchanged: true`.

## Investigation

- `src/sim/dock/step.ts` `respondToContact` adjusts `speed` and `impulse` and
  returns a `bounce` event; it never writes `state.orientation`.
- `tests/sim/dock-no-trap.test.ts:65-82` captures the quaternion components but
  asserts only that they are finite. `tests/sim/dock-hull.test.ts` covers hull
  contact but not orientation invariance.
- Conclusion: regression-coverage gap, not a product defect.

## Root Cause

No committed test asserts orientation preservation through a bounce.

## Fix Direction

Add a sim test that records the quaternion before a straddle or hull contact,
calls `stepDocking`, and asserts exactly one bounce event, a deep-equal
orientation, and `mode === "inFlight"`.
