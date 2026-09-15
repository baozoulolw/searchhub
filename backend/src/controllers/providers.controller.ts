/**
 * 搜索源配置管理接口
 * GET    /api/providers          列出所有源（key 脱敏）
 * GET    /api/providers/registry 列出所有适配器类型与字段定义
 * POST   /api/providers          新增
 * PUT    /api/providers/:id      更新
 * DELETE /api/providers/:id      删除
 * POST   /api/providers/test/:id 单源离线测试
 */
import {
  Controller, Get, Post, Put, Delete, Param, Body, BadRequestException, NotFoundException,
  HttpException, HttpStatus, UseGuards,
} from '@nestjs/common';
import { StoreService } from '../config/store.service';
import { SearchEngineService } from '../engine/search-engine.service';
import { PROVIDER_REGISTRY, listProviderMetas, buildDefaultConfig } from '../providers/registry';
import { AdminKeyGuard } from '../auth/auth.guards';

@Controller('api/providers')
@UseGuards(AdminKeyGuard)
export class ProvidersController {
  constructor(
    private readonly store: StoreService,
    private readonly engine: SearchEngineService,
  ) {}

  // 列出所有源（key 脱敏）
  @Get()
  async list() {
    const sources = await this.store.getSources();
    return { success: true, data: this.store.toView(sources) };
  }

  // 适配器元信息（类型 + 字段）
  @Get('registry')
  async registry() {
    return {
      success: true,
      data: listProviderMetas().map((m) => ({ ...m, builtin: !!PROVIDER_REGISTRY[m.type] })),
    };
  }

  // 新增源
  @Post()
  async create(@Body() body: any) {
    const { type, label, enabled, config } = body || {};
    if (!type || !PROVIDER_REGISTRY[type]) {
      throw new BadRequestException(`未知的类型：${type || '空'}`);
    }
    const defaultConfig = buildDefaultConfig(type);
    const created = await this.store.createSource({
      type,
      label,
      enabled,
      config: config && Object.keys(config).length ? config : defaultConfig,
    });
    // 回传脱敏视图
    return { success: true, data: this.store.toView([created])[0] };
  }

  // 更新源
  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const updated = await this.store.updateSource(id, body || {});
    if (!updated) throw new NotFoundException('源不存在');
    return { success: true, data: this.store.toView([updated])[0] };
  }

  // 删除源
  @Delete(':id')
  async remove(@Param('id') id: string) {
    const removed = await this.store.deleteSource(id);
    if (!removed) throw new NotFoundException('源不存在');
    return { success: true, data: { id } };
  }

  // 单源离线测试：仅跑指定 type 走 failover 引擎
  @Post('test/:id')
  async test(@Param('id') id: string, @Body() body: any) {
    const query = `${body?.query || ''}`.trim();
    if (!query) throw new BadRequestException('请输入测试搜索词');

    const sources = await this.store.getSources();
    const target = sources.find((s) => s.id === id);
    if (!target) throw new NotFoundException('源不存在');

    const result = await this.engine.search(query, {
      sources,
      onlyTypes: [target.type],
      excludeTypes: undefined,
    });

    if (!result.success) {
      throw new HttpException({ ...result, testedSourceId: id }, HttpStatus.INTERNAL_SERVER_ERROR);
    }
    return { ...result, testedSourceId: id };
  }
}