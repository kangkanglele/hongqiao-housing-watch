#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
PYTHON_BIN="${PYTHON:-python3}"

if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "需要 Python 3。Mac 通常已自带 python3。"
  exit 1
fi

echo "==> Python-only local preview test (no Node.js required)"
"$PYTHON_BIN" tests/test_mock_preview_python.py

if command -v node >/dev/null 2>&1; then
  echo "==> JavaScript syntax checks"
  node --check netlify/functions/hq-api.mjs
  node --check scripts/mock-preview.mjs
  node --check extension/media-upload.js
  node --check extension/extract.js
  node --check site/media-client.js
  node --check extension/background.js
  node --check extension/popup.js
  node --check extension/status-overlay.js
  node --check site/sync-merge.js
  node --check < apps-script/Code.gs.example

  echo "==> Concurrent sync merge unit test"
  node tests/test_sync_merge.cjs

  echo "==> Netlify gateway simulation"
  node tests/test_gateway.mjs

  echo "==> Chrome extension popup and sync simulation"
  node tests/test_extension.cjs

  echo "==> Draft Drive media and listing-image tests (offline)"
  node tests/test_media_draft.cjs

  echo "==> Visit V2 status and capture-time timeline tests (offline)"
  node tests/test_visit_v2.cjs

  echo "==> Market record page: individual-listing events only (offline)"
  node tests/test_market_records.cjs

  echo "==> Apps Script / Google Sheets snapshot simulation"
  node tests/test_apps_script_snapshot.cjs

  echo "==> Apps Script Google Drive media resumable-upload simulation"
  node tests/test_apps_script_media.cjs

  echo "==> Node-based local mock server regression"
  node tests/test_mock_preview.mjs
else
  echo "==> Node.js is not installed; skipped Node-only tests."
  echo "    GitHub Actions runs the complete Node.js regression suite automatically."
fi

if "$PYTHON_BIN" -c "import playwright" >/dev/null 2>&1; then
  echo "==> Chrome listing extraction simulation"
  "$PYTHON_BIN" tests/test_extract.py

  echo "==> H5 UI and automatic cloud-conflict merge simulation"
  "$PYTHON_BIN" tests/test_h5.py
else
  echo "==> Playwright is not installed; skipped browser-based tests."
  echo "    Install with: python3 -m pip install playwright"
  echo "    Then run: python3 -m playwright install chromium"
fi

echo "LOCAL TESTS COMPLETED"
