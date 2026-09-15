/**
 * Browserbase Search 适配器（基于 Exa 导航索引）
 * 端口初稿：POST https://api.browserbase.com/v1/search/web  |  Bearer
 * ⚠️ 以实现时官方文档核对为准；若端点不符，仅此文件 URL 需调整。
 */
import { SearchAdapter, SearchItem, AdapterContext } from '../types';
import { requestJson, requireKey } from './_http';

export const browserbaseAdapter: SearchAdapter = {
  meta: {
    type: 'browserbase',
    label: 'Browserbase',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'numResults', label: '结果条数', type: 'number', default: 5, min: 1, max: 25 },
    ],
  },
  async search(query, config, ctx: AdapterContext = {}) {
    const { apiKey, numResults = 5 } = config || {};
    requireKey(apiKey, 'Browserbase');

    const body = await requestJson('https://api.browserbase.com/v1/search/web', {
      method: 'POST',
      dispatcher: ctx?.dispatcher,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ query, numResults: Number(numResults) || 5 }),
    });

    const results = Array.isArray(body?.results) ? body.results : (Array.isArray(body?.data) ? body.data : []);
    const items: SearchItem[] = results
      .map((r: any) => ({
        title: r.title || r.description || '',
        link: r.url || '',
        snippet: r.description || r.text || '',
        source: r.origin || '',
      }))
      .filter((i: SearchItem) => i.link);

    return { provider: 'browserbase', providerLabel: 'Browserbase', items };
  },
};