/**
 * 总览看板 / 调用统计 API（AdminKeyGuard 保护，与 Sources/Keys 一致）
 * GET  /api/stats/summary   总览数字
 * GET  /api/stats/engines   按引擎聚合
 * GET  /api/stats/series   时间趋势（range=24h|7d|30d）
 * GET  /api/stats/logs     分页日志（channel/provider/ok/q 过滤）
 * DELETE /api/stats        清空统计
 */
import { Controller, Get, Query, Delete, UseGuards } from '@nestjs/common';
import { StatsService, StatsChannel } from '../stats/stats.service';
import { AdminKeyGuard } from '../auth/auth.guards';

@Controller('api/stats')
@UseGuards(AdminKeyGuard)
export class StatsController {
  constructor(private readonly stats: StatsService) {}

  @Get('summary')
  async summary() {
    return this.stats.getSummary();
  }

  @Get('engines')
  async engines() {
    return this.stats.getEngines();
  }

  @Get('series')
  async series(@Query('range') range?: string) {
    return this.stats.getSeries(range);
  }

  @Get('logs')
  async logs(
    @Query('page') page?: string,
    @Query('pageSize') pageSize?: string,
    @Query('channel') channel?: StatsChannel,
    @Query('provider') provider?: string,
    @Query('ok') ok?: 'true' | 'false',
    @Query('q') q?: string,
  ) {
    return this.stats.getLogs({ page: Number(page), pageSize: Number(pageSize), channel, provider, ok, q });
  }

  @Delete()
  async clear() {
    await this.stats.clear();
    return { success: true };
  }
}