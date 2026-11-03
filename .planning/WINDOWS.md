---
schema_version: 1
open_count: 0
waived_count: 0
fixed_count: 1
total_count: 1
last_updated: 2026-11-03T13:45:38.860Z
---

# Broken Windows Ledger

> Cross-phase defect register. With `workflow.windows_enforce` enabled, `/gsd-ship` blocks while `open_count > 0`.
> Waive with `gsd-tools windows waive <id> "<reason>"` (reason required).
> Mark fixed with `gsd-tools windows fixed <id>`.

| id | phase | kind | file | line | description | status | reason | recorded_at | resolved_at |
|----|-------|------|------|------|-------------|--------|--------|-------------|-------------|
| 1 | 02 | unrun-verify | public/models/coriolis.glb |  | Visual letterbox check (dock opening reads correctly, not mirrored; faceplate proud of the hull) is deferred to end-of-phase verification because workflow.human_verify_mode is end-of-phase. | fixed |  | 2026-11-03T12:21:05.714Z | 2026-11-03T13:45:38.860Z |

````json
[
  {
    "id": 1,
    "kind": "unrun-verify",
    "phase": "02",
    "file": "public/models/coriolis.glb",
    "line": null,
    "description": "Visual letterbox check (dock opening reads correctly, not mirrored; faceplate proud of the hull) is deferred to end-of-phase verification because workflow.human_verify_mode is end-of-phase.",
    "status": "fixed",
    "reason": "",
    "recorded_at": "2026-11-03T12:21:05.714Z",
    "resolved_at": "2026-11-03T13:45:38.860Z",
    "milestone": null
  }
]
````
