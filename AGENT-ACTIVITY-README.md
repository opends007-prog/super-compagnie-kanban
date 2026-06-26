# ⚡ Agent Activity & Observability

How Mission Control shows what the agents are *really* doing. **The site shows only reality** — if an
agent is flagged as working, it genuinely logged work recently; if not, it is not flagged as working.

## Data flow (current, real)

```
agents (real-work-executor.py / validate-work.py)
        │  append real events
        ▼
agent-activity.json  ──►  collect-observability.py (cron */10)  ──►  agent-logs.json
        │                                                                  │
        └────────────────────────────►  the static site polls both  ◄──────┘
                                         (git-sync.sh, cron */5, → GitHub Pages)
```

- **`agent-activity.json`** — append-only real event stream, written by the executor and the validator.
- **`collect-observability.py`** (cron `*/10`) — derives `agent-logs.json`: per-ticket events,
  deliverable content, and the **`active`** list = agents with a real event in the **last 30 minutes**.
- The site (`index.html` + `office.js`) polls these static JSON files. No always-on server is required.
  (An older SSE prototype on port 3080 is **not** the current mechanism — ignore it.)

## Real event types

`dispatched` · `working` · `delivered` · `no_deliverable` · `validating` · `validation_pass` ·
`validation_fail`. Each event carries `ts`, `agent` (codename), `ticket`, `event`, `content`, and is
tagged with the engine (`[claude]` / `[openclaw]`).

## Truthfulness model (what the indicators mean)

| Indicator | Meaning |
|-----------|---------|
| 🟢 live marker / "● Live: N" / "🟢 Working now" banner | agent logged a real event in the **last 30 min**. Resting state is **0** — agents run in bursts on the `0 */4` executor cron. |
| Office orb **green** / Team **WORKING** | agent has an `in_progress` ticket **and** is live (really active now). |
| Office orb **amber** / Team **ASSIGNED** / "● Assigned: N" | agent owns an `in_progress` ticket but is **not** currently active (between bursts). |
| Activity feed / per-ticket Work Log / Deliverable view | built purely from real events + real deliverable files. |

`agents[].status` in `tickets.json` is a **dead field** — nothing writes it and no UI reads it. Status
is always derived from real tickets + real activity.

## Integrity guarantee

Every advanced ticket (`done` / `in_validation`) must be backed by a real deliverable artifact
(`workers/<role>/work/<id>-deliverable.md`, >200 b). `verify-work.py` (cron `0 9`) audits this daily;
as of the 2026-06-26 reconciliation there are **0 suspects**. Jira sync has been retired — the board
lives on the VM + GitHub Pages only.
