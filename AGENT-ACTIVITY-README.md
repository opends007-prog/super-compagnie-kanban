# ⚡ Agent Activity Stream

Real-time feed of all internal agent communications in Super Compagnie Mission Control.

## Features

- **Live scrolling feed** — Auto-updates every 5 seconds with new agent activity
- **Filter by agent** — Dropdown to show only one agent's activity
- **Filter by keyword** — Text filter for message content
- **Pause/Resume** — Pause auto-scroll to review, then resume
- **Clear** — Clear all displayed events
- **Timestamps** — All times shown in EDT
- **Event types** — Color-coded: jira_update, status_change, comment, assignment, system

## Architecture

```
┌─────────────────────┐     ┌──────────────────────┐     ┌─────────────────┐
│  Mission Control    │────▶│  Activity Server     │────▶│  Agent          │
│  (Frontend Tab)     │◀────│  (Python SSE)        │◀────│  Workspaces     │
│  SSE polling        │     │  Port 3080           │     │  (VM)           │
└─────────────────────┘     └──────────────────────┘     └─────────────────┘
```

## Running Locally

### 1. Start the Activity Server (on VM)

```bash
cd /Users/admin/workspace/openclaw-agents
python3 scripts/agent-activity-server.py
```

The server will start on port 3080 and begin polling agent workspaces.

### 2. Serve the Frontend

Since the Activity tab polls `agent-activity.json`, you can also run without the server:

```bash
# Simple static server
cd kanban && python3 -m http.server 8080
```

Then open `http://localhost:8080` and click the ⚡ Activity tab.

### 3. Full Production (with real-time SSE)

Update the frontend `activityFetchEvents()` to point to the SSE endpoint:

```javascript
// In index.html, replace the fetch URL:
fetch('http://companyserver:3080/api/agent-events?t='+Date.now())
```

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/agent-stream` | GET | Server-Sent Events stream |
| `/api/agent-events` | GET | JSON list of recent events |
| `/health` | GET | Health check |

## Event JSON Format

```json
{
  "timestamp": 1750000000000,
  "agent": "Iris",
  "emoji": "🌈",
  "type": "jira_update",
  "content": "Moved TICKET-032 to In Progress"
}
```

## Event Types

| Type | Color | Description |
|------|-------|-------------|
| `jira_update` | 🔵 Blue | Jira board changes |
| `status_change` | 🟢 Green | Ticket status changes |
| `comment` | 🟠 Orange | New comments on tickets |
| `assignment` | 🟣 Purple | Ticket assignments |
| `system` | ⚪ Gray | System events |

## Files

| File | Purpose |
|------|---------|
| `index.html` | Frontend tab (added ⚡ Activity tab) |
| `agent-activity.json` | Static fallback JSON feed |
| `scripts/agent-activity-server.py` | Backend SSE server |
