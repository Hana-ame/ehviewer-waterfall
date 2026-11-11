# E-Hentai 瀑布流查看器

纯前端 e-hentai 画廊瀑布流查看器。从 `hana-ame.github.io` 的 `/s/*` 路径拆出，独立部署到 GitHub Pages。

## 数据链路（已实测）

- **页面 HTML**：`https://ehwv.moonchan.xyz/s/<hash>/<gid>-<page>`（cloudcone nginx → api-pack `internal/exhentai` → `exhentai.org`；CORS 开放，可跨域 fetch）
- **图片直链**：`*.hath.network:<port>`（e-hentai H@H 节点，浏览器直连，**不被墙**，无需代理）
- 前端 fetch 页面 → 解析 `<img id="img">`（图片直链）+ `<a id="next">`（下一页相对路径）→ 瀑布流逐页追加

> **注意：不使用 Cloudflare Worker。** 实测 CF Worker 出口 IP 为共享段（`2a06:98c0:3600::103`），直连 `e-hentai.org` 会被其限流封禁（"temporarily banned due to excessive request rate"，ban 16h+）。api-pack 用多 IP 轮换 + cookie 绕过。故本查看器**页面走 api-pack（ehwv.moonchan.xyz），图片走 hath.network 直连**。

## 用法

- 打开 `https://hana-ame.github.io/ehviewer-waterfall/`
- 粘贴 e-hentai 画廊链接（`https://e-hentai.org/g/<gid>/<token>/`）
- 或直接用 hash 路由打开：`https://hana-ame.github.io/ehviewer-waterfall/#/s/<hash>/<gid>-<page>`、`#/g/<gid>/<token>/`
- 点「自动」连续瀑布流加载；「复制外链」复制当前图片直链

> 注意：GitHub Pages 是纯静态站，无 SPA fallback，直接访问 `/s/...` 路径会 404。请用根路径 + 输入框，或 hash 路由 `#/s/...`。

## 结构

| 文件 | 说明 |
|---|---|
| `index.html` | 入口（含 SW 注册） |
| `app.js` | 瀑布流核心（fetch ehwv → 解析 #img/#next → append） |
| `style.css` | 样式 |
| `manifest.json` / `sw.js` | PWA（可安装、离线缓存静态壳） |

## 后端说明

页面数据来自 `ehwv.moonchan.xyz`（api-pack 代理，CORS 全开放，`Accept-Language: zh` 规避 302）。可用 `?host=` 覆盖后端地址（沿用原 `/s/*` 组件语义）。

对应后端源码：`github.com/Hana-ame/api-pack` 的 `internal/exhentai/`。
