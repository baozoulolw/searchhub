/**
 * MCP endpoint（streamable HTTP 传输，受生成 key 保护，作用域 mcp）
 *  - POST /mcp    主消息入口（initialize / tools/list / tools/call）
 *  - GET  /mcp    会话连接探测
 *  - DELETE /mcp  关闭会话
 * 鉴权在 controller 之前生效（ApiKeyGuard + Scope('mcp')）。
 */
import {
  Controller,
  Post,
  Get,
  Delete,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { McpService } from '../mcp/mcp.service';
import { ApiKeyGuard, Scope } from '../auth/auth.guards';

@Controller('mcp')
@UseGuards(ApiKeyGuard)
@Scope('mcp')
export class McpController {
  constructor(private readonly mcp: McpService) {}

  @Post()
  async post(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcp.handlePost(req, res);
  }

  @Get()
  async get(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcp.handleGetOrDelete(req, res);
  }

  @Delete()
  async del(@Req() req: Request, @Res() res: Response): Promise<void> {
    await this.mcp.handleGetOrDelete(req, res);
  }
}