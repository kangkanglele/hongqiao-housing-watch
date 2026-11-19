# 红桥房源观察站 V3.5

本仓库用于 Netlify 自动部署，保留现有 H5 页面、Google Sheets 数据结构和 Chrome 一键采集扩展。

## 目录结构

- `site/index.html`：H5 前端
- `netlify/functions/hq-api.mjs`：Netlify 服务端网关；Google Token 只在 Netlify Functions 环境变量中
- `netlify.toml`：Netlify 发布目录与 Functions 配置
- `extension/`：Chrome Manifest V3 扩展，独立安装
- `tests/`：本地模拟测试

## 重要：首次部署

1. 将本项目文件上传到 GitHub 仓库 `kangkanglele/hongqiao-housing-watch` 的 `main` 分支，保留目录结构。可在 GitHub 网页端点 `Add file → Upload files`，把解压后的项目文件/文件夹拖入，不需要安装 Node.js。
2. Netlify 连接该 GitHub 仓库，分支选 `main`。Build command 留空；Publish directory 为 `site`。Functions 目录由 `netlify.toml` 指定为 `netlify/functions`。
3. 在 Netlify 项目设置中配置以下 Functions 环境变量（都选 All deploy contexts；密钥项标记 Secret）：
   - `HQ_GOOGLE_URL`：现有 Apps Script `/exec` 地址
   - `HQ_GOOGLE_TOKEN`：Apps Script `Code.gs` 中的 `API_TOKEN`
   - `HQ_PIN`：初始四位 PIN，当前约定 `1111`，首次验收后建议修改
   - `HQ_SESSION_SECRET`：至少 32 字节的随机私钥
4. 保存环境变量后触发一次新的生产部署。

不要把真实 Token 或 Session 私钥提交到 GitHub，也不要写入 HTML/Chrome 扩展。

## 数据保护

Google Sheets 是业务数据源；首次部署不会重置或清空表格。Apps Script V3.4 `/exec` 继续使用，不需要重新初始化。
