#!/usr/bin/env python3
"""
Push Kanban → Jira
==================
Reads tickets.json and pushes status changes, progress updates, comments,
and assignee (agent label) changes to their corresponding Jira issues.

In Jira, the assignee is always the same user (open_ds). Agent assignment
is tracked via labels (e.g., "Argus", "Gladiator"). When the assignee changes
in the Kanban, we add/remove the corresponding label in Jira.

Designed to run as a standalone script or be called from board-hygiene.py.
Run via cron every 30 minutes.

Usage:
    python3 push-kanban-to-jira.py           # Push all pending changes
    python3 push-kanban-to-jira.py --dry-run # Show what would be pushed
"""
import json, os, subprocess, sys, base64, tempfile
from datetime import datetime

JIRA_SITE = "opends007.atlassian.net"
JIRA_EMAIL = "opends007@gmail.com"
KANBAN_JSON = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "kanban", "tickets.json")
LOGFILE = "/tmp/push-kanban-to-jira.log"
DRY_RUN = "--dry-run" in sys.argv

KANBAN_TO_JIRA_STATUS = {
    "backlog": "BACKLOG",
    "planned": "PLANNED",
    "in_progress": "In Progress",
    "waiting": "WAITING FOR SUPPORT",
    "in_validation": "IN VALIDATION",
    "done": "Done",
}

# Map agent ID → Jira label name (display name used as label)
AGENT_ID_TO_LABEL = {
    "lucy": "Lucy",
    "orchestrator": "Zeus",
    "tom": "Gladiator",
    "devops": "Thor",
    "qa": "Athena",
    "security": "Hades",
    "pm": "Iris",
    "research": "Hermes",
    "business-analyst": "Minerva",
    "data-analyst": "Clio",
    "data-engineer": "Vulcan",
    "finance": "Plutus",
    "accounting": "Hestia",
    "budget": "Juno",
    "income": "Fortuna",
    "sentinel": "Nemesis",
    "monitor": "Argus",
    "org-excellence": "Metis",
    "claude": "Claude",
    "ml-engineer": "ML Engineer",
}

def log(msg):
    ts = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    line = f"[{ts}] {msg}"
    print(line)
    with open(LOGFILE, "a") as f:
        f.write(line + "\n")

def _load_token():
    token = os.environ.get("JIRA_API_TOKEN", "")
    if token: return token
    try:
        with open(os.path.expanduser("~/.zshrc")) as f:
            for line in f:
                if line.strip().startswith("export JIRA_API_TOKEN"):
                    return line.strip().split("=", 1)[1].strip()
    except: pass
    return token

JIRA_TOKEN = _load_token()

def jira(method, url, data=None):
    if not JIRA_TOKEN: return {"error": "no_token"}
    auth = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    for attempt in range(1, 4):
        cmd = ["curl", "-s", "-X", method, f"https://{JIRA_SITE}{url}",
               "-H", f"Authorization: Basic {auth}", "-H", "Content-Type: application/json"]
        pf = None
        if data:
            with tempfile.NamedTemporaryFile(mode="w", suffix=".json", delete=False) as tf:
                json.dump(data, tf); pf = tf.name
            cmd += ["-d", f"@{pf}"]
        try:
            result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
            if pf: os.unlink(pf)
            if not result.stdout.strip():
                if attempt < 3:
                    import time; time.sleep(2 * attempt)
                    continue
                return {"error": "empty_response"}
            return json.loads(result.stdout)
        except Exception as e:
            if pf and os.path.exists(pf): os.unlink(pf)
            if attempt < 3:
                import time; time.sleep(2 * attempt)
                continue
            return {"error": str(e)[:200]}
    return {"error": "max_retries"}

def get_jira_issue(key):
    return jira("GET", f"/rest/api/3/issue/{key}?fields=status,labels")

def get_transitions(key):
    return jira("GET", f"/rest/api/3/issue/{key}/transitions")

def push_status(jira_key, kanban_status):
    jira_status = KANBAN_TO_JIRA_STATUS.get(kanban_status, "To Do")
    issue = get_jira_issue(jira_key)
    if "error" in issue:
        return False, f"fetch error: {issue['error']}"

    current = issue.get("fields", {}).get("status", {}).get("name", "")
    if current == jira_status:
        return True, "already in sync"

    if DRY_RUN:
        return True, f"WOULD PUSH: {current} → {jira_status}"

    transitions = get_transitions(jira_key)
    for tr in transitions.get("transitions", []):
        if tr["name"] == jira_status:
            result = jira("POST", f"/rest/api/3/issue/{jira_key}/transitions",
                         {"transition": {"id": tr["id"]}})
            if "error" not in result:
                return True, f"{current} → {jira_status}"
            return False, f"transition error: {result['error']}"

    available = [t["name"] for t in transitions.get("transitions", [])]
    return False, f"no transition {current}→{jira_status} (available: {available})"

def push_label(jira_key, label_name, action="add"):
    """Add or remove a label from a Jira issue."""
    if action == "add":
        body = {"update": {"labels": [{"add": label_name}]}}
    else:
        body = {"update": {"labels": [{"remove": label_name}]}}
    if DRY_RUN:
        return True, f"WOULD {action.upper()} label: {label_name}"
    result = jira("PUT", f"/rest/api/3/issue/{jira_key}", body)
    if "error" not in result:
        return True, f"{action}ed label: {label_name}"
    return False, f"label error: {result['error']}"

