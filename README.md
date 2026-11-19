# 红桥房源观察站 V3.5

本仓库用于 Netlify 自动部署。目录结构：

- `site/index.html`：H5 前端
- `netlify/functions/hq-api.mjs`：Netlify 服务端网关；Google Token 仅保存在 Netlify 环境变量
- `netlify.toml`：发布目录与 Functions 配置

## 部署前配置 Netlify 环境变量

请在 Netlify 项目 `hongqiao-housing-watch` 的 Project configuration → Environment variables 中配置，作用范围选择 Functions：

- `HQ_GOOGLE_URL`：现有 Apps Script `/exec` 地址
- `HQ_GOOGLE_TOKEN`：Apps Script `Code.gs` 中的 `API_TOKEN`，标记为 Secret
- `HQ_PIN`：初始四位 PIN（默认 1111），标记为 Secret
- `HQ_SESSION_SECRET`：至少 32 字节的随机私钥，标记为 Secret

不要把真实密钥提交到 GitHub。修改环境变量后需要重新部署才能生效。

## 部署

Netlify 连接本仓库的 `main` 分支，Build command 留空，Publish directory 设置为 `site`；Functions directory 由 `netlify.toml` 指定。

Chrome 扩展是独立安装包，不由 Netlify 发布。