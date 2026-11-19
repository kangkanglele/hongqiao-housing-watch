#!/bin/bash
set -e
cd "$(dirname "$0")"
if [ -f ".venv/bin/activate" ]; then source ".venv/bin/activate"; fi
bash scripts/test-local.sh
echo
read -n 1 -s -r -p "测试结束，按任意键关闭…"
