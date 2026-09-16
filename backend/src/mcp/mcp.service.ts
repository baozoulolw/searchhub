/**
 * MCP Server Service（streamable HTTP 传输）
 * 对外暴露 `search`、`list_sources` 等工具，鉴权由外层 ApiKeyGuard 负责。
 * 遵循官方 streamable-HTTP 示例的按 session 隔离传输模式（规避 CVE 并发泄漏）。
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import type { Request, Response } from 'express';
import { StoreService } from '../config/store.service';
import { SearchEngineService } from '../engine/search-engine.service';
import { SearchFailure } from '../types';

@Injectable()
export class McpService {
  // 每个 MCP session 一套独立的 { server, transport }，天然隔离并发，规避共享实例的 CVE 风险
  private readonly sessions = new Map<string, { server: McpServer; transport: StreamableHTTPServerTransport }>();

  constructor(
    private readonly store: StoreService,
    private readonly engine: SearchEngineService,
  ) {}

  /** 注册工具到给定 server（每个 session 各自构建） */
  private registerTools(server: McpServer): void {
    server.registerTool(
      'search',
      {
        title: '全网搜索',
        description: '多源聚合搜索。返回抓取到的网页标题、链接、摘要；支持可选 source 字段。',
        inputSchema: z.object({
          query: z.string().describe('搜索关键词'),
          onlyTypes: z
            .array(z.string())
            .optional()
            .describe('只使用这些源类型，如 ["tavily","doubao"]'),
          excludeTypes: z.array(z.string()).optional().describe('排除这些源类型'),
          maxResults: z.number().optional().describe('最多返回条目数（可选，默认全部）'),
        }),
      },
      async (input: { query?: string; onlyTypes?: string[]; excludeTypes?: string[]; maxResults?: number }) => {
        const query = `${input?.query || ''}`.trim();
        if (!query) {
          return textResult({ success: false, message: '搜索词不能为空' });
        }
        const sources = await this.store.getSources();
        const result = await this.engine.search(query, {
          sources,
          onlyTypes: input?.onlyTypes,
          excludeTypes: input?.excludeTypes,
          channel: 'mcp',
        });
        if (!result.success) {
          const failed = result as SearchFailure;
          return textResult({ success: false, message: failed.message, tried: failed.tried });
        }
        let items = result.items || [];
        if (typeof input?.maxResults === 'number' && input.maxResults > 0) {
          items = items.slice(0, Math.floor(input.maxResults));
        }
        return textResult({
          success: true,
          provider: result.provider,
          providerLabel: result.providerLabel,
          query,
          count: items.length,
          answer: result.extra?.answer,
          items,
        });
      },
    );

    server.registerTool(
      'list_sources',
      {
        title: '列出搜索源',
        description: '列出当前后台启用的搜索源类型与名称（不含密钥）。',
        inputSchema: z.object({}),
      },
      async () => {
        const sources = await this.store.getSources();
        return textResult(
          sources
            .filter((s) => s.enabled)
            .map((s) => ({ type: s.type, label: s.label, hasApiKey: !!s.config?.apiKey })),
        );
      },
    );
  }

  /** POST /mcp：MCP 消息主入口 */
  async handlePost(req: Request, res: Response): Promise<void> {
    const sessionId = Array.isArray(req.headers['mcp-session-id'])
      ? (req.headers['mcp-session-id'] as string[])[0]
      : (req.headers['mcp-session-id'] as string | undefined);

    try {
      if (sessionId && this.sessions.has(sessionId)) {
        // 复用既有 session
        const session = this.sessions.get(sessionId)!;
        await session.transport.handleRequest(req, res, req.body);
        return;
      }

      if (!sessionId && isInitializeRequest(req.body)) {
        // 新会话初始化：每个 session 独立 server + transport
        const server = new McpServer({
          name: 'websearch-backend',
          version: '1.0.0',
          description: '多源聚合搜索引擎。使用 search 工具按关键词检索，支持指定/排除源类型。',
        });
        this.registerTools(server);

        let session!: { server: McpServer; transport: StreamableHTTPServerTransport };
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          onsessioninitialized: (id) => {
            this.sessions.set(id, session);
          },
        });
        session = { server, transport };
        transport.onclose = () => {
          const sid = transport.sessionId;
          if (sid) this.sessions.delete(sid);
        };
        await server.connect(transport);
        await transport.handleRequest(req, res, req.body);
        return;
      }

      res.status(400).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'Bad Request: No valid session ID provided' },
        id: null,
      });
    } catch (err) {
      console.error('[Mcp] 处理请求失败:', err);
      if (!res.headersSent) {
        res.status(500).json({
          jsonrpc: '2.0',
          error: { code: -32603, message: String((err as Error)?.message || err) },
          id: null,
        });
      }
    }
  }

  /** GET / DELETE /mcp：会话原语（GET 用作连接探测，DELETE 关闭会话） */
  async handleGetOrDelete(req: Request, res: Response): Promise<void> {
    const sessionId = Array.isArray(req.headers['mcp-session-id'])
      ? (req.headers['mcp-session-id'] as string[])[0]
      : (req.headers['mcp-session-id'] as string | undefined);
    const session = sessionId ? this.sessions.get(sessionId) : undefined;
    if (!session) {
      res.status(405).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: 'No active session' },
        id: null,
      });
      return;
    }
    await session.transport.handleRequest(req, res);
  }

  /** 应用关闭时清理所有 session（幂等，可多次调用安全） */
  async dispose(): Promise<void> {
    await Promise.all(
      [...this.sessions.values()].map((s) => s.transport.close().catch(() => undefined)),
    );
    this.sessions.clear();
  }
}

/** 把任意对象序列化为 MCP text content */
function textResult(data: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(data, null, 2) }],
  };
}