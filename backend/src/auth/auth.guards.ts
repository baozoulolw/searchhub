/**
 * 鉴权守卫
 *  - Scope('api'|'mcp') 装饰器：声明端点所需 key 作用域。
 *  - ApiKeyGuard：校验 Authorization: Bearer <secret>，要求命中指定作用域，
 *    失败统一 401。用于对外访问层（/api/v1/*、/mcp）。
 *  - AdminKeyGuard：未设置 ADMIN_KEY 环境变量则放行（兼容前端）；
 *    已设置则要求请求带该 master key（Bearer 或 X-Admin-Key）。
 */
import {
  CanActivate,
  ExecutionContext,
  Injectable,
  SetMetadata,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { KeysService, safeEqual } from '../config/keys.service';
import { KeyScope } from '../types';

export const SCOPE_KEY = 'mcp:scope';
export const Scope = (scope: KeyScope | KeyScope[]) => SetMetadata(SCOPE_KEY, scope);

/** 从请求头取 bearer token（Authorization: Bearer xxx） */
export function extractBearer(req: Request): string | null {
  const auth = req.headers?.authorization;
  if (typeof auth !== 'string') return null;
  const m = /^Bearer\s+(.+)$/i.exec(auth.trim());
  return m ? m[1].trim() : null;
}

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(
    private readonly keys: KeysService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    const secret = extractBearer(req);
    if (!secret) throw new UnauthorizedException('缺少访问密钥（Authorization: Bearer <key>）');

    const key = await this.keys.verify(secret);
    if (!key) throw new UnauthorizedException('无效或未授权的访问密钥');

    // 端点声明的必需作用域
    const required = this.reflector.getAllAndOverride<KeyScope | KeyScope[]>(SCOPE_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const requiredList: KeyScope[] = required
      ? Array.isArray(required)
        ? required
        : [required]
      : [];
    if (requiredList.length && !requiredList.some((s) => key.scopes.includes(s))) {
      throw new UnauthorizedException('该访问密钥无权访问此接口');
    }
    return true;
  }
}

@Injectable()
export class AdminKeyGuard implements CanActivate {
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const adminKey = process.env.ADMIN_KEY;
    // 未配置 ADMIN_KEY：管理接口放开（兼容现有前端 / 引导生成首个 key）
    if (!adminKey) return true;

    const req = context.switchToHttp().getRequest<Request>();
    const bearer = extractBearer(req);
    const headerKey =
      typeof req.headers?.['x-admin-key'] === 'string'
        ? (req.headers['x-admin-key'] as string)
        : null;
    const provided = bearer || headerKey;
    if (!provided || !safeEqual(provided, adminKey)) {
      throw new UnauthorizedException('无效的管理员密钥（ADMIN_KEY）');
    }
    return true;
  }
}