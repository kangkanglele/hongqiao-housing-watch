# 红桥房源观察站 0.5

本仓库用于红桥房源观察站 H5、Netlify 服务端网关、Google Sheets 同步接口和 Chrome 一键采集扩展的开发与维护。

## 目录结构

- `site/index.html`：H5 前端
- `netlify/functions/hq-api.mjs`：Netlify 服务端网关；`HQ_GOOGLE_TOKEN` 只在 Netlify Functions 环境变量中，Apps Script 侧 `API_TOKEN` 只留在 Apps Script 服务端
- `apps-script/Code.gs.example`：不含真实凭据的 Apps Script 模板；部署时替换占位符
- `netlify.toml`：Netlify 发布目录与 Functions 配置
- `extension/`：Chrome Manifest V3 扩展，独立安装
- `tests/`：网关、扩展、Apps Script、H5 和本地模拟环境的回归测试
- `scripts/mock-preview.mjs`：本机交互式模拟预览服务
- `scripts/test-local.sh`：一条命令运行完整本地模拟测试


## 开发中：看房模块 V2（已按 HTML 原型调整，尚未发布）

经用户确认，界面改为两部分：**待看房源**、**看房历史**；不再设置「今日待看」、按日期建立行程、新建行程按钮或统计卡片。

- 房源单独持有三个选项：`未看`（仅入库）、`看房`（永久列在待看，直到手动更改）、`看过`（离开待看，进入历史）。
- Chrome Popup 先选择看房状态，再主动点击「采集并加入房源」；价格、面积和楼层等仍自动抓取；默认新房源是`未看`。重复采集已有房源时，若未主动改变下拉选项，不会重置原看房状态。
- 手工新增房源、修改现有房源基础属性、房源详情编辑入口都能设置看房状态；改状态不影响缺点、价格和房源原始链接。
- 历史时间轴：仅采用**用户实地上传**照片/视频中的有效拍摄时间，取最早的有效拍摄时间；不使用网站抓取的照片、上传日期或浏览日期。缺少有效素材时间时，用设置「看过」的时间。
- JPG/JPEG 会尝试读取 EXIF DateTimeOriginal；MP4/MOV 会尝试读取容器创建时间（可能为转码时间，正式上线前必须实测）；不具备可信拍摄时间的文件回退到状态时间。
- 旧版 `visitSessions` 数据保留，旧带看记录可用于兼容显示；不删除、不重置已有房源或历史。
- 代码只提交到 `feature/drive-media-gallery-draft`，不发布 Netlify、不修改正式 Apps Script、不更新已安装的 Chrome 扩展。正式合并前运行 `bash scripts/test-local.sh`，其中 `tests/test_visit_v2.cjs` 是新增加的离线回归测试。

## 开发中：Google Drive 媒体库（尚未发布）

> 只在 `feature/drive-media-gallery-draft` 分支。**未合并 main，未修改正式 Apps Script 部署，未部署 Netlify，也未更新用户本机 Chrome 插件。** GitHub 上的代码不等于线上功能已经可用。

本分支追加了：
- 网站房源：支持用户主动打开的贝壳、链家、我爱我家单套详情；读取页面已出现的主图与房源相册图片地址，不访问未浏览的页面，不绕过验证码；插件可选归档一张主图或最多八张图片。
- 图片持久化：扩展从官方图片 CDN 读取文件，逐块上传 Google Drive；成功后通过房源编号关联媒体索引到 Google Sheets。失败保留本地待传元数据和原始图片地址，重试时不删除房源正文。
- 现场影像：在房源详情内多选 JPG/PNG/WebP、MP4/MOV/WebM 原文件，单个文件上限 120MB，上传前先写入浏览器 IndexedDB 待传队列；媒体字节不会被写入 Sheets 快照。
- 向后兼容：原有的 `photoData` 单图缩略图仍保留；新增的 `media[]` 只追加，不清空历史文件。媒体的极小预览图（如有）仍可能缓存到快照以供列表显示，不是原图。
- 私有权限：Drive 文件归上传时执行 Apps Script 的 Google 账号所有，**不设置公开分享**；当前 H5 打开原文件会跳到 Google Drive，由 Google 账户权限决定是否能够查看。当前房源数据库的公开只读快照仍可能暴露文件名、Drive 文件 ID、来源 URL 和少量缩略图，**不能当成隐私保险箱**。正式上线前如有敏感实拍内容，应升级公开读取权限。

### Google 授权和分块协议

