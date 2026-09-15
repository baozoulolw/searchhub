/**
 * Exa 适配器（语义搜索）
 * POST https://api.exa.ai/search  |  x-api-key
 * 返回 results
 */
import { SearchAdapter, SearchItem, AdapterContext } from '../types';
import { requestJson, requireKey } from './_http';

export const exaAdapter: SearchAdapter = {
  meta: {
    type: 'exa',
    label: 'Exa',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'numResults', label: '结果条数', type: 'number', default: 5, min: 1, max: 25 },
    ],
  },
  async search(query, config, ctx: AdapterContext = {}) {
    const { apiKey, numResults = 5 } = config || {};
    requireKey(apiKey, 'Exa');

    const body = await requestJson('https://api.exa.ai/search', {
      method: 'POST',
      dispatcher: ctx?.dispatcher,
      headers: { 'Content-Type': 'application/json', 'x-api-key': apiKey },
      body: JSON.stringify({ query, numResults: Number(numResults) || 5, contents: { text: true } }),
    });

    const items: SearchItem[] = (Array.isArray(body?.results) ? body.results : [])
      .map((r: any) => ({
        title: r.title || '',
        link: r.url || '',
        snippet: (r.text || r.highlights?.[0] || '').slice(0, 500),
        source: r.publishedDate ? new URL(r.url).hostname : '',
        publishedAt: r.publishedDate || '',
      }))
      .filter((i: SearchItem) => i.link);

    return { provider: 'exa', providerLabel: 'Exa', items };
  },
};