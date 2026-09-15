# webSearch 多源聚合搜索引擎

一个**前后端一体**、**单端口**部署的多源搜索引擎：内置多个搜索源（Tavily / 豆包 / Brave / Exa / Browserbase），
按优先级故障转移，谁先成功返回谁。对外提供 **REST API** 与 **MCP server**，均用**生成的访问密钥**鉴权。

- **后端**：NestJS（Node），failover 搜索引擎 + API/MCP
- **前端**：Vue 3 + Element Plus 管理页
- **单进程单端口**：由后端直接托管前端构建产物，`前端 + API + MCP` 都在一个端口上

---

## 快速部署（供人复制即跑）

要求：Node.js ≥ 18。**推荐在项目根目录用一条命令装依赖：**

```bash
git clone <你的仓库地址> && cd websearch
npm install                 # 自动安装 backend + frontend 依赖(通过 postinstall)
cp backend/.env.example backend/.env   # 复制配置文件，按需修改(见下)
npm run build               # 构建前端 + 后端
npm start                   # 启动，单端口提供整个服务
```

打开浏览器访问 **`http://localhost:3000`**（端口在 `backend/.env` 的 `PORT` 改）。

> 部署到服务器时：`npm start` 默认监听 `0.0.0.0`，改 `.env` 的 `PORT` 即可换端口；
> 建议用 pm2 / systemd 守护进程（如 `pm2 start "npm start" --name websearch`）。

---

## 配置文件 `backend/.env`

所有部署相关的配置都在这一个文件里（复制自 `.env.example`）：

| 变量 | 作用 |
|---|---|
| `PORT` | 整个服务（前端+后端）的访问端口，默认 `3000` |
| `ADMIN_KEY` | 可选。设置后，管理接口（/api/providers 等）需带该 Key 才能访问；留空则放开 |
| `TAVILY_API_KEY` / `DOUBAO_API_KEY` / `BRAVE_API_KEY` / `EXA_API_KEY` / `BROWSERBASE_API_KEY` | 各搜索源 Key（也可在后端「搜索源管理」页面里填） |

> ⚠️ `.env` 已被 `.gitignore` 忽略，不会提交；要共享模板请改 `.env.example`。

---

## 使用：生成访问密钥，接入 API / MCP

打开管理页 → 顶部「**访问密钥**」→ 点「**生成访问密钥**」，选作用域（api / mcp / 都要），
一次显示出明文并以 **REST / MCP 两段示例**一键复制（地址自动按当前访问的域名生成）。

**REST API：**
```bash
curl -X POST http://localhost:3000/api/v1/search \
  -H "Authorization: Bearer <你的KEY>" \
  -H "Content-Type: application/json" \
  -d '{"query":"claude"}'
```

**MCP server（streamable HTTP）：** 端点 `http://localhost:3000/mcp`，带上 `Authorization: Bearer` 请求头。
支持 Claude Desktop / Cursor 等可配置 HTTP 头的客户端，示例（`claude_desktop_config.json` 的 mcpServers）：

```json
{
  "mcpServers": {
    "websearch": {
      "type": "http",
      "url": "http://localhost:3000/mcp",
      "headers": { "Authorization": "Bearer <你的KEY>" }
    }
  }
}
```

密钥安全：**明文只在生成时显示一次**，`backend/data/keys.json` 只存 SHA-256 哈希；可随时启用/停用/吊销。

---

## 常用 API

| 方法 / 路径 | 说明 | 鉴权 |
|---|---|---|
| `POST /api/v1/search` | 对外搜索 REST（后端逻辑同 /api/search） | 访问密钥（scope=api） |
| `POST /api/search` | 管理端搜索（failover） | ADMIN_KEY（未设则放开） |
| `/mcp` | MCP server（工具：`search`、`list_sources`） | 访问密钥（scope=mcp） |
| `/api/keys` | 生成 / 列表 / 吊销访问密钥 | ADMIN_KEY（未设则放开） |
| `/api/providers` `/api/proxies` | 源 / 代理管理 | ADMIN_KEY（未设则放开） |
| `/api/health` | 健康检查 | 无 |

---

## 开发模式

```bash
npm run dev:web    # 前端 Vite dev（http://localhost:5173，/api 已代理到 3000）
# 另开一个终端：
npm run dev:api    # 后端热重载（http://localhost:3000）
```

---

## 运行时数据

- `backend/data/sources.json` — 搜索源配置（页面里也能改）
- `backend/data/proxies.json` — 代理配置
- `backend/data/keys.json` — 访问密钥（仅哈希）

`backend/data/` 已被 `.gitignore` 忽略，部署时建议挂到持久化目录（docker volume / 软链）。