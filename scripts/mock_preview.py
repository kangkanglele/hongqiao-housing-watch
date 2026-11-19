#!/usr/bin/env python3
"""Python-only local preview for the Hongqiao housing watcher. No Node.js required."""
from __future__ import annotations

import json
import os
import re
import sys
import uuid
from datetime import datetime, timezone
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parents[1]
SITE = (ROOT / "site").resolve()
SESSION = "local-mock-session"
SESSION_ID = uuid.uuid4().hex
MAX_BODY = 6 * 1024 * 1024


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def seed_state() -> dict:
    today = datetime.now().astimezone().date().isoformat()
    scopes = [
        {"id": "SIM-S1", "name": "水木天成翠杨园", "group": "水木天成", "env": "A", "priority": "模拟核心内圈", "note": "仅用于模拟测试"},
        {"id": "SIM-S2", "name": "水木天成依湖园", "group": "水木天成", "env": "B", "priority": "模拟核心内圈", "note": "仅用于模拟测试"},
        {"id": "SIM-S3", "name": "民畅园", "group": "师范附小周边", "env": "B", "priority": "模拟候选", "note": "仅用于模拟测试"},
    ]

    def house(hid, community, title, area, price, floor, total, channel, listing_id, note, elevator="有"):
        host = "m.ke.com" if channel == "贝壳" else "m.5i5j.com"
        url = f"https://{host}/tj/ershoufang/{listing_id}.html"
        return {
            "id": hid, "origin": "本地模拟数据", "community": community, "title": title,
            "area": area, "price": price, "rooms": "2室1厅", "floor": floor, "total": total,
            "floorBand": f"中楼层/{total}层", "elevator": elevator, "noise": "未知",
            "legal": "待核实", "decoration": "简装", "orient": "南", "env": "B",
            "defects": [], "drawbacks": [], "suitability": "待判断", "stage": "观察中",
            "top": False, "duplex": False, "firstSeen": today, "lastSeen": today, "note": note,
            "sources": [{
                "channel": channel, "platformId": listing_id, "url": url, "originalUrl": url,
                "urlType": "模拟官方详情链接", "relation": "仅本地模拟，不对应真实挂牌", "checked": today
            }],
            "events": [{"id": "SIM-EVT-" + hid, "date": today, "kind": "manual", "title": "模拟录入", "desc": "虚构数据，不作为真实市场样本"}],
        }

    return {
        "version": 4, "created": today, "scopes": scopes, "benchmarks": [],
        "marketScans": [], "saleLeads": [],
        "houses": [
            house("SIM-HQ-0001", "水木天成翠杨园", "【模拟】南向两室 · 普通中间楼层", 82.6, 78.8, 5, 7, "贝壳", "00000000001", "用于测试列表、详情、筛选和保存。"),
            house("SIM-HQ-0002", "水木天成依湖园", "【模拟】南北通透小两室", 74.3, 72.0, 3, 6, "我爱我家", "00000000002", "用于测试待核验状态。"),
            house("SIM-HQ-0003", "民畅园", "【模拟】无电梯四层小两室", 56.2, 49.5, 4, 6, "贝壳", "00000000003", "用于测试楼层筛选。", "无"),
        ],
        "quarantine": [], "listingCandidates": [], "linkLedger": [], "visitSessions": [],
        "pageConfig": {},
    }


STATE = seed_state()
VERSION = 1
UPDATED_AT = now_iso()
CONFIG_HASH = "local-config-1"
UPLOADS: dict[str, dict] = {}


class PreviewServer(ThreadingHTTPServer):
    allow_reuse_address = True
    daemon_threads = True


