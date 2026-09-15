/**
 * 代理管理接口
 * GET    /api/proxies         列出所有代理（脱敏）
 * GET    /api/proxies/options 上传选项（供源编辑下拉；仅返回 id/name）
 * POST   /api/proxies         新增
 * PUT    /api/proxies/:id     更新
 * DELETE /api/proxies/:id     删除
 * POST   /api/proxies/:id/test 测试代理连通性
 */
import { Controller, Get, Post, Put, Delete, Param, Body, BadRequestException, NotFoundException, UseGuards } from '@nestjs/common';
import { ProxiesService } from '../config/proxies.service';
import { fetch } from 'undici';
import { AdminKeyGuard } from '../auth/auth.guards';

@Controller('api/proxies')
@UseGuards(AdminKeyGuard)
export class ProxiesController {
  constructor(private readonly proxies: ProxiesService) {}

  @Get()
  async list() {
    const all = await this.proxies.list();
    return { success: true, data: this.proxies.toView(all) };
  }

  // 供源编辑下拉：只回 id + name，减少前端负担
  @Get('options')
  async options() {
    const all = await this.proxies.list();
    return { success: true, data: all.map((p) => ({ id: p.id, name: p.name })) };
  }

  @Post()
  async create(@Body() body: any) {
    const { name, protocol, host, port, username, password } = body || {};
    if (!host) throw new BadRequestException('代理地址不能为空');
    if (!port) throw new BadRequestException('代理端口不能为空');
    const created = await this.proxies.create({ name, protocol, host, port, username, password });
    return { success: true, data: this.proxies.toView([created])[0] };
  }

  @Put(':id')
  async update(@Param('id') id: string, @Body() body: any) {
    const updated = await this.proxies.update(id, body || {});
    if (!updated) throw new NotFoundException('代理不存在');
    return { success: true, data: this.proxies.toView([updated])[0] };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.proxies.remove(id);
    if (!ok) throw new NotFoundException('代理不存在');
    return { success: true, data: { id } };
  }

  // 连通性测试：依次尝试多个探针，任一成功即判定可用（避免单个目标被墙/被代理商限制导致误报）
  @Post(':id/test')
  async test(@Param('id') id: string) {
    const agent = await this.proxies.buildAgent(id);
    if (!agent) throw new BadRequestException('代理配置无效或不存在');

    // 探针清单：覆盖 Google / Cloudflare / 国内可达站，域名不同避免单一目标不可达误判
    const PROBES = [
      { url: 'https://www.google.com/generate_204', name: 'Google' },
      { url: 'https://cp.cloudflare.com/generate_204', name: 'Cloudflare' },
      { url: 'https://httpbingo.org/status/204', name: 'httpbingo' },
      { url: 'https://www.baidu.com', name: 'Baidu' },
    ];
    const TEST_TIMEOUT = 8000;
    const errors: string[] = [];

    for (const probe of PROBES) {
      try {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), TEST_TIMEOUT);
        const res = await fetch(probe.url, {
          method: 'GET',
          signal: controller.signal,
          dispatcher: agent,
        });
        clearTimeout(timer);
        // 2xx/3xx 均视为连通
        if (res.status >= 200 && res.status < 400) {
          return { success: true, status: res.status, probe: probe.name, message: `代理可用（经 ${probe.name} 验证，HTTP ${res.status}）` };
        }
        errors.push(`${probe.name}: HTTP ${res.status}`);
      } catch (err: any) {
        errors.push(`${probe.name}: ${err.message}`);
      }
    }

    return { success: false, message: `代理连接失败：${errors.join('；')}` };
  }
}