<template>
  <div class="keys-page">
    <!-- 说明 -->
    <el-alert type="info" :closable="false" class="gap">
      <template #title>
        <el-icon style="margin-right: 6px"><Key /></el-icon>API / MCP 访问密钥
      </template>
      <div class="hint-desc">
        生成访问密钥后，可把它用于<strong>对外 REST 接口</strong>（<span class="mono">POST /api/v1/search</span>）或
        <strong>MCP server</strong>（<span class="mono">/mcp</span>）。密钥明文仅在创建时显示一次，后台只存哈希。
        密钥可设作用域（<span class="mono">api</span> / <span class="mono">mcp</span>），并随时启用、停用或吊销。
      </div>
    </el-alert>

    <!-- 管理员密钥（可选） -->
    <div class="admin-row">
      <div class="admin-field">
        <el-input
          v-model="pendingAdminKey"
          placeholder="管理员密钥 ADMIN_KEY（可选，仅当后端已设置时填写）"
          :show-password="true"
          clearable
          @keyup.enter="saveAdminKey"
        />
      </div>
      <el-button @click="saveAdminKey">{{ hasAdminKey ? '更新' : '保存' }}</el-button>
    </div>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="btn-icon"><Plus /></el-icon>生成访问密钥
      </el-button>
    </div>

    <!-- 密钥列表 -->
    <el-table v-if="keys.length" :data="keys" class="keys-table" row-key="id">
      <el-table-column label="名称" min-width="140">
        <template #default="{ row }">
          <span>{{ row.name }}</span>
        </template>
      </el-table-column>
      <el-table-column label="作用域" min-width="150">
        <template #default="{ row }">
          <el-tag v-for="s in row.scopes" :key="s" :type="s === 'api' ? 'primary' : 'success'" size="small" class="scope-tag">
            {{ s.toUpperCase() }}
          </el-tag>
        </template>
      </el-table-column>
      <el-table-column label="密钥前缀" min-width="140">
        <template #default="{ row }">
          <span class="mono">{{ row.revoked ? '—' : row.prefix + '…' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="状态" min-width="100">
        <template #default="{ row }">
          <el-tag :type="statusType(row)" size="small">{{ statusText(row) }}</el-tag>
        </template>
      </el-table-column>
      <el-table-column label="最近使用" min-width="170">
        <template #default="{ row }">
          <span class="mono time">{{ row.lastUsedAt ? fmt(row.lastUsedAt) : '从未' }}</span>
        </template>
      </el-table-column>
      <el-table-column label="操作" min-width="210" align="right">
        <template #default="{ row }">
          <template v-if="!row.revoked">
            <el-button v-if="row.enabled" text size="small" @click="toggle(row, false)">停用</el-button>
            <el-button v-else text size="small" type="primary" @click="toggle(row, true)">启用</el-button>
            <el-popconfirm
              content="吊销后将不可再用于请求，确定？"
              width="220"
              confirm-button-text="吊销"
              cancel-button-text="取消"
              @confirm="revoke(row)"
            >
              <template #reference>
                <el-button text size="small" type="warning">吊销</el-button>
              </template>
            </el-popconfirm>
          </template>
          <el-popconfirm content="确认删除此密钥？" width="200" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(row)">
            <template #reference>
              <el-button text size="small" type="danger"><el-icon><Delete /></el-icon></el-button>
            </template>
          </el-popconfirm>
        </template>
      </el-table-column>
    </el-table>
    <el-empty v-else description="暂无密钥，点击「生成访问密钥」开始" />

    <!-- 接入示例 -->
    <div class="examples">
      <h3 class="examples-title">接入示例</h3>

      <div class="example-block">
        <div class="example-head">
          <span class="mono example-name">REST API（curl）</span>
          <el-button text size="small" @click="copy(restSnippet('YOUR_API_KEY'))">
            <el-icon><CopyDocument /></el-icon>复制
          </el-button>
        </div>
        <pre class="code mono">{{ restSnippet('YOUR_API_KEY') }}</pre>
      </div>

      <div class="example-block">
        <div class="example-head">
          <span class="mono example-name">MCP server（Claude Desktop 配置）</span>
          <el-button text size="small" @click="copy(mcpSnippet('YOUR_API_KEY'))">
            <el-icon><CopyDocument /></el-icon>复制
          </el-button>
        </div>
        <pre class="code mono">{{ mcpSnippet('YOUR_API_KEY') }}</pre>
      </div>
    </div>

    <!-- 生成密钥弹窗 -->
    <el-dialog v-model="dialog" title="生成访问密钥" width="460px" :close-on-click-modal="false">
      <el-form label-width="70px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="用途，如「对外调用者」「我的 MCP」" />
        </el-form-item>
        <el-form-item label="作用域">
          <el-checkbox-group v-model="form.scopes">
            <el-checkbox value="api">API（REST /api/v1/search）</el-checkbox>
            <el-checkbox value="mcp">MCP（/mcp 工具）</el-checkbox>
          </el-checkbox-group>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" :disabled="!form.scopes.length" @click="create">
          生成
        </el-button>
      </template>
    </el-dialog>

    <!-- 生成结果弹窗：一次性显示明文 + 示例 -->
    <el-dialog v-model="resultDialog" title="密钥已生成" width="600px" :close-on-click-modal="false">
      <el-alert type="warning" :closable="false" class="result-warn">
        请立即复制保存，关闭后不再显示明文。
      </el-alert>
      <div class="result-key">
        <div class="label">访问密钥</div>
        <div class="key-line">
          <el-input :model-value="createdKey" readonly class="mono" />
          <el-button @click="copy(createdKey)" :type="createdKey ? 'primary' : undefined">
            <el-icon><CopyDocument /></el-icon>复制
          </el-button>
        </div>
      </div>

      <div class="result-examples">
        <div class="example-block compact">
          <div class="example-head">
            <span class="mono example-name">REST API（curl）</span>
            <el-button text size="small" @click="copy(restSnippet(createdKey).trim())">
              <el-icon><CopyDocument /></el-icon>复制
            </el-button>
          </div>
          <pre class="code mono">{{ restSnippet(createdKey).trim() }}</pre>
        </div>

        <div class="example-block compact">
          <div class="example-head">
            <span class="mono example-name">MCP server（Claude Desktop 配置）</span>
            <el-button text size="small" @click="copy(mcpSnippet(createdKey))">
              <el-icon><CopyDocument /></el-icon>复制 MCP 配置
            </el-button>
          </div>
          <pre class="code mono">{{ mcpSnippet(createdKey) }}</pre>
        </div>
      </div>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Delete, Key, CopyDocument } from '@element-plus/icons-vue';
import { api, setAdminKey, getAdminKey } from '../api';

// 后端地址：dev 下 /mcp 未走 vite 代理，直接指向后端；生产同上同源
const ORIGIN = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin;

const keys = ref([]);
const dialog = ref(false);
const resultDialog = ref(false);
const saving = ref(false);
const form = ref({ name: '', scopes: ['api', 'mcp'] });

const createdKey = ref('');
const hasAdminKey = ref(!!getAdminKey());
const pendingAdminKey = ref(getAdminKey());

function restSnippet(key) {
  return `curl -X POST ${ORIGIN}/api/v1/search \\
  -H "Authorization: Bearer ${key}" \\
  -H "Content-Type: application/json" \\
  -d '{"query":"claude"}'`;
}

function mcpSnippet(key) {
  return `{
  "mcpServers": {
    "websearch": {
      "type": "http",
      "url": "${ORIGIN}/mcp",
      "headers": { "Authorization": "Bearer ${key}" }
    }
  }
}`;
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    ElMessage.success('已复制到剪贴板');
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text;
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
      ElMessage.success('已复制到剪贴板');
    } catch {
      ElMessage.error('复制失败，请手动选择复制');
    }
    document.body.removeChild(ta);
  }
}

