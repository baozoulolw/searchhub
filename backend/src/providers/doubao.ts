/**
 * 豆包 / 火山引擎搜索适配器
 * POST https://open.feedcoopapi.com/search_api/web_search  |  Bearer
 * 返回 Result.WebResults
 */
import { SearchAdapter, SearchItem, AdapterContext } from '../types';
import { requestJson, requireKey } from './_http';

export const doubaoAdapter: SearchAdapter = {
  meta: {
    type: 'doubao',
    label: '豆包 / 火山引擎',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'count', label: '结果条数', type: 'number', default: 10, min: 1, max: 50 },
      { name: 'searchType', label: '搜索类型', type: 'select', default: 'web', options: ['web', 'web_summary'] },
    ],
  },
  async search(query, config, ctx: AdapterContext = {}) {
    const { apiKey, count = 10, searchType = 'web' } = config || {};
    requireKey(apiKey, '豆包 / 火山引擎');

    const body = await requestJson('https://open.feedcoopapi.com/search_api/web_search', {
      method: 'POST',
      dispatcher: ctx?.dispatcher,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        Query: query,
        SearchType: searchType,
        Count: Number(count) || 10,
      }),
    });

    const results = body?.Result?.WebResults || [];
    const items: SearchItem[] = results
      .map((r: any) => ({
        title: r.Title || '',
        link: r.Url || '',
        snippet: r.Summary || r.Snippet || '',
        source: r.SiteName || '',
        publishedAt: r.PublishTime || '',
      }))
      .filter((i: SearchItem) => i.link);

    return { provider: 'doubao', providerLabel: '豆包 / 火山引擎', items };
  },
};