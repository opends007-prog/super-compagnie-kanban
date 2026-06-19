#!/usr/bin/env python3
"""
Board Hygiene Script — Keeps Kanban and Jira in sync
=====================================================
Rules:
  - Column = Status (always)
  - Every story must have a parent epic
  - Every story must have an assignee
  - Status changes in Jira must reflect in Kanban

Usage:
  python3 board-hygiene.py            # Fix issues
  python3 board-hygiene.py --check    # Only check, don't fix
  python3 board-hygiene.py --report   # Print report only
"""
import json, subprocess, base64, os, urllib.parse, sys
from datetime import datetime
from collections import defaultdict

JIRA_SITE = "opends007.atlassian.net"
JIRA_EMAIL = "opends007@gmail.com"
JIRA_PROJECT = "TD"
# Auto-detect Kanban location
import os as _os
if _os.path.exists("/home/admin/.openclaw/workspace/super-compagnie-kanban/tickets.json"):
    KANBAN_JSON = "/home/admin/.openclaw/workspace/super-compagnie-kanban/tickets.json"
elif _os.path.exists("/Users/admin/workspace/openclaw-agents/kanban/tickets.json"):
    KANBAN_JSON = "/Users/admin/workspace/openclaw-agents/kanban/tickets.json"
else:
    KANBAN_JSON = "kanban/tickets.json"  # fallback to relative
LOGFILE = "/tmp/board-hygiene.log"

CHECK_ONLY = "--check" in sys.argv
REPORT_ONLY = "--report" in sys.argv

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
                    token = line.strip().split("=",1)[1].strip()
                    if token: return token
    except: pass
    return token

JIRA_TOKEN = _load_token()

def jira(method, url, data=None):
    if not JIRA_TOKEN: return {"error": "no_token"}
    auth = base64.b64encode(f"{JIRA_EMAIL}:{JIRA_TOKEN}".encode()).decode()
    import tempfile
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

def get_all_jira_issues():
    all_issues = []
    next_token = None
    page = 0
    while True:
        page += 1
        url = f"/rest/api/3/search/jql?jql={urllib.parse.quote('project=' + JIRA_PROJECT + ' ORDER BY key ASC')}&maxResults=50"
        if next_token: url += f"&nextPageToken={next_token}"
        url += "&fields=parent,summary,status,issuetype,labels"
        resp = jira("GET", url)
        issues = resp.get("issues", [])
        all_issues.extend(issues)
        if resp.get("isLast", True) or not next_token or len(issues) == 0: break
        next_token = resp.get("nextPageToken")
        if page > 50: break
    return all_issues

def jira_to_kanban_status(jira_status):
    m = {"BACKLOG": "backlog", "To Do": "backlog", "Planned": "planned",
         "In Progress": "in_progress", "Waiting for Support": "waiting",
         "In Validation": "in_validation", "In Review": "in_validation", "Done": "done"}
    return m.get(jira_status, "backlog")

def run():
    log("=" * 60)
    log(f"Board Hygiene Check {'(CHECK ONLY)' if CHECK_ONLY else ''}")
    log("=" * 60)

    issues = []

    # 1. Fetch Jira
    log("Fetching Jira issues...")
    try:
        jira_issues = get_all_jira_issues()
        jira_epics = {i["key"]: i for i in jira_issues if i["fields"]["issuetype"]["name"] == "Epic"}
        jira_stories = {i["key"]: i for i in jira_issues if i["fields"]["issuetype"]["name"] == "Story"}
        log(f"Jira: {len(jira_epics)} epics, {len(jira_stories)} stories")
    except Exception as e:
        log(f"ERROR fetching Jira: {e}")
        issues.append(f"Jira fetch failed: {e}")
        jira_epics = {}
        jira_stories = {}

    # 2. Load Kanban
    kanban = json.load(open(KANBAN_JSON))
    kb_epics = {e["id"]: e for e in kanban.get("epics", [])}
    kb_stories = {t["id"]: t for t in kanban.get("tickets", [])}
    log(f"Kanban: {len(kb_epics)} epics, {len(kb_stories)} stories")

    # 3. Check Kanban stories have correct status
    status_issues = []
    for tid, t in kb_stories.items():
        status = t.get("status", "backlog")
        # Check if status is valid
        valid_statuses = {"backlog", "planned", "in_progress", "waiting", "in_validation", "done"}
        if status not in valid_statuses:
            status_issues.append(f"  {tid}: invalid status '{status}'")

    if status_issues:
        issues.append(f"Invalid statuses: {len(status_issues)}")
        for i in status_issues:
            log(i)

    # 4. Check Kanban stories have parent epic
    orphan_issues = []
    for tid, t in kb_stories.items():
        eid = t.get("epicId")
        if not eid or eid not in kb_epics:
            orphan_issues.append(f"  {tid}: epicId={eid} (missing)")

    if orphan_issues:
        issues.append(f"Orphan stories (no parent epic): {len(orphan_issues)}")
        for i in orphan_issues:
            log(i)

    # 5. Check Kanban stories have assignee
    no_assignee = []
    for tid, t in kb_stories.items():
        if t.get("status") == "done":
            continue
        if not t.get("assigned_to"):
            no_assignee.append(f"  {tid}: {t.get('title', '')[:40]}")

    if no_assignee:
        issues.append(f"Stories without assignee: {len(no_assignee)}")
        for i in no_assignee[:5]:
            log(i)

    # 6. Check Jira → Kanban status sync
    if jira_stories:
        kb_by_jira = {t.get("jira_key", ""): t for t in kb_stories.values()}
        status_mismatches = []
        for jk, js in jira_stories.items():
            if jk in kb_by_jira:
                kb_s = kb_by_jira[jk]
                jira_status = js["fields"].get("status", {}).get("name", "BACKLOG")
                expected = jira_to_kanban_status(jira_status)
                if kb_s.get("status") != expected:
                    status_mismatches.append(f"  {jk}: Kanban={kb_s.get('status')} Jira={jira_status}")

        if status_mismatches:
            issues.append(f"Status mismatches (Jira→Kanban): {len(status_mismatches)}")
            for m in status_mismatches:
                log(m)

    # 7. Fix issues if not check-only
    if not CHECK_ONLY and not REPORT_ONLY:
        fixes = 0

        # Fix status mismatches
        if jira_stories:
            for jk, js in jira_stories.items():
                if jk in kb_by_jira:
                    kb_s = kb_by_jira[jk]
                    jira_status = js["fields"].get("status", {}).get("name", "BACKLOG")
                    expected = jira_to_kanban_status(jira_status)
                    if kb_s.get("status") != expected:
                        kb_s["status"] = expected
                        kb_s["updatedAt"] = datetime.now().isoformat()
                        fixes += 1

        if fixes > 0:
            kanban["stats"]["totalTickets"] = len(kanban["tickets"])
            kanban["last_progress_update"] = datetime.now().isoformat()
            with open(KANBAN_JSON, "w") as f:
                json.dump(kanban, f, indent=2)
            log(f"Fixed {fixes} status mismatches")

    # 8. Summary
    log(f"\n{'='*60}")
    log("HYGIENE REPORT")
    if issues:
        log(f"Issues found: {len(issues)}")
        for issue in issues:
            log(f"  ⚠️ {issue}")
    else:
        log("✅ Board is clean — no issues found")
    log(f"{'='*60}")

    return len(issues) == 0

if __name__ == "__main__":
    run()
