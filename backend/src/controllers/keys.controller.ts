/**
 * 访问 key 管理接口（受 AdminKeyGuard 保护）
 *  - GET    /api/keys            脱敏列表
 *  - POST   /api/keys            创建，body {name, scopes}，明文仅此一次返回
 *  - PATCH  /api/keys/:id        启停/改作用域，body {name?, enabled?, scopes?}
 *  - POST   /api/keys/:id/revoke 吊销
 *  - DELETE /api/keys/:id        删除
 */
import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  UseGuards,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { KeysService } from '../config/keys.service';
import { AdminKeyGuard } from '../auth/auth.guards';
import { KeyScope } from '../types';

@Controller('api/keys')
@UseGuards(AdminKeyGuard)
export class KeysController {
  constructor(private readonly keys: KeysService) {}

  @Get()
  async list() {
    const all = await this.keys.list();
    return { success: true, data: this.keys.toView(all) };
  }

  @Post()
  async create(@Body() body: { name?: string; scopes?: KeyScope[] }) {
    if (!body || (body.scopes && !Array.isArray(body.scopes))) {
      throw new BadRequestException('参数格式不正确');
    }
    const { key, secret } = await this.keys.create(body);
    return {
      success: true,
      data: this.keys.toView([key])[0],
      key: secret, // 明文仅此一次返回
      warning: '请立即保存此密钥，之后不再显示明文',
    };
  }

  @Patch(':id')
  async update(
    @Param('id') id: string,
    @Body() body: { name?: string; enabled?: boolean; scopes?: KeyScope[] },
  ) {
    if (body && body.scopes && !Array.isArray(body.scopes)) {
      throw new BadRequestException('scopes 必须是数组');
    }
    const updated = await this.keys.update(id, body || {});
    if (!updated) throw new NotFoundException('未找到该 key');
    return { success: true, data: this.keys.toView([updated])[0] };
  }

  @Post(':id/revoke')
  async revoke(@Param('id') id: string) {
    const ok = await this.keys.revoke(id);
    if (!ok) throw new NotFoundException('未找到该 key');
    return { success: true };
  }

  @Delete(':id')
  async remove(@Param('id') id: string) {
    const ok = await this.keys.remove(id);
    if (!ok) throw new NotFoundException('未找到该 key');
    return { success: true };
  }
}