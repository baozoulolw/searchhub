/**
 * failover 搜索引擎 Service
 * 依优先级升序调用启用源，第一个成功返回，失败切换下一个，全败返回失败。
 * 支持每个源通过 useProxy+proxyId 使用指定代理。
 */
import { Injectable } from '@nestjs/common';
import { PROVIDER_REGISTRY } from '../providers/registry';
import { ProxiesService } from '../config/proxies.service';
import { SourceConfig, SearchResult, FailedTrial, AdapterContext } from '../types';

const DEFAULT_TIMEOUT = 15000;

export interface SearchOptions {
  sources: SourceConfig[];
  onlyTypes?: string[];
  excludeTypes?: string[];
  timeout?: number;
}

@Injectable()
export class SearchEngineService {
  constructor(private readonly proxies: ProxiesService) {}

  async search(query: string, opts: SearchOptions): Promise<SearchResult> {
    if (!query || !String(query).trim()) {
      return { success: false, tried: [], message: '搜索词不能为空' };
    }

    const tried: FailedTrial[] = [];
    const { sources, onlyTypes, excludeTypes } = opts;

    let candidates = (sources || []).filter((s) => {
      if (onlyTypes?.length && !onlyTypes.includes(s.type)) return false;
      if (excludeTypes?.length && excludeTypes.includes(s.type)) return false;
      if (!s.enabled) return false;
      if (!s.config?.apiKey) return false;
      return !!PROVIDER_REGISTRY[s.type];
    });

    candidates = candidates
      .slice()
      .sort((a, b) => (Number(a.priority) || 0) - (Number(b.priority) || 0));

    for (const src of candidates) {
      const adapter = PROVIDER_REGISTRY[src.type];
      try {
        // 若源启用了代理，构建对应 dispatcher 透传给 adapter
        const ctx: AdapterContext = {};
        const useProxy = !!src.config?.useProxy;
        if (useProxy) {
          const agent = await this.proxies.buildAgent(src.config?.proxyId);
          if (!agent) {
            throw new Error(`启用了代理但未找到有效的代理配置（proxyId=${src.config?.proxyId}）`);
          }
          ctx.dispatcher = agent;
        }

        const res = await this.withTimeout(
          adapter.search(String(query).trim(), src.config, ctx),
          opts.timeout || DEFAULT_TIMEOUT,
          src.label,
        );
        return {
          success: true,
          provider: src.type,
          providerLabel: src.label || adapter.meta.label || src.type,
          query,
          items: res.items || [],
          tried,
          extra: res.answer ? { answer: res.answer } : undefined,
        };
      } catch (err: any) {
        tried.push({
          provider: src.type,
          providerLabel: src.label || src.type,
          error: err?.message || String(err),
        });
      }
    }

    return {
      success: false,
      tried,
      message: candidates.length
        ? '所有启用的搜索源均不可用，全部失败'
        : '没有可用的搜索源（未启用 / 未配置 Key）',
    };
  }

  private async withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: NodeJS.Timeout;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} 请求超时（${ms}ms）`)), ms);
    });
    try {
      return await Promise.race([promise, timeout]);
    } finally {
      clearTimeout(timer!);
    }
  }
}