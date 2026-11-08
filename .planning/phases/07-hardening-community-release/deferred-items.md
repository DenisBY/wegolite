# Deferred items: phase 07

Out-of-scope discoveries logged during execution. Not fixed by the plan that found them.

## From 07-10 (README hardening)

- **Shipped WebGL2 fallback names Safari.** `src/app/fallback.ts` (`WEBGL2_FALLBACK_MESSAGE`) reads "Try a current Chrome, Firefox or Safari with hardware acceleration enabled." The README Supported browsers section claims only current stable Chrome and Firefox (D-07), and `tests/compliance.test.ts` forbids Safari and WebKit only in README.md, AGENTS.md, compose.yaml and Dockerfile, so this app string is not covered by any guard. Resolve with the owner's Safari decision (ROADMAP criterion 2 and QUAL-02 versus D-07), recorded in plan 07-11, and then align the message and any test that pins it.
