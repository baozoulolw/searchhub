/**
 * 调用统计 / 调用日志 Service
 * 记录每次搜索请求（含每次引擎尝试），聚合出 summary / engines / series，
 * 并对外提供分页日志查询。仿照 sources/proxies 的 JSON 持久化模式：
 * 落盘 backend/data/stats.json，保留最近 MAX_REQUESTS 条，超出滚动淘汰。
 */
import { Injectable } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { runExclusive, atomicWriteJson } from '../config/json-shared';

/** 搜索入口渠道 */
export type StatsChannel = 'admin' | 'api' | 'mcp';

/** 单次引擎尝试（成功或失败均记录，失败的错误信息保留） */
export interface AttemptLog {
  provider: string;
  providerLabel: string;
  ok: boolean;
  error?: string;
  itemsCount?: number;
  elapsedMs: number;
}

/** 一次搜索请求的完整日志 */
export interface RequestLog {
  id: string;
  ts: string; // ISO 时间
  channel: StatsChannel;
  query: string;
  success: boolean;
  resultProvider?: string;
  resultProviderLabel?: string;
  elapsedMs: number;
  attempts: AttemptLog[];
}

// src/stats -> ../../data ; dist/stats 编译后也是两层 -> ../../data ，均指向 backend/data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const STATS_FILE = path.join(DATA_DIR, 'stats.json');
const MAX_REQUESTS = 2000;

export interface EngineStat {
  provider: string;
  providerLabel: string;
  calls: number; // 被调用次数（= 成功尝试 + 失败尝试）
  success: number;
  fail: number;
  successRate: number;
  avgLatencyMs: number;
  itemsCount: number; // 累计命中条数
}

export interface SeriesPoint {
  time: string; // 桶标签，如 '09-16 14' 或 '09-15'
  total: number;
  success: number;
  fail: number;
}

export interface LogsQuery {
  page?: number;
  pageSize?: number;
  channel?: StatsChannel;
  provider?: string;
  ok?: 'true' | 'false';
  q?: string; // query 关键字（不区分大小写）
}

@Injectable()
export class StatsService {
  private requests: RequestLog[] = [];
  private loaded = false;

