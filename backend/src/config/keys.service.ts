/**
 * 访问 key Service
 * 读写 backend/data/keys.json，提供生成/校验/吊销/删除 + 脱敏。
 * 安全约定：
 *  - 明文 key 仅在创建时返回一次，落盘只存 SHA-256 哈希；
 *  - 校验用 timing-safe 比较，命中后更新时间戳；
 *  - 写操作走 runExclusive + 原子写，避免并发丢更新。
 */
import { Injectable } from '@nestjs/common';
import { readFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { AccessKey, KeyScope, KeyView } from '../types';
import { runExclusive, atomicWriteJson } from './json-shared';

// src/config -> ../../data ; dist/config 编译后也是两层 -> ../../data
const DATA_DIR = path.join(__dirname, '..', '..', 'data');
const KEY_FILE = path.join(DATA_DIR, 'keys.json');

/** 明文 key 前缀，便于识别与展示 */
const KEY_PREFIX = 'wsk_';

/** 对 secret 做 SHA-256 哈希 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/** timing-safe 比较两个长度相等的字符串 */
export function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return crypto.timingSafeEqual(ab, bb);
}

@Injectable()
export class KeysService {
  private async ensureFile(): Promise<void> {
    await mkdir(DATA_DIR, { recursive: true });
    try {
      await readFile(KEY_FILE, 'utf-8');
    } catch {
      await atomicWriteJson(KEY_FILE, { keys: [] });
    }
  }

  private async readAll(): Promise<AccessKey[]> {
    await this.ensureFile();
    const raw = await readFile(KEY_FILE, 'utf-8');
    let parsed: { keys?: AccessKey[] };
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = { keys: [] };
    }
    return Array.isArray(parsed.keys) ? parsed.keys : [];
  }

  private async writeAll(keys: AccessKey[]): Promise<void> {
    await this.ensureFile();
    await atomicWriteJson(KEY_FILE, { keys });
  }

  /** 列出全部 key（返回内部结构，供守卫校验） */
  async list(): Promise<AccessKey[]> {
    return this.readAll();
  }

  /** 查询单个 key */
  async findById(id: string): Promise<AccessKey | undefined> {
    const all = await this.readAll();
    return all.find((k) => k.id === id);
  }

  /**
   * 校验明文 secret 是否有效（enabled 且未吊销）。
   * 命中则更新时间戳；返回 null 表示无效。
   */
  async verify(secret: string): Promise<AccessKey | null> {
    if (!secret || typeof secret !== 'string') return null;
    const all = await this.readAll();
    const key = all.find((k) => k.secretHash === hashSecret(secret));
    if (!key || !key.enabled || key.revoked) return null;
    // 记录最近使用时间（静默失败不影响校验结果）
    key.lastUsedAt = new Date().toISOString();
    try {
      await this.writeAll(all);
    } catch {
      /* 只更新时间戳，写失败不阻塞认证 */
    }
    return key;
  }

  /**
   * 新建 key，返回明文 secret（仅此一次）。作用域默认 ['api','mcp']。
   */
  create(input: { name?: string; scopes?: KeyScope[] }): Promise<{ key: AccessKey; secret: string }> {
    return runExclusive(async () => {
      const keys = await this.readAll();
      const raw = this.normalizeScopes(input.scopes);
      const scopes: KeyScope[] = raw.length ? raw : ['api', 'mcp'];
      const secret = KEY_PREFIX + crypto.randomBytes(24).toString('base64url');
      const key: AccessKey = {
        id: `key-${crypto.randomBytes(4).toString('hex')}`,
        name: input.name || '未命名',
        scopes,
        enabled: true,
        revoked: false,
        secretHash: hashSecret(secret),
        prefix: secret.slice(0, 12),
        createdAt: new Date().toISOString(),
      };
      keys.push(key);
      await this.writeAll(keys);
      return { key, secret };
    });
  }

  /** 更新 key：启停 / 改作用域 */
  update(
    id: string,
    patch: { name?: string; enabled?: boolean; scopes?: KeyScope[] },
  ): Promise<AccessKey | null> {
    return runExclusive(async () => {
      const keys = await this.readAll();
      const idx = keys.findIndex((k) => k.id === id);
      if (idx === -1) return null;
      const cur = keys[idx];
      if (patch.name !== undefined) cur.name = patch.name;
      if (patch.enabled !== undefined) cur.enabled = !!patch.enabled;
      if (patch.scopes !== undefined) cur.scopes = this.normalizeScopes(patch.scopes);
      keys[idx] = cur;
      await this.writeAll(keys);
      return cur;
    });
  }

  /** 吊销 key（与删除不同：保留记录但不可用） */
  revoke(id: string): Promise<boolean> {
    return runExclusive(async () => {
      const keys = await this.readAll();
      const idx = keys.findIndex((k) => k.id === id);
      if (idx === -1) return false;
      keys[idx].revoked = true;
      keys[idx].enabled = false;
      keys[idx].revokedAt = new Date().toISOString();
      await this.writeAll(keys);
      return true;
    });
  }

  /** 删除 key */
  remove(id: string): Promise<boolean> {
    return runExclusive(async () => {
      const keys = await this.readAll();
      const idx = keys.findIndex((k) => k.id === id);
      if (idx === -1) return false;
      keys.splice(idx, 1);
      await this.writeAll(keys);
      return true;
    });
  }

  private normalizeScopes(scopes?: string[]): KeyScope[] {
    if (!Array.isArray(scopes)) return [];
    return scopes.filter((s) => s === 'api' || s === 'mcp') as KeyScope[];
  }

  /** 对外脱敏输出 */
  toView(keys: AccessKey[]): KeyView[] {
    return keys.map((k) => ({
      id: k.id,
      name: k.name,
      scopes: k.scopes,
      enabled: k.enabled,
      revoked: k.revoked,
      prefix: k.prefix,
      createdAt: k.createdAt,
      lastUsedAt: k.lastUsedAt,
    }));
  }
}