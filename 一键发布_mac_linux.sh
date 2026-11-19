#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")"
command -v netlify >/dev/null || { echo '请先运行 npm install -g netlify-cli 和 netlify login'; exit 1; }
netlify link --id 2fa742a8-a464-4db4-8e72-c67a760f7139
netlify deploy --prod
echo '请检查 Netlify 项目中 hq-api 函数是否发布成功。'
