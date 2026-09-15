/**
 * 全局类型定义
 */

/** 一条搜索源配置（持久化到 sources.json 的结构） */
export interface SourceConfig {
  id: string;
  type: string;
  label: string;
  enabled: boolean;
  priority: number;
  config: Record<string, any>; // apiKey、maxResults 等适配器自定义字段
  createdAt?: string;
  updatedAt?: string;
}

/** 对外输出的源（key 脱敏） */
export interface SourceView extends Omit<SourceConfig, 'config'> {
  hasApiKey: boolean;
  config: Record<string, any>;
}

/** 单个搜索结果项（各源归一化后的统一结构） */
export interface SearchItem {
  title: string;
  link: string;
  snippet: string;
  source?: string;
  publishedAt?: string;
}

/** 某源尝试失败记录 */
export interface FailedTrial {
  provider: string;
  providerLabel: string;
  error: string;
}

/** failover 搜索结果（成功态） */
export interface SearchSuccess {
  success: true;
  provider: string;
  providerLabel: string;
  query: string;
  items: SearchItem[];
  tried: FailedTrial[];
  extra?: { answer?: string };
}

/** failover 搜索结果（失败态） */
export interface SearchFailure {
  success: false;
  tried: FailedTrial[];
  message: string;
}

export type SearchResult = SearchSuccess | SearchFailure;

/** 适配器请求上下文（引擎注入，如要用的代理 dispatcher） */
export interface AdapterContext {
  dispatcher?: any; // undici ProxyAgent，作为 fetch 的 dispatcher
}

/** 适配器统一契约 */
export interface SearchAdapter {
  meta: {
    type: string;
    label: string;
    fields: FieldDef[];
  };
  search(
    query: string,
    config: Record<string, any>,
    ctx?: AdapterContext,
  ): Promise<{ items: SearchItem[]; answer?: string; provider?: string; providerLabel?: string }>;
}

/** 适配器字段定义（驱动管理页表单） */
export interface FieldDef {
  name: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'proxy';
  required?: boolean;
  default?: any;
  min?: number;
  max?: number;
  options?: string[];
}

/** 代理配置（持久化） */
export interface ProxyConfig {
  id: string;
  name: string;
  protocol: 'http' | 'https' | 'socks';
  host: string;
  port: number;
  username?: string;
  password?: string;
  createdAt?: string;
  updatedAt?: string;
}

/** 对外输出的代理（口令脱敏） */
export interface ProxyView extends Omit<ProxyConfig, 'password' | 'username'> {
  hasUsername: boolean;
  hasPassword: boolean;
}

/** 访问 key 作用域：REST API / MCP */
export type KeyScope = 'api' | 'mcp';

/** 一条访问 key 配置（持久化到 keys.json 的结构，仅存哈希，不回存明文） */
export interface AccessKey {
  id: string;
  name: string;
  scopes: KeyScope[];
  enabled: boolean;
  revoked: boolean;
  secretHash: string; // SHA-256(secret)，用于校验
  prefix: string; // 明文 key 的前缀，便于管理页展示识别
  createdAt?: string;
  lastUsedAt?: string;
  revokedAt?: string;
}

/** 对外输出的 key（脱敏：不回传哈希/明文） */
export interface KeyView {
  id: string;
  name: string;
  scopes: KeyScope[];
  enabled: boolean;
  revoked: boolean;
  prefix: string;
  keyPreview?: string;
  createdAt?: string;
  lastUsedAt?: string;
}