class Handler(BaseHTTPRequestHandler):
    server_version = "HongqiaoMockPreview/1.0"

    def log_message(self, fmt, *args):
        print("[preview] " + (fmt % args), flush=True)

    def send_json(self, status: int, payload: dict):
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("X-Robots-Tag", "noindex")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def read_json(self) -> dict:
        length = int(self.headers.get("Content-Length", "0"))
        if length > MAX_BODY:
            raise ValueError("模拟请求超过 6 MB 限制")
        raw = self.rfile.read(length) if length else b"{}"
        value = json.loads(raw.decode("utf-8"))
        if not isinstance(value, dict):
            raise ValueError("请求内容必须是 JSON 对象")
        return value

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def do_GET(self):
        global STATE, VERSION, UPDATED_AT
        parsed = urlparse(self.path)
        if parsed.path == "/__mock/health":
            return self.send_json(200, {"ok": True, "version": VERSION, "houses": len(STATE["houses"]), "scopes": len(STATE["scopes"]), "updatedAt": UPDATED_AT})
        try:
            relative = unquote(parsed.path).lstrip("/") or "index.html"
            target = (SITE / relative).resolve()
            if target != SITE and SITE not in target.parents:
                return self.send_json(403, {"ok": False, "error": "禁止访问站点目录之外的文件"})
            if not target.is_file():
                return self.send_json(404, {"ok": False, "error": "本地预览文件不存在"})
            body = target.read_bytes()
            if relative == "index.html":
                bootstrap = (
                    '<script>(()=>{const sid=' + json.dumps(SESSION_ID) + ';try{'
                    'if(localStorage.getItem("__HQ_MOCK_SESSION__")!==sid){'
                    '["hongqiao_watch_v1_20261118","HQ_LOCAL_UNSYNCED_V31","HQ_CLOUD_VERSION","HQ_V35_SESSION"].forEach(k=>localStorage.removeItem(k));'
                    'localStorage.setItem("__HQ_MOCK_SESSION__",sid)}}catch(e){}})();</script>'
                )
                banner = """
<style>
#hq-mock-banner{position:fixed;z-index:999999;left:0;right:0;top:0;min-height:42px;box-sizing:border-box;padding:8px 14px;background:#fff2cc;color:#614600;border-bottom:1px solid #e8d49b;display:flex;align-items:center;gap:12px;font:13px/1.4 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08)}
#hq-mock-banner strong{white-space:nowrap}#hq-mock-banner span{flex:1}#hq-mock-banner button{border:1px solid #b58a2a;background:#fffaf0;border-radius:7px;padding:5px 9px;color:#614600;cursor:pointer;font:inherit}
body{padding-top:48px!important}@media(max-width:700px){#hq-mock-banner{font-size:11px;gap:7px;padding:7px 9px}#hq-mock-banner span{max-width:62%}}
</style>
<div id="hq-mock-banner"><strong>本地模拟环境</strong><span>只使用虚构样本；不连接正式 Google Sheets、Apps Script 或 Netlify。PIN 可输入任意四位数字，写入仅保存在本机模拟服务。</span><button id="hq-mock-reset">重置模拟数据</button></div>
<script>
document.getElementById("hq-mock-reset").addEventListener("click",async()=>{
 if(!confirm("重置本地模拟数据？不会影响正式数据库。"))return;
 await fetch("/__mock/reset",{method:"POST"});
 ["hongqiao_watch_v1_20261118","HQ_LOCAL_UNSYNCED_V31","HQ_CLOUD_VERSION","HQ_V35_SESSION"].forEach(k=>localStorage.removeItem(k));
 location.reload();
});
</script>
"""
                html = body.decode("utf-8")
                html = html.replace("<head>", "<head>" + bootstrap, 1)
                html = html.replace("</body>", banner + "</body>", 1)
                body = html.encode("utf-8")
            suffix = target.suffix.lower()
            mime = {
                ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
                ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8",
                ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
                ".jpeg": "image/jpeg", ".webp": "image/webp",
            }.get(suffix, "application/octet-stream")
            self.send_response(200)
            self.send_header("Content-Type", mime)
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Robots-Tag", "noindex")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
        except Exception as exc:
            self.send_json(500, {"ok": False, "error": str(exc)})

    def do_HEAD(self):
        self.do_GET()

    def do_POST(self):
        global STATE, VERSION, UPDATED_AT, CONFIG_HASH, UPLOADS
        path = urlparse(self.path).path
        if path == "/__mock/reset":
            STATE = seed_state()
            VERSION = 1
            UPDATED_AT = now_iso()
            CONFIG_HASH = "local-config-1"
            UPLOADS = {}
            return self.send_json(200, {"ok": True, "version": VERSION, "houses": len(STATE["houses"])})
        if path != "/.netlify/functions/hq-api":
            return self.send_json(404, {"ok": False, "error": "未知本地模拟接口"})
        try:
            data = self.read_json()
        except Exception as exc:
            return self.send_json(400, {"ok": False, "error": str(exc)})
        action = str(data.get("action", ""))
        if action == "login":
            if not re.fullmatch(r"\d{4}", str(data.get("pin", ""))):
                return self.send_json(400, {"ok": False, "error": "请输入任意四位数字 PIN"})
            return self.send_json(200, {"ok": True, "session": SESSION, "expiresIn": 86400000})
        if action == "load":
            return self.send_json(200, {"ok": True, "state": STATE, "version": VERSION, "updatedAt": UPDATED_AT})
        if action == "ping":
            return self.send_json(200, {"ok": True, "version": VERSION})
        if self.headers.get("Authorization", "") != "Bearer " + SESSION:
            return self.send_json(401, {"ok": False, "error": "模拟环境未解锁，请输入任意四位 PIN"})
        if action == "config":
            return self.send_json(200, {"ok": True, "config": STATE.get("pageConfig", {}), "hash": CONFIG_HASH})
        if action == "configSave":
            try:
                config = data.get("config", {})
                if isinstance(config, str):
                    config = json.loads(config)
                if not isinstance(config, dict):
                    raise ValueError("页面配置格式不正确")
                if data.get("expectedHash") and data["expectedHash"] != CONFIG_HASH:
                    return self.send_json(409, {"ok": False, "conflict": True, "version": VERSION, "error": "模拟页面配置版本已变化"})
                STATE["pageConfig"] = config
                CONFIG_HASH = "local-config-" + uuid.uuid4().hex[:12]
                UPDATED_AT = now_iso()
                return self.send_json(200, {"ok": True, "config": config, "hash": CONFIG_HASH})
            except Exception as exc:
                return self.send_json(400, {"ok": False, "error": str(exc)})
        if action == "snapshotCommit":
            expected = data.get("expectedVersion")
            next_state = data.get("state")
            if not isinstance(expected, int) or expected != VERSION:
                return self.send_json(409, {"ok": False, "conflict": True, "version": VERSION, "error": "模拟快照版本已变化"})
            if not isinstance(next_state, dict) or not isinstance(next_state.get("houses"), list) or not isinstance(next_state.get("scopes"), list):
                return self.send_json(400, {"ok": False, "error": "模拟快照缺少 houses 或 scopes"})
            for key in ("benchmarks", "marketScans", "saleLeads", "quarantine", "listingCandidates", "linkLedger", "visitSessions"):
                if not isinstance(next_state.get(key), list):
                    next_state[key] = []
            STATE = next_state
            VERSION += 1
            UPDATED_AT = now_iso()
            return self.send_json(200, {"ok": True, "version": VERSION, "updatedAt": UPDATED_AT, "houses": len(STATE["houses"]), "scopes": len(STATE["scopes"]), "snapshotId": "mock-atomic-commit"})
        if action == "begin":
            upload_id = str(data.get("uploadId", ""))
            if not re.fullmatch(r"[A-Za-z0-9_-]{8,80}", upload_id):
                return self.send_json(400, {"ok": False, "error": "模拟上传编号格式不正确"})
            if int(data.get("expectedVersion", -1)) != VERSION:
                return self.send_json(409, {"ok": False, "conflict": True, "version": VERSION, "error": "本地模拟数据版本已变化，前端应自动合并"})
            UPLOADS[upload_id] = {"expectedVersion": VERSION, "total": 0, "chunks": {}}
            return self.send_json(200, {"ok": True, "uploadId": upload_id, "expectedVersion": VERSION})
        if action == "chunk":
            upload_id = str(data.get("uploadId", ""))
            upload = UPLOADS.get(upload_id)
            if not upload:
                return self.send_json(404, {"ok": False, "error": "找不到这次模拟上传"})
            if upload["expectedVersion"] != VERSION or int(data.get("expectedVersion", -1)) != VERSION:
                return self.send_json(409, {"ok": False, "conflict": True, "version": VERSION, "error": "本地模拟数据版本已变化"})
            try:
                index, total = int(data["index"]), int(data["total"])
                if total < 1 or total > 2000 or index < 0 or index >= total:
                    raise ValueError()
            except Exception:
                return self.send_json(400, {"ok": False, "error": "模拟分片序号不正确"})
            if upload["total"] and upload["total"] != total:
                return self.send_json(400, {"ok": False, "error": "模拟分片总数不一致"})
            upload["total"] = total
            upload["chunks"][index] = str(data.get("data", ""))
            return self.send_json(200, {"ok": True, "index": index})
        if action == "commit":
            upload_id = str(data.get("uploadId", ""))
            upload = UPLOADS.get(upload_id)
            if not upload:
                return self.send_json(404, {"ok": False, "error": "找不到这次模拟上传"})
            if upload["expectedVersion"] != VERSION:
                return self.send_json(409, {"ok": False, "conflict": True, "version": VERSION, "error": "本地模拟数据版本已变化"})
            total = upload["total"]
            if not total or len(upload["chunks"]) != total:
                return self.send_json(400, {"ok": False, "error": "模拟快照尚未上传完整"})
            try:
                next_state = json.loads("".join(upload["chunks"][i] for i in range(total)))
                if not isinstance(next_state.get("houses"), list) or not isinstance(next_state.get("scopes"), list):
                    raise ValueError("模拟快照缺少 houses 或 scopes")
                for key in ("benchmarks", "marketScans", "saleLeads", "quarantine", "listingCandidates", "linkLedger", "visitSessions"):
                    if not isinstance(next_state.get(key), list):
                        next_state[key] = []
                STATE = next_state
                VERSION += 1
                UPDATED_AT = now_iso()
                del UPLOADS[upload_id]
                return self.send_json(200, {"ok": True, "version": VERSION, "updatedAt": UPDATED_AT, "houses": len(STATE["houses"]), "scopes": len(STATE["scopes"]), "snapshotId": upload_id})
            except Exception as exc:
                return self.send_json(400, {"ok": False, "error": str(exc)})
        return self.send_json(400, {"ok": False, "error": "本地模拟接口暂不支持操作：" + action})


def main():
    port = int(os.environ.get("PORT", "4173"))
    server = PreviewServer(("127.0.0.1", port), Handler)
    actual_port = server.server_address[1]
    print("MOCK_PREVIEW_READY http://127.0.0.1:" + str(actual_port), flush=True)
    print("仅绑定 127.0.0.1；不连接或修改正式 Google Sheets。按 Ctrl+C 停止。", flush=True)
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n本地模拟服务已停止。", flush=True)
    finally:
        server.server_close()


if __name__ == "__main__":
    main()
