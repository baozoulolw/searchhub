/**
 * Brave Search 适配器
 * GET https://api.search.brave.com/res/v1/web/search  |  X-Subscription-Token
 * 返回 web.results
 */
import { SearchAdapter, SearchItem, AdapterContext } from '../types';
import { requestJson, requireKey } from './_http';

export const braveAdapter: SearchAdapter = {
  meta: {
    type: 'brave',
    label: 'Brave Search',
    fields: [
      { name: 'apiKey', label: 'API Key', type: 'text', required: true },
      { name: 'count', label: '结果条数', type: 'number', default: 10, min: 1, max: 20 },
      { name: 'country', label: '国家', type: 'text', default: 'cn' },
      // Brave 的 search_lang 是固定枚举：简体中文用 zh-hans，繁体用 zh-hant（zh / zh-cn 均非法会 422）
      { name: 'searchLang', label: '语言', type: 'text', default: 'zh-hans' },
    ],
  },
  async search(query, config, ctx: AdapterContext = {}) {
    const { apiKey, count = 10, country = '', searchLang = '' } = config || {};
    requireKey(apiKey, 'Brave Search');

    const url = new URL('https://api.search.brave.com/res/v1/web/search');
    url.searchParams.set('q', query);
    url.searchParams.set('count', String(Number(count) || 10));
    if (country) url.searchParams.set('country', country);
    if (searchLang) url.searchParams.set('search_lang', searchLang);

    const body = await requestJson(url.toString(), {
      method: 'GET',
      dispatcher: ctx?.dispatcher,
      headers: { Accept: 'application/json', 'X-Subscription-Token': apiKey },
    });

    const items: SearchItem[] = (body?.web?.results || [])
      .map((r: any) => ({
        title: r.title || '',
        link: r.url || '',
        snippet: r.description || '',
        source: r.profile?.long_name || '',
        publishedAt: r.page_age || '',
      }))
      .filter((i: SearchItem) => i.link);

    return { provider: 'brave', providerLabel: 'Brave Search', items };
  },
};