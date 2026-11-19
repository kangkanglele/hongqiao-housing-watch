#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
PYTHON_BIN="${PYTHON:-python3}"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 20+ is required." >&2
  exit 1
fi
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3 is required. Set PYTHON=python if your command is named python." >&2
  exit 1
fi
if ! "$PYTHON_BIN" -c "import playwright" >/dev/null 2>&1; then
  echo "Playwright is missing. Install it with: python3 -m pip install playwright" >&2
  echo "Then install Chromium with: python3 -m playwright install chromium" >&2
  exit 1
fi

echo "==> Syntax checks"
node --check netlify/functions/hq-api.mjs
node --check scripts/mock-preview.mjs
node --check < apps-script/Code.gs.example

echo "==> Netlify gateway simulation"
node tests/test_gateway.mjs

echo "==> Chrome extension queue simulation"
node tests/test_extension.cjs

echo "==> Apps Script / Google Sheets snapshot simulation"
node tests/test_apps_script_snapshot.cjs

echo "==> Local interactive mock server"
node tests/test_mock_preview.mjs

echo "==> Chrome listing extraction simulation"
"$PYTHON_BIN" tests/test_extract.py

echo "==> H5 read-only and PIN UI simulation"
"$PYTHON_BIN" tests/test_h5.py

echo "ALL MOCK TESTS PASSED"
