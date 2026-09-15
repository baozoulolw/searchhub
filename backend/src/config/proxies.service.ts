/**
 * 代理配置 Service
 * 读写 backend/data/proxies.json，提供 CRUD + 脱敏 + 构建 undici ProxyAgent。
 */
import { Injectable } from '@nestjs/common';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { ProxyAgent } from 'undici';
import { ProxyConfig, ProxyView } from '../types';
import { atomicWriteJson } from './json-shared';

const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const PROXY_FILE = path.join(DATA_DIR, 'proxies.json');

/** 已构建的 dispatcher 缓存：protocol://user:pass@host:port -> ProxyAgent */
const agentCache = new Map<string, ProxyAgent>();

@Injectable()
export class ProxiesService {
  private async ensureFile(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    try {
      await readFile(PROXY_FILE, 'utf-8');
    } catch {
      await writeFile(PROXY_FILE, JSON.stringify({ proxies: [] }, null, 2), 'utf-8');
    }
  }

  private async readAll(): Promise<ProxyConfig[]> {
    await this.ensureFile();
    const raw = await readFile(PROXY_FILE, 'utf-8');
    let parsed: { proxies?: ProxyConfig[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { proxies: [] };
    }
    return Array.isArray(parsed.proxies) ? parsed.proxies : [];
  }

  private async writeAll(proxies: ProxyConfig[]): Promise<void> {
    await this.ensureFile();
    await atomicWriteJson(PROXY_FILE, { proxies });
  }

  /** 列出全部代理 */
  async list(): Promise<ProxyConfig[]> {
    return this.readAll();
  }

  /** 查询单个代理 */
  async findById(id: string): Promise<ProxyConfig | undefined> {
    const all = await this.readAll();
    return all.find((p) => p.id === id);
  }

  /** 新增代理 */
  async create(input: Omit<ProxyConfig, 'id' | 'createdAt'>): Promise<ProxyConfig> {
    const proxies = await this.readAll();
    const item: ProxyConfig = {
      id: `proxy-${crypto.randomBytes(4).toString('hex')}`,
      protocol: input.protocol || 'http',
      host: input.host,
      port: Number(input.port) || 8080,
      name: input.name || `${input.protocol}://${input.host}:${input.port}`,
      username: input.username || '',
      password: input.password || '',
      createdAt: new Date().toISOString(),
    };
    proxies.push(item);
    await this.writeAll(proxies);
    return item;
  }

  /** 更新代理 */
  async update(id: string, patch: Partial<ProxyConfig>): Promise<ProxyConfig | null> {
    const proxies = await this.readAll();
    const idx = proxies.findIndex((p) => p.id === id);
    if (idx === -1) return null;
    const cur = proxies[idx];
    const next: ProxyConfig = {
      ...cur,
      protocol: patch.protocol ?? cur.protocol,
      host: patch.host ?? cur.host,
      port: patch.port !== undefined ? Number(patch.port) : cur.port,
      name: patch.name ?? cur.name,
      // 口令为空串表示不修改（前端不回显）
      username: patch.username !== undefined && patch.username !== '' ? patch.username : cur.username,
      password: patch.password !== undefined && patch.password !== '' ? patch.password : cur.password,
      updatedAt: new Date().toISOString(),
    };
    proxies[idx] = next;
    await this.writeAll(proxies);
    return next;
  }

  /** 删除代理 */
  async remove(id: string): Promise<boolean> {
    const proxies = await this.readAll();
    const idx = proxies.findIndex((p) => p.id === id);
    if (idx === -1) return false;
    proxies.splice(idx, 1);
    await this.writeAll(proxies);
    return true;
  }

  /** 对外脱敏 */
  toView(proxies: ProxyConfig[]): ProxyView[] {
    return proxies.map((p) => ({
      id: p.id,
      name: p.name,
      protocol: p.protocol,
      host: p.host,
      port: p.port,
      hasUsername: !!p.username,
      hasPassword: !!p.password,
    }));
  }

  /**
   * 根据代理配置构建（或取缓存的）undici ProxyAgent。
   * 返回可用作 fetch 的 dispatcher；返回 null 表示无法构建。
   */
  async buildAgent(id?: string): Promise<ProxyAgent | null> {
    if (!id) return null;
    const p = await this.findById(id);
    if (!p || !p.host) return null;

    const url = this.toProxyUrl(p);
    const cached = agentCache.get(url);
    if (cached) return cached;

    const agent = new ProxyAgent({
      uri: url,
      requestTls: { rejectUnauthorized: false }, // 允许自签/内部代理证书
      proxyTls: { rejectUnauthorized: false },
    });
    // 懒清理到 100 条，避免无界缓存
    if (agentCache.size >= 100) agentCache.clear();
    agentCache.set(url, agent);
    return agent;
  }

  /** 构建代理 URL：socks 也兼容（undici 支持 http/http+socks 字头） */
  private toProxyUrl(p: ProxyConfig): string {
    const hostPort = `${p.host}:${p.port}`;
    const auth = p.username ? `${p.username}${p.password ? `:${p.password}` : ''}@` : '';
    if (p.protocol === 'socks') return `socks5://${auth}${hostPort}`;
    return `http://${auth}${hostPort}`;
  }
}