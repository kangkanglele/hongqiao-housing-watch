@echo off
setlocal
cd /d "%~dp0"
where netlify >nul 2>nul
if errorlevel 1 (
  echo 没有检测到 netlify CLI，请先运行: npm install -g netlify-cli
  pause
  exit /b 1
)
echo.
echo 将把 V3.5 前端和 Netlify Functions 发布到现有的红桥项目。
echo 先确保已经在 Netlify 配置四项服务端环境变量并备份原数据库。
echo.
call netlify link --id 2fa742a8-a464-4db4-8e72-c67a760f7139
if errorlevel 1 (
  echo 项目绑定失败，请运行 netlify login 后重试。
  pause
  exit /b 1
)
call netlify deploy --prod
if errorlevel 1 (
  echo 发布失败，请查看 CLI 输出。原有生产站点不会因为本地文件改动而改变。
  pause
  exit /b 1
)
echo.
echo 命令已完成，请到 Netlify Deploys 检查是否包括 hq-api 函数。
pause