async function load() {
  const res = await api.listKeys();
  keys.value = res.data;
}

function openCreate() {
  form.value = { name: '', scopes: ['api', 'mcp'] };
  dialog.value = true;
}

async function create() {
  if (!form.value.scopes.length) return ElMessage.warning('请至少选择一个作用域');
  saving.value = true;
  try {
    const res = await api.createKey({ name: form.value.name, scopes: form.value.scopes });
    createdKey.value = res.key;
    dialog.value = false;
    resultDialog.value = true;
    await load();
  } catch (e) {
    ElMessage.error(e.message || '生成失败，请检查管理员密钥是否已配置');
  } finally {
    saving.value = false;
  }
}

async function toggle(row, enabled) {
  try {
    await api.updateKey(row.id, { enabled });
    ElMessage.success(enabled ? '已启用' : '已停用');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function revoke(row) {
  try {
    await api.revokeKey(row.id);
    ElMessage.success('已吊销');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

async function remove(row) {
  try {
    await api.deleteKey(row.id);
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function statusText(row) {
  if (row.revoked) return '已吊销';
  return row.enabled ? '启用' : '停用';
}
function statusType(row) {
  if (row.revoked) return 'danger';
  return row.enabled ? 'primary' : 'info';
}

function fmt(iso) {
  return new Date(iso).toLocaleString('zh-CN', { hour12: false });
}

function saveAdminKey() {
  setAdminKey(pendingAdminKey.value);
  hasAdminKey.value = !!getAdminKey();
  ElMessage.success(hasAdminKey.value ? '已更新管理员密钥，后续请求自动附带' : '已清空管理员密钥');
}

onMounted(load);
</script>

<style scoped>
.keys-page .gap { margin-bottom: 16px; }
.hint-desc { line-height: 1.7; color: var(--el-text-color-regular); }

.admin-row {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.admin-field { flex: 1; }

.toolbar { margin-bottom: 16px; }
.btn-icon { margin-right: 5px; }

.keys-table { margin-bottom: 24px; }
.scope-tag { margin-right: 4px; }
.time { color: var(--el-text-color-secondary); font-size: 12px; }

.examples-title {
  font-size: 16px;
  margin: 0 0 12px;
  color: var(--el-text-color-primary);
}
.example-block {
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 8px;
  margin-bottom: 16px;
  overflow: hidden;
}
.example-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  background: var(--el-fill-color-light);
  border-bottom: 1px solid var(--el-border-color-lighter);
}
.example-name { font-size: 13px; color: var(--el-text-color-regular); }
.code {
  margin: 0;
  padding: 12px 14px;
  font-size: 12.5px;
  line-height: 1.6;
  color: var(--el-text-color-primary);
  background: var(--el-bg-color);
  white-space: pre-wrap;
  word-break: break-word;
}
.example-block.compact { margin-bottom: 12px; }

.mono { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; }
.result-warn { margin: 4px 0 16px; }
.result-key { margin-bottom: 18px; }
.result-key .label { font-size: 13px; color: var(--el-text-color-secondary); margin-bottom: 6px; }
.key-line { display: flex; gap: 8px; }
.result-examples { margin-top: 8px; }
</style>