  private async ensureLoaded(): Promise<void> {
    if (this.loaded) return;
    this.loaded = true;
    try {
      const raw = await readFile(STATS_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      this.requests = Array.isArray(parsed?.requests) ? parsed.requests : [];
    } catch {
      this.requests = [];
    }
  }

  private async persist(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    await atomicWriteJson(STATS_FILE, { requests: this.requests });
  }

  /** 追加一条请求日志（裁剪到 MAX 条后原子落盘） */
  record(req: Omit<RequestLog, 'id' | 'ts'>): void {
    const entry: RequestLog = {
      id: randomUUID().slice(0, 8),
      ts: new Date().toISOString(),
      ...req,
    };
    // 异步落盘，异常静默（统计不应影响搜索主链路）
    void runExclusive(async () => {
      await this.ensureLoaded();
      this.requests.push(entry);
      if (this.requests.length > MAX_REQUESTS) {
        this.requests = this.requests.slice(this.requests.length - MAX_REQUESTS);
      }
      await this.persist();
    });
  }

  /** 总览数字 */
  async getSummary() {
    await this.ensureLoaded();
    const reqs = this.requests;
    const now = new Date().getTime();
    const dayAgo = now - 24 * 3600 * 1000;
    const successCount = reqs.filter((r) => r.success).length;
    const failCount = reqs.length - successCount;
    const avgMs = reqs.length
      ? Math.round(reqs.reduce((s, r) => s + r.elapsedMs, 0) / reqs.length)
      : 0;
    const attempts = reqs.reduce((s, r) => s + r.attempts.length, 0);
    const byChannel = {
      admin: 0,
      api: 0,
      mcp: 0,
    };
    for (const r of reqs) {
      if (byChannel[r.channel] !== undefined) byChannel[r.channel]++;
    }
    return {
      total: reqs.length,
      success: successCount,
      fail: failCount,
      successRate: reqs.length ? Math.round((successCount / reqs.length) * 1000) / 10 : 0,
      avgLatencyMs: avgMs,
      attempts,
      last24h: reqs.filter((r) => new Date(r.ts).getTime() >= dayAgo).length,
      byChannel,
    };
  }

  /** 按引擎聚合：调用次数（每次尝试）、成功/失败、成功率、平均耗时 */
  async getEngines(): Promise<EngineStat[]> {
    await this.ensureLoaded();
    const map = new Map<string, EngineStat>();
    const ensure = (provider: string, label: string) => {
      let s = map.get(provider);
      if (!s) {
        s = { provider, providerLabel: label, calls: 0, success: 0, fail: 0, successRate: 0, avgLatencyMs: 0, itemsCount: 0 };
        map.set(provider, s);
      }
      return s;
    };
    for (const req of this.requests) {
      for (const a of req.attempts) {
        const s = ensure(a.provider, a.providerLabel);
        s.calls++;
        if (a.ok) {
          s.success++;
          s.itemsCount += a.itemsCount || 0;
        } else {
          s.fail++;
        }
        s.avgLatencyMs += a.elapsedMs;
      }
    }
    const list = [...map.values()].map((s) => ({
      ...s,
      successRate: s.calls ? Math.round((s.success / s.calls) * 1000) / 10 : 0,
      avgLatencyMs: s.calls ? Math.round(s.avgLatencyMs / s.calls) : 0,
    }));
    list.sort((a, b) => b.calls - a.calls);
    return list;
  }

  /** 时间序列：24h 按小时分桶，7d/30d 按天分桶 */
  async getSeries(range: string = '24h'): Promise<SeriesPoint[]> {
    await this.ensureLoaded();
    const hourBuckets = range === '24h';
    const days = range === '7d' ? 7 : range === '30d' ? 30 : null;
    const start = hourBuckets
      ? new Date(Date.now() - 24 * 3600 * 1000)
      : new Date(Date.now() - (days ?? 7) * 24 * 3600 * 1000);

    const pad = (n: number) => `${n}`.padStart(2, '0');
    const key = (t: number) => (hourBuckets ? Math.floor(t / 3600000) : Math.floor(t / 86400000));
    const fmt = (k: number) => {
      if (hourBuckets) {
        const d = new Date(k * 3600000);
        const h = `${d.getHours()}`.padStart(2, '0');
        return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${h}:00`;
      }
      const d = new Date(k * 86400000);
      return `${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    };

    const current = hourBuckets ? Math.floor(Date.now() / 3600000) : Math.floor(Date.now() / 86400000);
    const startKey = key(start.getTime());
    const buckets = new Map<
      number,
      { total: number; success: number; fail: number }
    >();
    // 预填完整时间轴，保证无请求时段也出现（占位 0）
    for (let k = startKey; k <= current; k++) {
      buckets.set(k, { total: 0, success: 0, fail: 0 });
    }
    const matched = hourBuckets ? 3600000 : 86400000;
    for (const r of this.requests) {
      const t = new Date(r.ts).getTime();
      if (t < start.getTime()) continue;
      const k = key(t);
      const b = buckets.get(k);
      if (!b) continue;
      b.total++;
      if (r.success) b.success++;
      else b.fail++;
    }
    return [...buckets.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([k, v]) => ({ time: fmt(k), ...v }));
  }

  /** 分页查询调用日志（倒序最新在前），支持 channel / provider / ok / 关键字过滤 */
  async getLogs(query: LogsQuery): Promise<{ items: RequestLog[]; total: number }> {
    await this.ensureLoaded();
    const page = Math.max(1, Number(query.page) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(query.pageSize) || 20));
    const q = (query.q || '').trim().toLowerCase();
    const provider = (query.provider || '').trim().toLowerCase();
    let ok: boolean | undefined;
    if (query.ok === 'true') ok = true;
    else if (query.ok === 'false') ok = false;

    let rows = this.requests;
    if (query.channel) rows = rows.filter((r) => r.channel === query.channel);
    if (provider) rows = rows.filter((r) => r.attempts.some((a) => a.provider.toLowerCase() === provider));
    if (ok !== undefined) rows = rows.filter((r) => r.success === ok);
    if (q) rows = rows.filter((r) => r.query.toLowerCase().includes(q));

    const total = rows.length;
    const sorted = rows.slice().sort((a, b) => (a.ts < b.ts ? 1 : -1));
    const offset = (page - 1) * pageSize;
    const items = sorted.slice(offset, offset + pageSize);
    return { items, total };
  }

  /** 清空全部调用统计 */
  async clear(): Promise<void> {
    await runExclusive(async () => {
      this.requests = [];
      await this.persist();
    });
  }
}