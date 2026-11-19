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

## 0.5 基础同步链路

- Chrome 扩展把房源先保存到本地队列；只有云端确认成功后才从队列移除。
- Netlify 网关读取当前快照、合并单套房源，再通过一次 JSON POST 调用 Apps Script 的 `snapshotCommit`；不再把一个快照拆成 24 次 GET 请求。
- Apps Script 在锁内校验版本，追加完整快照，并按主键更新明细表；相同 `uploadId` 重试不会重复写入。
- 旧 GET `ping/load/begin/chunk/commit/config/configSave` 保留兼容。

## 开发、模拟与发布

### 本地模拟预览

先安装一次本地测试依赖（不需要安装 npm 包）：

```bash
python3 -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip playwright
python -m playwright install chromium
```

运行完整回归测试：

```bash
bash scripts/test-local.sh
```

启动可交互的本地模拟网站：

```bash
node scripts/mock-preview.mjs
```

然后打开 http://127.0.0.1:4173 。

页面顶部会显示「本地模拟环境」提示。模拟环境有以下隔离措施：

- 只绑定本机 `127.0.0.1`，不会对外网开放。
- 使用虚构房源和虚构房源编号，不代表真实挂牌。
- 不连接正式 Netlify Functions、Google Sheets 或 Apps Script。
- PIN 可输入任意四位数字；写入只保存到本地模拟服务。
- 可随时点击顶部「重置模拟数据」。关闭并重新启动模拟服务也会生成一份全新的模拟数据。

本地模拟 API 覆盖公开读取、PIN 登录、配置读取/保存、版本校验、快照分片写入和回读。自动化测试还会使用 mock fetch、mock Google Sheets 和 Playwright 路由拦截验证同步、去重、冲突与只读模式；不会触碰正式数据库。

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
