# 红桥房源观察站 0.5

本仓库用于 Netlify 自动部署，保留现有 H5 页面、Google Sheets 数据结构和 Chrome 一键采集扩展。

## 目录结构

- `site/index.html`：H5 前端
- `netlify/functions/hq-api.mjs`：Netlify 服务端网关；`HQ_GOOGLE_TOKEN` 只在 Netlify Functions 环境变量中，Apps Script 侧 `API_TOKEN` 只留在 Apps Script 服务端
- `apps-script/Code.gs.example`：不含真实凭据的 Apps Script 模板；部署时替换占位符
- `netlify.toml`：Netlify 发布目录与 Functions 配置
- `extension/`：Chrome Manifest V3 扩展，独立安装
- `tests/`：本地模拟测试

## 0.5 基础同步链路

- Chrome 扩展把房源先保存到本地队列；只有云端确认成功后才从队列移除。
- Netlify 网关读取当前快照、合并单套房源，再通过一次 JSON POST 调用 Apps Script 的 `snapshotCommit`；不再把一个快照拆成 24 次 GET 请求。
- Apps Script 在锁内校验版本，追加完整快照，并按主键更新明细表；相同 `uploadId` 重试不会重复写入。
- 旧 GET `ping/load/begin/chunk/commit/config/configSave` 保留兼容。

## 重要：首次部署

1. 先更新现有 Apps Script：复制 `apps-script/Code.gs.example` 内容到现有 `Code.gs`，将两个占位符替换为你原来使用的 Spreadsheet ID 与 API Token；保存后在 Apps Script「部署 → 管理部署」中编辑现有 Web App，选择新版本并部署。不要把真实值提交到 GitHub，也不要新建或清空 Google Sheets。
2. 将本项目文件上传到 GitHub 仓库 `kangkanglele/hongqiao-housing-watch` 的 `main` 分支，保留目录结构。可在 GitHub 网页端点 `Add file → Upload files`，把解压后的项目文件/文件夹拖入，不需要安装 Node.js。
3. Netlify 连接该 GitHub 仓库，分支选 `main`。Build command 留空；Publish directory 为 `site`。Functions 目录由 `netlify.toml` 指定为 `netlify/functions`。
4. 在 Netlify 项目设置中配置以下 Functions 环境变量（都选 All deploy contexts；密钥项标记 Secret）：
   - `HQ_GOOGLE_URL`：现有 Apps Script `/exec` 地址
   - `HQ_GOOGLE_TOKEN`：Apps Script `Code.gs` 中的 `API_TOKEN`
   - `HQ_PIN`：你自己设置的四位数字；仅作为日常访问门槛，不提供暴力破解防护
   - `HQ_SESSION_SECRET`：至少 32 字节的随机私钥
5. 先通过 GitHub Pull Request 完成本地/模拟测试；确认 Apps Script 已部署并能响应 `snapshotCommit` 后，再合并到 `main`，只触发一次 Netlify 生产部署。不要为小改动频繁发布。

不要把真实 Token 或 Session 私钥提交到 GitHub，也不要写入 HTML/Chrome 扩展。

## 数据保护

Google Sheets 是业务数据源；不会重置或清空现有表格。为启用追加式安全快照，必须先将 `apps-script/Code.gs.example` 复制到现有 Apps Script 项目，替换 Spreadsheet ID 和 API Token 两个占位符，再更新现有 Web App 部署。保持原 `/exec` 地址和现有表格不变。


## 安全边界

- 源代码可以公开；仓库不得包含真实运行凭据。
- 房源和小区信息可公开查看；`load`/`ping` 为公开只读接口，管理写入仍需通过服务端 PIN 会话。`load` 返回完整业务 JSON，包括人工备注、看房行程和照片。
- PIN 只用于防止随手访问和误操作，不作为强认证；项目不实施输错次数锁定。
- Google Token 与 Session Secret 只保存在 Netlify Functions 环境变量中。
- Google Sheets 的完整 JSON 快照是权威数据；新版本先追加并校验，旧快照保留作为回滚依据。
- `apps-script/Code.gs.example` 是不含真实凭据的公开模板；部署前替换两个占位符，并将相同 API Token 配置到 Netlify 的 `HQ_GOOGLE_TOKEN`。
- 删除优先使用归档/软删除；同步失败时保留本地待同步队列。
