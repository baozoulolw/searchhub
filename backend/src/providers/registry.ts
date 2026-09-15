/**
 * 提供者注册表：type -> adapter
 * 所有内置适配器在此注册。新增搜索源 = 加一个 adapter 文件 + 这里注册。
 */
import { SearchAdapter, FieldDef } from '../types';
import { tavilyAdapter } from './tavily';
import { doubaoAdapter } from './doubao';
import { braveAdapter } from './brave';
import { exaAdapter } from './exa';
import { browserbaseAdapter } from './browserbase';

export const PROVIDER_REGISTRY: Record<string, SearchAdapter> = {
  tavily: tavilyAdapter,
  doubao: doubaoAdapter,
  brave: braveAdapter,
  exa: exaAdapter,
  browserbase: browserbaseAdapter,
};

/** 所有已注册适配器元信息（含字段定义，供管理页表单渲染） */
export function listProviderMetas(): SearchAdapter['meta'][] {
  return Object.values(PROVIDER_REGISTRY).map((p) => p.meta);
}

/** 用适配器 meta 的字段 + 传入默认值，生成一份新源的默认 config */
export function buildDefaultConfig(type: string): Record<string, any> {
  const adapter = PROVIDER_REGISTRY[type];
  if (!adapter) return {};
  const config: Record<string, any> = {};
  for (const f of adapter.meta.fields) {
    if (f.name !== 'apiKey' && f.default !== undefined) config[f.name] = f.default;
    else config[f.name] = f.type === 'number' ? 0 : '';
  }
  return config;
}

/** 所有字段定义聚合（供类型下拉展示描述） */
export function fieldCount(type: string): number {
  return PROVIDER_REGISTRY[type]?.meta.fields.length ?? 0;
}