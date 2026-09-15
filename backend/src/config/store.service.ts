/**
 * 配置存储 Service
 * 读写 backend/data/sources.json，提供增删改查 + key 脱敏。
 */
import { Injectable } from '@nestjs/common';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { SourceConfig, SourceView } from '../types';
import { runExclusive, atomicWriteJson } from './json-shared';

// src/config -> ../../data ; dist/config 编译后也是两层 -> ../../data ，均指向 backend/data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const CONFIG_FILE = path.join(DATA_DIR, 'sources.json');

/** 默认种子：5 个内置源，禁用 + 空 key + 优先级 1~5 */
const DEFAULT_SOURCES: SourceConfig[] = [
  {
    id: 'tavily-main', type: 'tavily', label: 'Tavily 官方', enabled: false, priority: 1,
    config: { apiKey: '', maxResults: 5, searchDepth: 'basic', useProxy: false, proxyId: '' },
  },
  {
    id: 'doubao-main', type: 'doubao', label: '豆包 / 火山引擎', enabled: false, priority: 2,
    config: { apiKey: '', count: 10, searchType: 'web', useProxy: false, proxyId: '' },
  },
  {
    id: 'brave-main', type: 'brave', label: 'Brave Search', enabled: false, priority: 3,
    config: { apiKey: '', count: 10, country: 'cn', searchLang: 'zh-hans', useProxy: false, proxyId: '' },
  },
  {
    id: 'exa-main', type: 'exa', label: 'Exa', enabled: false, priority: 4,
    config: { apiKey: '', numResults: 5, useProxy: false, proxyId: '' },
  },
  {
    id: 'browserbase-main', type: 'browserbase', label: 'Browserbase', enabled: false, priority: 5,
    config: { apiKey: '', numResults: 5, useProxy: false, proxyId: '' },
  },
];

/** 内置源类型 -> env 兜底 key 变量名 */
const ENV_KEY_MAP: Record<string, string | undefined> = {
  tavily: process.env.TAVILY_API_KEY,
  doubao: process.env.DOUBAO_API_KEY,
  brave: process.env.BRAVE_API_KEY,
  exa: process.env.EXA_API_KEY,
  browserbase: process.env.BROWSERBASE_API_KEY,
};

@Injectable()
export class StoreService {
  private async ensureFile(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    try {
      await readFile(CONFIG_FILE, 'utf-8');
    } catch {
      await writeFile(CONFIG_FILE, JSON.stringify({ sources: DEFAULT_SOURCES }, null, 2), 'utf-8');
    }
  }

  /** 读全部源（含 env 兜底 key） */
  async getSources(): Promise<SourceConfig[]> {
    await this.ensureFile();
    const raw = await readFile(CONFIG_FILE, 'utf-8');
    let parsed: { sources?: SourceConfig[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { sources: [] };
    }
    let sources = Array.isArray(parsed.sources) ? parsed.sources : [];

    // env 兜底：配置里 apiKey 为空时用环境变量注入
    sources = sources.map((s) => {
      if (!s.config?.apiKey) {
        const envKey = ENV_KEY_MAP[s.type];
        if (envKey) return { ...s, config: { ...s.config, apiKey: envKey } };
      }
      return s;
    });
    return sources;
  }

  private async writeSources(sources: SourceConfig[]): Promise<void> {
    await this.ensureFile();
    await atomicWriteJson(CONFIG_FILE, { sources });
  }

  private genId(type: string): string {
    return `${type}-${crypto.randomBytes(4).toString('hex')}`;
  }

  /** 新增源 */
  async createSource(patch: Partial<SourceConfig>): Promise<SourceConfig> {
    return runExclusive(async () => {
      const sources = await this.getSources();
      const source: SourceConfig = {
        id: this.genId(patch.type || 'custom'),
        type: patch.type || 'custom',
        label: patch.label || patch.type || '自定义',
        enabled: !!patch.enabled,
        priority: this.normalizePriority(patch.priority, sources),
        config: patch.config || {},
        createdAt: new Date().toISOString(),
      };
      sources.push(source);
      await this.writeSources(sources);
      return source;
    });
  }

  /** 更新源（合并 config） */
  async updateSource(id: string, patch: Partial<SourceConfig>): Promise<SourceConfig | null> {
    return runExclusive(async () => {
      const sources = await this.getSources();
      const idx = sources.findIndex((s) => s.id === id);
      if (idx === -1) return null;

      const cur = sources[idx];
      cur.type = patch.type ?? cur.type;
      cur.label = patch.label ?? cur.label;
      cur.enabled = patch.enabled !== undefined ? !!patch.enabled : cur.enabled;
      cur.priority = patch.priority !== undefined ? Number(patch.priority) : cur.priority;
      cur.config = patch.config !== undefined ? { ...cur.config, ...patch.config } : cur.config;
      cur.updatedAt = new Date().toISOString();
      sources[idx] = cur;
      await this.writeSources(sources);
      return cur;
    });
  }

  /** 删除源 */
  async deleteSource(id: string): Promise<SourceConfig | null> {
    return runExclusive(async () => {
      const sources = await this.getSources();
      const idx = sources.findIndex((s) => s.id === id);
      if (idx === -1) return null;
      const [removed] = sources.splice(idx, 1);
      await this.writeSources(sources);
      return removed;
    });
  }

  private normalizePriority(p: any, sources: SourceConfig[]): number {
    const max = Math.max(0, ...sources.map((s) => Number(s.priority) || 0)) + 1;
    return Number(p) || max;
  }

  /** 对外脱敏输出：key 永不回传明文 */
  toView(sources: SourceConfig[]): SourceView[] {
    return sources.map((s) => ({
      id: s.id,
      type: s.type,
      label: s.label,
      enabled: s.enabled,
      priority: Number(s.priority) || 0,
      hasApiKey: !!(s.config && s.config.apiKey),
      config: { ...(s.config || {}), apiKey: s.config?.apiKey ? true : null },
    }));
  }
}