浏览器 → PIN 授权 Netlify 网关 → Apps Script（私有服务端 Token）→ Drive Resumable Upload API。Apps Script 自己发起并保存 Drive 上传 session URL，客户端只收到随机 uploadId，不会拿到 Google OAuth Token、会话 URL 或服务端密钥；每块 512 KiB，上传会话在脚本缓存中，最长保留 6 小时，过期可从本地队列重新开始。Google Sheets 只保存引用信息和少量缩略图。文件保存在执行 Apps Script 的 Google 账号 Drive 下的「红桥房源观察站媒体库」文件夹。

### 本地验证

运行 `bash scripts/test-local.sh`，新增 `tests/test_media_draft.cjs` 做离线页面图片识别、链接域名白名单和多块传输模拟。**这不是线上 Google Drive 上传测试。**

### 发布前必须验证

1. 备份现有 Google Sheets 的云端状态，检查当前 Apps Script、Netlify 生产部署版本，并确认 GitHub `main` 不包含此分支代码。
2. 在**单独测试用 Apps Script 部署和测试 Drive 文件夹**下，授权 Drive/UrlFetch 所需权限，确认运行身份就是应拥有素材的 Google 账号；检查 512KB 分块、网络中断重试、120MB 以内视频、私人文件默认权限。
3. 在真实贝壳/链家/我爱我家单套页面测试一张和多张图片，检查官网反盗链、惰性加载、误抓推荐房源和下架后原地址失效场景。无权读取的图片必须保持未归档状态。
4. 核对房源媒体去重、未匹配小区的暂存记录、H5 新增照片、历史缩略图、移动端上传进度，确认任意媒体同步失败不会删除房源正文。
5. **等用户明确同意整体发布时**，才合并到 `main` 并升级正式 Apps Script，手动重新部署已安装 Chrome 插件。当前分支不会自动完成生产部署。


## 0.5 基础同步链路

- Chrome 扩展把房源先保存到本地队列；只有云端确认成功后才从队列移除。
- H5 打开/刷新时读取一次云端最新快照；切回浏览器标签、恢复网络、切换 H5 主要导航/筛选时按需轻量检查版本。**无空闲后台定时轮询**，多个连续事件去重。
- H5 新增、修改、评价房源时立即保存本地，并在约 1.4 秒防抖后**自动上传云端**；失败保留本地数据，下一次正常操作可继续补传。
- H5 保存复用 Netlify 网关的 `snapshotCommit` 单次 JSON POST。版本冲突时自动合并双方快照并重试，避免旧版分片 GET 导致长时间等待成功状态。
- Netlify 网关读取当前快照、合并单套房源，再通过一次 JSON POST 调用 Apps Script 的 `snapshotCommit`；不再把一个快照拆成 24 次 GET 请求。
- Apps Script 在锁内校验版本，追加完整快照，并按主键更新明细表；相同 `uploadId` 重试不会重复写入。
- 旧 GET `ping/load/begin/chunk/commit/config/configSave` 保留兼容。

## 开发、模拟与发布

### 本地模拟预览（不需要 Node.js）

**Mac 最简单的方式：** 双击仓库根目录的 `启动本地模拟环境.command`。它会自动切换到项目目录、启动 Python 模拟服务并打开浏览器。关闭终端窗口或按 Ctrl+C 即可停止。

也可以在终端运行：

```bash
cd /你的路径/hongqiao-housing-watch
python3 scripts/mock_preview.py
```

然后打开 http://127.0.0.1:4173 。本地预览只需要 Mac 上的 Python 3；不需要 Node.js、npm、Playwright 或安装其他依赖。不要在用户主目录 `~` 下直接执行相对路径命令，必须从项目目录运行；双击启动器会自动处理目录。

页面顶部会显示「本地模拟环境」提示。模拟环境有以下隔离措施：

- 只绑定本机 `127.0.0.1`，不会对外网开放。
- 使用虚构房源和虚构房源编号，不代表真实挂牌。
- 不连接正式 Netlify Functions、Google Sheets 或 Apps Script。
- PIN 可输入任意四位数字；写入只保存在本地模拟服务内存。
- 可随时点击顶部「重置模拟数据」；停止并重新启动服务也会生成一份全新模拟数据。

### 本地回归测试

双击根目录的 `运行本地回归测试.command`，或从项目目录运行：

```bash
bash scripts/test-local.sh
```

Python 模拟服务和基础测试不要求 Node.js。若本机安装了 Node.js，会额外运行网关、扩展和 Apps Script 的完整 JavaScript 回归测试；安装了 Playwright 时，还会运行 H5 浏览器测试。GitHub Actions 始终运行完整测试套件。

