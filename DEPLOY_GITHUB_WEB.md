# GitHub 网页端上传与 Netlify 首次部署（无需 Node.js）

## A. 更新现有 Apps Script（必须先做）
1. 打开当前正在使用的 Apps Script 项目，先保留现有部署和数据库。
2. 将仓库 `apps-script/Code.gs.example` 的内容复制到现有 `Code.gs`。
3. 只在 Apps Script 编辑器中，把 `SPREADSHEET_ID` 和 `API_TOKEN` 两个占位符替换为你原来使用的值；不要把真实值提交到 GitHub。
4. 保存后进入「部署 → 管理部署」，编辑现有 Web App，选择新版本并部署，保持原 `/exec` 地址不变。不要重建或清空 Google Sheets。

## B. 上传源码
1. 打开 https://github.com/kangkanglele/hongqiao-housing-watch
2. 点击 `Add file` → `Upload files`
3. 在本地解压本项目 ZIP。把解压后的项目内容上传，确保 GitHub 根目录直接看到 `netlify.toml`、`site/`、`netlify/`、`extension/`，不要把所有文件再套一层项目目录。
4. 提交到 `main` 分支（Commit changes）。

## C. Netlify 连接仓库
1. 打开 https://app.netlify.com/projects/hongqiao-housing-watch
2. Project configuration → Build & deploy / Continuous deployment → Link repository
3. 选择 GitHub → `kangkanglele/hongqiao-housing-watch` → `main`
4. Build command 留空；Publish directory 填 `site`。Functions directory 保持 `netlify/functions`（由根目录 `netlify.toml` 指定）。

## D. 配置服务端环境变量
Netlify → Project configuration → Environment variables。分别新增：
- `HQ_GOOGLE_URL`：现有 Apps Script `/exec` URL
- `HQ_GOOGLE_TOKEN`：Apps Script `API_TOKEN`，勾选 Contains secret values
- `HQ_PIN`：自行选择的四位数字（不要使用 `1111`），勾选 Contains secret values；仅作为日常访问门槛
- `HQ_SESSION_SECRET`：至少 32 字节随机值，勾选 Contains secret values

四项都选 All scopes，Same value for all deploy contexts。已有 `HQ_GOOGLE_URL` 就保留，不要重复新增。

保存后进入 Deploys，触发一次新的 production deploy。环境变量更新必须重新部署才会注入 Functions。

## E. 验收
1. 打开 https://hongqiao-housing-watch.netlify.app/，首页应默认进入公开只读模式并自动读取现有 Google Sheets 快照。
2. 进入「数据管理」，输入你在 Netlify 环境变量中设置的 PIN，解锁新增、修改、归档和云端同步。
3. 确认原有小区、房源、历史变动和成交线索都还在；不要执行初始化空库或重置操作。
4. 确认未登录时可以浏览和导出，但不能提交新增、修改或采集写入。
5. 如报 `云端安全配置尚未设置`，检查四项变量是否齐全且 Functions scope 生效。
6. 如 API 404，检查 Functions 是否随仓库部署；不要用静态拖拽部署代替 Git 部署。

## 安全说明

本项目允许公开源代码和房源观察数据。请勿把真实运行凭据提交到仓库。PIN 仅用于防止随手访问和误操作，不提供暴力破解防护；项目不设置输错次数锁定。Google Sheets 的旧快照应保留，不能用“先清空旧数据再写入”的方式提交新版本。
