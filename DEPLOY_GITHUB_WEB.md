# GitHub 网页端上传与 Netlify 首次部署（无需 Node.js）

## A. 上传源码
1. 打开 https://github.com/kangkanglele/hongqiao-housing-watch
2. 点击 `Add file` → `Upload files`
3. 在本地解压本项目 ZIP。把解压后的项目内容上传，确保 GitHub 根目录直接看到 `netlify.toml`、`site/`、`netlify/`、`extension/`，不要把所有文件再套一层项目目录。
4. 提交到 `main` 分支（Commit changes）。

## B. Netlify 连接仓库
1. 打开 https://app.netlify.com/projects/hongqiao-housing-watch
2. Project configuration → Build & deploy / Continuous deployment → Link repository
3. 选择 GitHub → `kangkanglele/hongqiao-housing-watch` → `main`
4. Build command 留空；Publish directory 填 `site`。Functions directory 保持 `netlify/functions`（由根目录 `netlify.toml` 指定）。

## C. 配置服务端环境变量
Netlify → Project configuration → Environment variables。分别新增：
- `HQ_GOOGLE_URL`：现有 Apps Script `/exec` URL
- `HQ_GOOGLE_TOKEN`：Apps Script `API_TOKEN`，勾选 Contains secret values
- `HQ_PIN`：`1111`，勾选 Contains secret values
- `HQ_SESSION_SECRET`：至少 32 字节随机值，勾选 Contains secret values

四项都选 All scopes，Same value for all deploy contexts。已有 `HQ_GOOGLE_URL` 就保留，不要重复新增。

保存后进入 Deploys，触发一次新的 production deploy。环境变量更新必须重新部署才会注入 Functions。

## D. 验收
1. 打开 https://hongqiao-housing-watch.netlify.app/
2. 数据管理输入 PIN `1111`
3. 应读取原 Google Sheets 快照，而不是初始化空库
4. 如报 `云端安全配置尚未设置`，检查四项变量是否齐全且 Functions scope 生效
5. 如 API 404，检查 Functions 是否随仓库部署；不要用静态拖拽部署代替 Git 部署
