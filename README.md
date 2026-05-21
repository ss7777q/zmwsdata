# Deployable App CF

这个目录是给 Cloudflare Pages 使用的独立版本，原始服务器版仍在 `../deployable-app`。

## 托管方式

- Cloudflare Pages 托管 `frontend/dist`。
- 展示用 JSON 从 `output/` 复制到 `frontend/public/data/`，由 Pages 静态托管和 CF CDN 缓存。
- 玩家查询、反馈、访问统计、神魔战场计算、运维接口继续请求你的服务器后端。
- 已删除的技能 Wiki 模块不包含在 CF 前端、静态数据和构建产物里。

## 本地构建

```bash
cd frontend
npm ci
npm run build:cf
```

`npm run build:cf` 会先执行：

```bash
node ../scripts/build_cf_static_data.js
```

它会生成：

```text
frontend/public/data/manifest.json
frontend/public/data/*.json
```

然后再执行 Vite 构建，最终产物目录是：

```text
frontend/dist
```

## Cloudflare Pages 配置

推荐配置：

```text
Root directory: deployable-app-cf/frontend
Build command: npm run build:cf
Build output directory: dist
```

环境变量：

```text
VITE_STATIC_DATA_BASE=/data
VITE_SERVER_API_BASE=https://api.zmwsrank.top
VITE_STATIC_DATA_STREAM=false
```

服务器 API 域名使用 `https://api.zmwsrank.top`，主站域名 `https://data.zmwsrank.top` 保留给用户访问前端页面。

## 服务器继续承担的功能

这些接口仍然由服务器后端处理：

```text
/api/health
/api/player-name/*
/api/feedback
/api/visitor-stats/*
/api/battlefield*
/api/admin/*
```

主数据页不再依赖服务器 `/api/files` 和 `/api/data/*`，而是直接读取 CF 静态文件：

```text
/data/manifest.json
/data/<name>.json
```

## 更新数据

原服务器可以继续跑现有更新流程，生成新的 `output/*.json` 后，把 `output/` 同步到这个 CF 项目，再重新执行：

```bash
cd frontend
npm run build:cf
```

这样用户访问的大部分流量都会由 Cloudflare 承载，服务器主要保留动态查询和后台更新能力。
