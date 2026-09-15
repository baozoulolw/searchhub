// 加载根目录 .env（配置文件，改端口 / 填密钥都在这）
import 'dotenv/config';

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { AppModule } from './app.module';
import { McpService } from './mcp/mcp.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);

  // 允许跨域（前端 Vite dev server 5173 代理 /api 已足够，但保留 CORS 兜底）
  app.enableCors();

  // —— 一键式部署：由后端托管前端构建产物，单进程单端口同时服务前后端 ——
  // src/main.ts / dist/main.js 均为两层，../.. 都指向仓库根目录，拼 /frontend/dist
  const frontendDist = path.join(__dirname, '..', '..', 'frontend', 'dist');
  const hasFrontend = existsSync(path.join(frontendDist, 'index.html'));
  if (hasFrontend) {
    // 1) 托管静态资源（assets / index.html）——index 交给 express.static 默认行为
    app.useStaticAssets(frontendDist, { index: 'index.html' });
    // 2) SPA 回退：非 /api、/mcp 的 GET 都返回 index.html（前端 Vue-router 页面路由）
    app.use((req, res, next) => {
      if (req.method === 'GET' && !req.path.startsWith('/api') && !req.path.startsWith('/mcp')) {
        return res.sendFile(path.join(frontendDist, 'index.html'));
      }
      next();
    });
    Logger.log(`前端已就绪：托管 ${frontendDist}`, 'Bootstrap');
    Logger.log(`所有请求（前端 + API + MCP）都在同一个端口提供`, 'Bootstrap');
  } else {
    Logger.warn(`未找到前端构建产物（${frontendDist}），仅提供 API/MCP`, 'Bootstrap');
  }

  // MCP session 传输在进程退出时清理
  const mcp = app.get(McpService);
  const shutdown = async (signal: string) => {
    Logger.log(`收到 ${signal}，正在清理 MCP 会话...`, 'Bootstrap');
    try {
      await mcp.dispose();
    } catch {
      /* ignore */
    }
    await app.close();
    process.exit(0);
  };
  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  // 端口从 .env 的 PORT 读取（默认 3000）
  const PORT = Number(process.env.PORT) || 3000;
  await app.listen(PORT, '0.0.0.0');
  Logger.log(`webSearch 已启动（前后端一体）： http://localhost:${PORT}`, 'Bootstrap');
  Logger.log(`POST /api/v1/search  对外搜索 REST（需生成 key，scope=api）`, 'Routes');
  Logger.log(`POST/GET/DELETE /mcp  MCP server（需生成 key，scope=mcp）`, 'Routes');
  Logger.log(`GET/POST/PATCH/DELETE /api/keys  访问 key 管理（AdminKeyGuard）`, 'Routes');
  Logger.log(`GET  /api/providers 管理列表 / POST /api/search admin search（AdminKeyGuard）`, 'Routes');
  Logger.log(`管理接口：设置 ADMIN_KEY 环境变量后需携带该 key 访问；未设置则放开`, 'Auth');
}
bootstrap();