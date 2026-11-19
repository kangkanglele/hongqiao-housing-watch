import json
import os
import re
import subprocess
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SCRIPT = ROOT / "scripts" / "mock_preview.py"
env = dict(os.environ)
env["PORT"] = "0"
proc = subprocess.Popen([sys.executable, str(SCRIPT)], cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
try:
    line = proc.stdout.readline().strip()
    match = re.search(r"(http://127\.0\.0\.1:\d+)", line)
    assert match, "mock preview did not start: " + line
    base = match.group(1)

    def request(path, body=None, token=None, allow_error=False):
        data = None if body is None else json.dumps(body, ensure_ascii=False).encode("utf-8")
        headers = {"Content-Type": "application/json"}
        if token:
            headers["Authorization"] = "Bearer " + token
        req = urllib.request.Request(base + path, data=data, headers=headers, method="GET" if body is None else "POST")
        try:
            with urllib.request.urlopen(req, timeout=5) as response:
                return response.status, json.loads(response.read().decode("utf-8")) if "json" in response.headers.get("Content-Type", "") else response.read().decode("utf-8")
        except urllib.error.HTTPError as exc:
            if not allow_error:
                raise
            return exc.code, json.loads(exc.read().decode("utf-8"))

    status, html = request("/")
    assert status == 200 and "本地模拟环境" in html and "不连接正式 Google Sheets" in html
    status, merge_js = request("/sync-merge.js")
    assert status == 200 and "HQSyncMerge" in merge_js
    status, health = request("/__mock/health")
    assert status == 200 and health["houses"] == 3 and health["version"] == 1

    status, loaded = request("/.netlify/functions/hq-api", {"action": "load"})
    assert status == 200 and len(loaded["state"]["houses"]) == 3
    status, login = request("/.netlify/functions/hq-api", {"action": "login", "pin": "1234"})
    assert status == 200 and login["ok"]
    token = login["session"]

    status, denied = request("/.netlify/functions/hq-api", {"action": "begin", "uploadId": "mock-upload-0001", "expectedVersion": 1}, allow_error=True)
    assert status == 401, "write actions must require local mock PIN session"

    status, begin = request("/.netlify/functions/hq-api", {"action": "begin", "uploadId": "mock-upload-0001", "expectedVersion": 1}, token)
    assert status == 200 and begin["ok"]
    next_state = loaded["state"]
    next_state["houses"][0]["note"] = "PYTHON-LOCAL-MOCK-SYNC"
    payload = json.dumps(next_state, ensure_ascii=False, separators=(",", ":"))
    size = 320
    chunks = [payload[i:i + size] for i in range(0, len(payload), size)]
    for index, chunk in enumerate(chunks):
        status, result = request("/.netlify/functions/hq-api", {
            "action": "chunk", "uploadId": "mock-upload-0001", "index": index,
            "total": len(chunks), "expectedVersion": 1, "data": chunk
        }, token)
        assert status == 200 and result["ok"]
    status, committed = request("/.netlify/functions/hq-api", {"action": "commit", "uploadId": "mock-upload-0001"}, token)
    assert status == 200 and committed["version"] == 2
    status, read_back = request("/.netlify/functions/hq-api", {"action": "load"})
    assert status == 200 and read_back["state"]["houses"][0]["note"] == "PYTHON-LOCAL-MOCK-SYNC"

    status, conflict = request("/.netlify/functions/hq-api", {
        "action": "begin", "uploadId": "mock-upload-0002", "expectedVersion": 1
    }, token, allow_error=True)
    assert status == 409 and conflict["conflict"] and conflict["version"] == 2

    # New H5 path: one authenticated atomic POST; no 380-character GET-chunk series.
    modified = read_back["state"]
    modified["houses"][0]["note"] = "PYTHON-ATOMIC-H5-SAVE"
    status, saved = request("/.netlify/functions/hq-api", {
        "action": "snapshotCommit", "expectedVersion": 2, "state": modified
    }, token)
    assert status == 200 and saved["version"] == 3
    status, read_back = request("/.netlify/functions/hq-api", {"action": "load"})
    assert read_back["state"]["houses"][0]["note"] == "PYTHON-ATOMIC-H5-SAVE"
    status, stale = request("/.netlify/functions/hq-api", {
        "action": "snapshotCommit", "expectedVersion": 2, "state": modified
    }, token, allow_error=True)
    assert status == 409 and stale["version"] == 3

    status, reset = request("/__mock/reset", {})
    assert status == 200 and reset["version"] == 1 and reset["houses"] == 3
    print("PASS Python-only mock preview: local banner, isolated seed, PIN gate, snapshot write/read-back, version conflict, reset")
finally:
    proc.terminate()
    try:
        proc.wait(timeout=5)
    except subprocess.TimeoutExpired:
        proc.kill()
        proc.wait(timeout=5)
