# 红桥房源观察站 V3.5

本仓库用于 Netlify 自动部署，保留现有 H5 页面、Google Sheets 数据结构和 Chrome 一键采集扩展。

## 目录结构

- `site/index.html`：H5 前端
- `netlify/functions/hq-api.mjs`：Netlify 服务端网关；Google Token 只在 Netlify Functions 环境变量中
- `apps-script/Code.gs.example`：不含真实凭据的 Apps Script 模板；部署时替换占位符
- `netlify.toml`：Netlify 发布目录与 Functions 配置
- `extension/`：Chrome Manifest V3 扩展，独立安装
- `tests/`：本地模拟测试

## 重要：首次部署

1. 将本项目文件上传到 GitHub 仓库 `kangkanglele/hongqiao-housing-watch` 的 `main` 分支，保留目录结构。可在 GitHub 网页端点 `Add file → Upload files`，把解压后的项目文件/文件夹拖入，不需要安装 Node.js。
2. Netlify 连接该 GitHub 仓库，分支选 `main`。Build command 留空；Publish directory 为 `site`。Functions 目录由 `netlify.toml` 指定为 `netlify/functions`。
3. 在 Netlify 项目设置中配置以下 Functions 环境变量（都选 All deploy contexts；密钥项标记 Secret）：
   - `HQ_GOOGLE_URL`：现有 Apps Script `/exec` 地址
   - `HQ_GOOGLE_TOKEN`：Apps Script `Code.gs` 中的 `API_TOKEN`
   - `HQ_PIN`：你自己设置的四位数字；仅作为日常访问门槛，不提供暴力破解防护
   - `HQ_SESSION_SECRET`：至少 32 字节的随机私钥
4. 保存环境变量后触发一次新的生产部署。

不要把真实 Token 或 Session 私钥提交到 GitHub，也不要写入 HTML/Chrome 扩展。

## 数据保护

Google Sheets 是业务数据源；首次部署不会重置或清空表格。Apps Script V3.4 `/exec` 继续使用，不需要重新初始化。


## 安全边界

- 源代码可以公开；仓库不得包含真实运行凭据。
- 房源和小区信息按可公开查看的数据设计；管理写入仍需通过服务端 PIN 会话。
- PIN 只用于防止随手访问和误操作，不作为强认证；项目不实施输错次数锁定。
- Google Token 与 Session Secret 只保存在 Netlify Functions 环境变量中。
- Google Sheets 的完整 JSON 快照是权威数据；新版本先追加并校验，旧快照保留作为回滚依据。
- 删除优先使用归档/软删除；同步失败时保留本地待同步队列。
