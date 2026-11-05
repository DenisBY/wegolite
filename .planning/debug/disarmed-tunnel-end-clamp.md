# Debug Session: disarmed-tunnel-end-clamp

## Symptoms

- Expected: a disarmed in-flight ship placed past the 250 m tunnel end, after
  `stepDocking`, is clamped back to the tunnel end with no bounce/docked/scrape
  event and its mode stays `inFlight`.
- Actual: the behaviour exists in code but no committed test exercises it; only
  an ad-hoc Docker check was run during verification.

## Investigation

- `src/sim/dock/step.ts:153-157` clamps `state.position` forward along the port
  frame axis when `classifyCorridor` returns `inside` with
  `snapshot.box.min.z < -port.depth`, and returns before the contact switch, so
  no event is emitted and the mode is untouched.
- `rg -n 'port\.depth|tunnel end|250' tests --glob '*.ts'` finds no assertion.
  `tests/sim/dock-corridor.test.ts:286-308` covers only the non-finite pose
  guard; `tests/sim/dock-capture.test.ts` covers arming/disarming but never
  pushes a disarmed ship past the end.
- Conclusion: regression-coverage gap, not a product defect.

## Root Cause

No committed test exists for the disarmed tunnel-end clamp.

## Fix Direction

Add a sim test that constructs a disarmed in-flight state with
`box.min.z < -port.depth`, calls `stepDocking`, and asserts the clamped
position, `events` empty, and `mode === "inFlight"`.
