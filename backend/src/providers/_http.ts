/**
 * 内部 HTTP 工具：封装 fetch + 超时 + 非 2xx 抛错 + JSON 解析。
 * 使用 undici 的 fetch（而非 Node 全局 fetch）—— 因为 Node 全局 fetch 的
 * dispatcher 参数不生效，导致配了代理也走不通；undici 的 fetch 能正确识别代理。
 */
import { fetch } from 'undici';

export class ProviderError extends Error {
  status?: number;
  body?: any;
  constructor(message: string, opts: { status?: number; body?: any } = {}) {
    super(message);
    this.name = 'ProviderError';
    this.status = opts.status;
    this.body = opts.body;
  }
}

/** 带超时的 fetch + JSON 解析，非 2xx 抛 ProviderError；支持可选 dispatcher（代理） */
export async function requestJson(
  url: string,
  init: RequestInit & { timeout?: number; dispatcher?: any } = {},
): Promise<any> {
  const { timeout = 15000, dispatcher, ...rest } = init;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let res: Response;
  try {
    res = await (fetch as any)(url, { ...rest, signal: controller.signal, dispatcher });
  } catch (err: any) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new ProviderError(`请求超时（${timeout}ms）`);
    if (err.name === 'ConnectTimeoutError') throw new ProviderError(`代理连接超时`);
    throw new ProviderError(`网络错误：${err.message}`);
  }
  clearTimeout(timer);

  const text = await res.text().catch(() => '');
  let body: any;
  try {
    body = text ? JSON.parse(text) : {};
  } catch {
    body = { raw: text };
  }

  if (!res.ok) {
    const detail = body?.error?.message || body?.message || JSON.stringify(body).slice(0, 200);
    throw new ProviderError(`HTTP ${res.status}：${detail || res.statusText}`, { status: res.status, body });
  }
  return body;
}

/** 未配置 key 时抛错（failover 会捕获并跳过） */
export function requireKey(k: string | undefined, name: string): void {
  if (!k) {
    throw new ProviderError(`${name}：未配置 API Key，请到管理页填写并启用`);
  }
}