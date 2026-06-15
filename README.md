# Deployable App CF

这个目录是给 Cloudflare Pages 使用的独立版本，原始服务器版仍在 `../deployable-app`。

## 托管方式

- Cloudflare Pages 托管 `frontend/dist`。
- 展示用 JSON 从 `output/` 复制到 `frontend/public/data/`，由 Pages 静态托管和 CF CDN 缓存。
- 访问统计由 Cloudflare Pages Functions + D1 承担，接口路径保持 `/api/visitor-stats*` 不变。
- 玩家查询、反馈、神魔战场计算、运维接口继续请求你的服务器后端。
- 角色技能 Wiki 以测试性功能接入 CF 前端，静态 JSON 一并从 `output/role_wiki_*.json` 复制到 Pages 产物。

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
VITE_VISITOR_API_BASE=
VITE_STATIC_DATA_STREAM=false
```

服务器 API 域名使用 `https://api.zmwsrank.top`，主站域名 `https://data.zmwsrank.top` 保留给用户访问前端页面。
`VITE_VISITOR_API_BASE` 留空时，访问统计走同源 Pages Function；临时切回旧服务器时才填写服务器地址。

## Windows 一键部署

项目根目录放置 `.env`，字段可参考 `.env.cloudflare.example`。真实 token 不提交到 git。

```powershell
cd D:\zmws\Server\deployable-app-cf
.\deploy-cf.bat
```

脚本会在 Windows 端完成静态数据生成、Vite 构建和 Cloudflare Pages 上传。Pages 上传优先使用 `CLOUDFLARE_PAGES_API_TOKEN`，D1 初始化和导入使用 `CLOUDFLARE_D1_API_TOKEN`。

## 访问统计 D1

Pages Functions 需要绑定一个 D1 数据库，绑定名固定为：

```text
VISITOR_STATS_DB
```

初始化 D1：

```powershell
cd D:\zmws\Server\deployable-app-cf
npx wrangler d1 create zmws-visitor-stats
npx wrangler d1 execute zmws-visitor-stats --file .\schema\visitor_stats_d1.sql --remote
```

当前线上 D1：

```text
database_name = zmws-visitor-stats
database_id = f06392c5-e00e-4d82-84b9-d3f2d9fa9eaa
binding = VISITOR_STATS_DB
```

把现有服务器访问记录迁过去：

```powershell
cd D:\zmws\Server\deployable-app-cf
$env:CLOUDFLARE_API_TOKEN = $env:CLOUDFLARE_D1_API_TOKEN
node .\scripts\export_visitor_stats_d1.js <真实visitor-stats.db路径> .\temp\visitor_stats_seed.sql
npx wrangler d1 execute zmws-visitor-stats --file .\temp\visitor_stats_seed.sql --remote
```

`wrangler.toml` 已声明 `VISITOR_STATS_DB` D1 绑定。以下接口会直接由 CF 承载：

```text
/api/visitor-stats
/api/visitor-stats/history
/api/visitor-stats/register
```

## 服务器继续承担的功能

这些接口仍然由服务器后端处理：

```text
/api/health
/api/player-name/*
/api/feedback
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
