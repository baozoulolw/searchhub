/**
 * 后端 API 调用封装
 */

let adminKey = localStorage.getItem('ws_admin_key') || '';

/** 设置管理端密钥（ADMIN_KEY）。设置后在所有管理请求上附带 X-Admin-Key 头，持久化到 localStorage。 */
export function setAdminKey(key) {
  adminKey = (key || '').trim();
  if (adminKey) localStorage.setItem('ws_admin_key', adminKey);
  else localStorage.removeItem('ws_admin_key');
}
export function getAdminKey() {
  return adminKey;
}

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
  if (adminKey) headers['X-Admin-Key'] = adminKey;

  const res = await fetch(url, { ...options, headers });
  let data;
  try {
    data = await res.json();
  } catch {
    data = {};
  }
  if (!res.ok) {
    // NestJS 错误响应用 { message, ... }，搜索失败会带 message/tried
    const msg = data?.message || `请求失败（HTTP ${res.status}）`;
    const err = new Error(typeof msg === 'string' ? msg : '请求失败');
    err.status = res.status;
    err.payload = data;
    throw err;
  }
  return data;
}

export const api = {
  // 搜索（failover）
  search(query, { onlyTypes, excludeTypes } = {}) {
    return request('/api/search', {
      method: 'POST',
      body: JSON.stringify({ query, onlyTypes, excludeTypes }),
    });
  },

  // 源管理
  listSources() {
    return request('/api/providers');
  },
  getRegistry() {
    return request('/api/providers/registry');
  },
  createSource(body) {
    return request('/api/providers', { method: 'POST', body: JSON.stringify(body) });
  },
  updateSource(id, body) {
    return request(`/api/providers/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  deleteSource(id) {
    return request(`/api/providers/${id}`, { method: 'DELETE' });
  },
  testSource(id, query) {
    return request(`/api/providers/test/${id}`, { method: 'POST', body: JSON.stringify({ query }) });
  },

  // 代理管理
  listProxies() {
    return request('/api/proxies');
  },
  listProxyOptions() {
    return request('/api/proxies/options');
  },
  createProxy(body) {
    return request('/api/proxies', { method: 'POST', body: JSON.stringify(body) });
  },
  updateProxy(id, body) {
    return request(`/api/proxies/${id}`, { method: 'PUT', body: JSON.stringify(body) });
  },
  deleteProxy(id) {
    return request(`/api/proxies/${id}`, { method: 'DELETE' });
  },
  testProxy(id) {
    return request(`/api/proxies/${id}/test`, { method: 'POST' });
  },

  // 访问密钥管理
  listKeys() {
    return request('/api/keys');
  },
  createKey(body) {
    return request('/api/keys', { method: 'POST', body: JSON.stringify(body) });
  },
  updateKey(id, body) {
    return request(`/api/keys/${id}`, { method: 'PATCH', body: JSON.stringify(body) });
  },
  revokeKey(id) {
    return request(`/api/keys/${id}/revoke`, { method: 'POST' });
  },
  deleteKey(id) {
    return request(`/api/keys/${id}`, { method: 'DELETE' });
  },
};