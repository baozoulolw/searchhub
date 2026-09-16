/**
 * failover 搜索引擎 Service
 * 依优先级升序调用启用源，第一个成功返回，失败切换下一个，全败返回失败。
 * 支持每个源通过 useProxy+proxyId 使用指定代理。
 * 每次请求（channel 由调用方标记）与每次引擎尝试都会被埋点到 StatsService。
 */
import { Injectable } from '@nestjs/common';
import { PROVIDER_REGISTRY } from '../providers/registry';
import { ProxiesService } from '../config/proxies.service';
import { StatsService, StatsChannel } from '../stats/stats.service';
import { SourceConfig, SearchResult, FailedTrial, AdapterContext } from '../types';

const DEFAULT_TIMEOUT = 15000;

export interface SearchOptions {
  sources: SourceConfig[];
  onlyTypes?: string[];
  excludeTypes?: string[];
  timeout?: number;
  channel?: StatsChannel; // 调用渠道：admin / api / mcp，用于统计埋点
}

@Injectable()
export class SearchEngineService {
  constructor(
    private readonly proxies: ProxiesService,
    private readonly stats: StatsService,
  ) {}

  async search(query: string, opts: SearchOptions): Promise<SearchResult> {
    if (!query || !String(query).trim()) {
      return { success: false, tried: [], message: '搜索词不能为空' };
    }

    const channel = opts.channel || 'admin';
    const startedAt = Date.now();
    const tried: FailedTrial[] = [];
    const { sources, onlyTypes, excludeTypes } = opts;
    const attempts: { provider: string; providerLabel: string; ok: boolean; error?: string; itemsCount?: number; elapsedMs: number }[] = [];

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

    let success = false;
    let resultProvider: string | undefined;
    let resultProviderLabel: string | undefined;

    for (const src of candidates) {
      const adapter = PROVIDER_REGISTRY[src.type];
      const attemptStart = Date.now();
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
        const elapsedMs = Date.now() - attemptStart;
        const itemsCount = res.items?.length || 0;
        attempts.push({
          provider: src.type,
          providerLabel: src.label || adapter.meta.label || src.type,
          ok: true,
          itemsCount,
          elapsedMs,
        });
        success = true;
        resultProvider = src.type;
        resultProviderLabel = src.label || adapter.meta.label || src.type;
        this.stats.record({
          channel,
          query: String(query).trim(),
          success: true,
          resultProvider,
          resultProviderLabel,
          elapsedMs: Date.now() - startedAt,
          attempts,
        });
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
        const elapsedMs = Date.now() - attemptStart;
        attempts.push({
          provider: src.type,
          providerLabel: src.label || src.type,
          ok: false,
          error: err?.message || String(err),
          elapsedMs,
        });
        tried.push({
          provider: src.type,
          providerLabel: src.label || src.type,
          error: err?.message || String(err),
        });
      }
    }

    this.stats.record({
      channel,
      query: String(query).trim(),
      success,
      resultProvider,
      resultProviderLabel,
      elapsedMs: Date.now() - startedAt,
      attempts,
    });

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