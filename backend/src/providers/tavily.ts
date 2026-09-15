/**
 * Tavily 适配器
 * POST https://api.tavily.com/search  |  Authorization: Bearer <key>
 */
import { SearchAdapter, SearchItem, AdapterContext } from '../types';
import { requestJson, requireKey } from './_http';

export const tavilyAdapter: SearchAdapter = {
  meta: {
    type: 'tavily',
    label: 'Tavily 官方',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'maxResults', label: '结果条数', type: 'number', default: 5, min: 1, max: 20 },
      { name: 'searchDepth', label: '搜索深度', type: 'select', default: 'basic', options: ['basic', 'advanced'] },
    ],
  },
  async search(query, config, ctx: AdapterContext = {}) {
    const { apiKey, maxResults = 5, searchDepth = 'basic' } = config || {};
    requireKey(apiKey, 'Tavily 官方');

    const body = await requestJson('https://api.tavily.com/search', {
      method: 'POST',
      dispatcher: ctx?.dispatcher,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        query,
        max_results: Number(maxResults) || 5,
        search_depth: searchDepth,
      }),
    });

    const items: SearchItem[] = Array.isArray(body?.results)
      ? body.results
          .map((r: any) => ({
            title: r.title || '',
            link: r.url || '',
            snippet: r.content || r.raw_content || '',
            source: r.domain || '',
          }))
          .filter((i: SearchItem) => i.link)
      : [];

    return { provider: 'tavily', providerLabel: 'Tavily 官方', items, answer: body?.answer };
  },
};