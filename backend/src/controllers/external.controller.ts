/**
 * 对外访问层 —— REST API（受生成 key 保护，作用域 api）
 * POST /api/v1/search  body: { query, onlyTypes?, excludeTypes? }
 * 复用 failover 搜索引擎，返回结构与 /api/search 一致。
 */
import {
  Controller,
  Post,
  Body,
  HttpCode,
  UseGuards,
  BadRequestException,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { StoreService } from '../config/store.service';
import { SearchEngineService } from '../engine/search-engine.service';
import { ApiKeyGuard, Scope } from '../auth/auth.guards';

interface V1SearchBody {
  query?: string;
  onlyTypes?: string | string[];
  excludeTypes?: string | string[];
}

function normalizeArray(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v.filter(Boolean) : [String(v)];
}

@Controller('api/v1')
@UseGuards(ApiKeyGuard)
export class ExternalController {
  constructor(
    private readonly store: StoreService,
    private readonly engine: SearchEngineService,
  ) {}

  @Post('search')
  @HttpCode(200)
  @Scope('api')
  async search(@Body() body: V1SearchBody) {
    const query = `${body?.query || ''}`.trim();
    if (!query) {
      throw new BadRequestException('搜索词不能为空');
    }

    const sources = await this.store.getSources();
    const result = await this.engine.search(query, {
      sources,
      onlyTypes: normalizeArray(body?.onlyTypes),
      excludeTypes: normalizeArray(body?.excludeTypes),
      channel: 'api',
    });

    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }
}