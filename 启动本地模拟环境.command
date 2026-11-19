#!/bin/bash
set -e
cd "$(dirname "$0")"
if ! command -v python3 >/dev/null 2>&1; then
  echo "没有找到 Python 3。请先安装 Python 3。"
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi
PORT="${PORT:-4173}"
python3 scripts/mock_preview.py &
SERVER_PID=$!
cleanup(){ kill "$SERVER_PID" 2>/dev/null || true; }
trap cleanup EXIT INT TERM
sleep 1
if ! kill -0 "$SERVER_PID" 2>/dev/null; then
  echo "模拟服务启动失败。请检查端口 $PORT 是否已被占用。"
  wait "$SERVER_PID" || true
  read -n 1 -s -r -p "按任意键关闭…"
  exit 1
fi
open "http://127.0.0.1:$PORT"
wait "$SERVER_PID"