def push_assignee(jira_key, old_agent_id, new_agent_id):
    """Sync assignee change to Jira labels."""
    ok_msgs = []
    # Remove old label
    if old_agent_id:
        old_label = AGENT_ID_TO_LABEL.get(old_agent_id, old_agent_id)
        ok, msg = push_label(jira_key, old_label, "remove")
        if ok:
            ok_msgs.append(f"removed {old_label}")
        else:
            return False, msg
    # Add new label
    if new_agent_id:
        new_label = AGENT_ID_TO_LABEL.get(new_agent_id, new_agent_id)
        ok, msg = push_label(jira_key, new_label, "add")
        if ok:
            ok_msgs.append(f"added {new_label}")
        else:
            return False, msg
    return True, ", ".join(ok_msgs) if ok_msgs else "no change"

def push_comment(jira_key, author, text):
    body = {
        "body": {
            "type": "doc", "version": 1,
            "content": [{"type": "paragraph", "content": [{"type": "text", "text": f"[{author}] {text}"}]}]
        }
    }
    if DRY_RUN:
        return True, f"WOULD COMMENT: [{author}] {text[:50]}"
    result = jira("POST", f"/rest/api/3/issue/{jira_key}/comment", body)
    if "error" not in result:
        return True, f"comment by {author}"
    return False, f"comment error: {result['error']}"

def run():
    log("=" * 50)
    log(f"Push Kanban → Jira {'(DRY RUN)' if DRY_RUN else ''}")

    # Load kanban
    try:
        data = json.load(open(KANBAN_JSON))
    except Exception as e:
        log(f"ERROR loading kanban: {e}")
        return

    tickets = [t for t in data.get("tickets", []) if t.get("jira_key")]
    log(f"Processing {len(tickets)} tickets with jira_key")

    pushed_status = 0
    pushed_comments = 0
    pushed_progress = 0
    pushed_assignees = 0
    errors = 0

    for t in tickets:
        jk = t["jira_key"]
        kb_status = t.get("status", "backlog")

        # 1. Push status if changed
        expected_jira = KANBAN_TO_JIRA_STATUS.get(kb_status)
        issue = get_jira_issue(jk)
        if "error" not in issue:
            current = issue.get("fields", {}).get("status", {}).get("name", "")
            if current != expected_jira:
                ok, msg = push_status(jk, kb_status)
                if ok:
                    pushed_status += 1
                    log(f"  ✅ {jk}: {msg}")
                else:
                    errors += 1
                    log(f"  ❌ {jk}: {msg}")

        # 2. Push assignee change (sync to Jira labels)
        kb_assignee = t.get("assigned_to", "")
        pushed_assignee = t.get("pushed_assignee", "")
        if kb_assignee != pushed_assignee:
            ok, msg = push_assignee(jk, pushed_assignee, kb_assignee)
            if ok:
                pushed_assignees += 1
                if not DRY_RUN:
                    t["pushed_assignee"] = kb_assignee
                log(f"  ✅ {jk}: {msg}")
            else:
                errors += 1
                log(f"  ❌ {jk}: {msg}")

        # 3. Push new comments
        comments = t.get("comments", [])
        pushed = t.get("pushed_comments", [])
        for c in comments:
            c_key = f"{c.get('by','')}:{c.get('text','')[:60]}"
            if c_key not in pushed:
                ok, msg = push_comment(jk, c.get("by", "agent"), c.get("text", ""))
                if ok:
                    pushed_comments += 1
                    if not DRY_RUN:
                        if "pushed_comments" not in t:
                            t["pushed_comments"] = []
                        t["pushed_comments"].append(c_key)
                    log(f"  ✅ {jk}: {msg}")
                else:
                    errors += 1
                    log(f"  ❌ {jk}: {msg}")

        # 4. Push progress updates
        progress = t.get("progress")
        last_pushed = t.get("pushed_progress", -1)
        if progress is not None and progress != last_pushed and progress > 0:
            eta = t.get("eta_hours", 0)
            text = f"Progress: {progress}%"
            if eta and eta > 0:
                text += f" (~{eta}h remaining)"
            ok, msg = push_comment(jk, "board-sync", text)
            if ok:
                pushed_progress += 1
                if not DRY_RUN:
                    t["pushed_progress"] = progress
                log(f"  ✅ {jk}: {msg}")
            else:
                errors += 1
                log(f"  ❌ {jk}: {msg}")

    # Save updated kanban (with pushed markers)
    if not DRY_RUN and (pushed_status or pushed_comments or pushed_progress or pushed_assignees):
        data["last_progress_update"] = datetime.now().isoformat()
        with open(KANBAN_JSON, "w") as f:
            json.dump(data, f, indent=2)
        log(f"Saved kanban with pushed markers")

    log(f"\nResults: {pushed_status} statuses, {pushed_assignees} assignees, {pushed_comments} comments, {pushed_progress} progress pushed, {errors} errors")
    log("=" * 50)

if __name__ == "__main__":
    run()