Playwright 浏览器测试的一次性安装命令：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip playwright
python -m playwright install chromium
```

本地模拟 API 覆盖公开读取、PIN 登录、配置读取/保存、版本校验、快照分片写入和回读；所有测试使用虚构数据，不会触碰正式数据库。

### GitHub CI 与 Netlify 发布职责

**职责只保留一条：GitHub Actions 测试，Netlify Git 集成部署。**

- GitHub Actions 只运行模拟测试和回归检查；不再调用 Netlify Build Hook，也不负责部署。
- Netlify 连接 GitHub 仓库后，由 Netlify Git 集成负责正式部署：只有代码合并/推送到生产分支 `main`，才触发正式生产部署。
- PR 默认先跑 GitHub 模拟测试。Netlify 对 PR 的 Deploy Preview 是另一种在线预览，不是测试必需项；纯代码修改可在 PR 标题中加 `[skip netlify]` 跳过预览构建，需要在线验收时再移除该标记。
- 如果 PR 标题带有 `[skip netlify]`，合并时要确保最终 squash commit 标题不带这个标记，否则 Netlify 也会按规则跳过生产部署。
- GitHub 仓库 Secret `NETLIFY_BUILD_HOOK` 不再被 CI 使用；确认没有其他工作流依赖后，可以从 GitHub Secrets 中删除。不要删除 Netlify 上的 `HQ_GOOGLE_URL`、`HQ_GOOGLE_TOKEN`、`HQ_PIN` 或 `HQ_SESSION_SECRET`。

因此，日常修改可以先在本地模拟预览，再由 GitHub Actions 自动验证；只有确实需要在线验收时才生成 Netlify Deploy Preview，合并到 `main` 后由 Netlify 单独发布一次。

## 重要：首次部署

1. 先更新现有 Apps Script：复制 `apps-script/Code.gs.example` 到现有 `Code.gs`，把 `SPREADSHEET_ID` 改为现有表格 ID；在 Apps Script「项目设置 → 脚本属性」中设置 `API_TOKEN`，值与 Netlify 的 `HQ_GOOGLE_TOKEN` 一致。保存后在「部署 → 管理部署」中编辑现有 Web App，选择新版本并部署，保持原 `/exec` 地址不变。不要把真实值提交到 GitHub，也不要新建或清空 Google Sheets。
2. 将本项目文件上传到 GitHub 仓库 `kangkanglele/hongqiao-housing-watch` 的 `main` 分支，保留目录结构。可在 GitHub 网页端点 `Add file → Upload files`，把解压后的项目文件/文件夹拖入，不需要安装 Node.js。
3. Netlify 连接该 GitHub 仓库，分支选 `main`。Build command 留空；Publish directory 为 `site`。Functions 目录由 `netlify.toml` 指定为 `netlify/functions`。
4. 在 Netlify 项目设置中配置以下 Functions 环境变量（都选 All deploy contexts；密钥项标记 Secret）：
   - `HQ_GOOGLE_URL`：现有 Apps Script `/exec` 地址
   - `HQ_GOOGLE_TOKEN`：Apps Script「项目设置 → 脚本属性」中的 `API_TOKEN`
   - `HQ_PIN`：你自己设置的四位数字；仅作为日常访问门槛，不提供暴力破解防护
   - `HQ_SESSION_SECRET`：至少 32 字节的随机私钥
5. 先通过 PR 和 GitHub Actions 完成本地/模拟测试；确认 Apps Script 已部署并能响应 `snapshotCommit` 后，再合并到 `main`。正式部署由 Netlify Git 集成单独触发，不要再从 GitHub Actions 调用 Build Hook。

不要把真实 Token 或 Session 私钥提交到 GitHub，也不要写入 HTML/Chrome 扩展。

## 数据保护

Google Sheets 是业务数据源；不会重置或清空现有表格。为启用追加式安全快照和单次 POST 写入，先将 `apps-script/Code.gs.example` 复制到现有 Apps Script 项目，将 `SPREADSHEET_ID` 改为现有表格 ID，并确认脚本属性 `API_TOKEN` 已设置；再更新现有 Web App 部署。保持原 `/exec` 地址和现有表格不变。

## 安全边界

- 源代码可以公开；仓库不得包含真实运行凭据。
- 房源和小区信息可公开查看；`load`/`ping` 为公开只读接口，管理写入仍需通过服务端 PIN 会话。正式 `load` 返回完整业务 JSON，包括人工备注、看房行程和照片。
- PIN 只用于防止随手访问和误操作，不作为强认证；项目不实施输错次数锁定。
- Google Token 与 Session Secret 只保存在 Netlify Functions 环境变量中。
- Google Sheets 的完整 JSON 快照是权威数据；新版本先追加并校验，旧快照保留作为回滚依据。
- `apps-script/Code.gs.example` 是不含真实凭据的公开模板；部署前替换两个占位符，并将相同 API Token 配置到 Netlify 的 `HQ_GOOGLE_TOKEN`。
- 删除优先使用归档/软删除；同步失败时保留本地待同步队列。
