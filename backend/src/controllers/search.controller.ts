/**
 * 对外搜索接口
 * POST /api/search  body: { query, onlyTypes?, excludeTypes? }
 */
import { Controller, Post, Body, HttpCode, BadRequestException, HttpException, HttpStatus, UseGuards } from '@nestjs/common';
import { StoreService } from '../config/store.service';
import { SearchEngineService } from '../engine/search-engine.service';
import { AdminKeyGuard } from '../auth/auth.guards';

interface SearchBody {
  query?: string;
  onlyTypes?: string | string[];
  excludeTypes?: string | string[];
}

function normalizeArray(v: string | string[] | undefined): string[] | undefined {
  if (!v) return undefined;
  return Array.isArray(v) ? v.filter(Boolean) : [String(v)];
}

@Controller('api/search')
@UseGuards(AdminKeyGuard)
export class SearchController {
  constructor(
    private readonly store: StoreService,
    private readonly engine: SearchEngineService,
  ) {}

  @Post()
  @HttpCode(200)
  async search(@Body() body: SearchBody) {
    const query = `${body?.query || ''}`.trim();
    if (!query) {
      throw new BadRequestException('搜索词不能为空');
    }

    const sources = await this.store.getSources();
    const result = await this.engine.search(query, {
      sources,
      onlyTypes: normalizeArray(body?.onlyTypes),
      excludeTypes: normalizeArray(body?.excludeTypes),
    });

    if (!result.success) {
      throw new HttpException(result, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return result;
  }
}