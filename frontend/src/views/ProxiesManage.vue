<template>
  <div class="proxies-page">
    <!-- 提示 -->
    <el-alert type="info" :closable="false" class="gap">
      <template #title>
        <el-icon style="margin-right: 6px"><Connection /></el-icon>代理管理
      </template>
      <div class="hint-desc">
        配置全局代理后，在「搜索源管理 → 编辑」中可为每个源单独选择是否使用代理及使用哪个代理。适合国内访问国外搜索源（Tavily / Exa / Brave 等）时使用。
      </div>
    </el-alert>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="btn-icon"><Plus /></el-icon>新增代理
      </el-button>
    </div>

    <!-- 代理卡片网格 -->
    <div v-if="proxies.length" class="proxy-grid">
      <div v-for="p in proxies" :key="p.id" class="proxy-card">
        <div class="card-head">
          <div class="proxy-id">
            <span class="proto-badge" :class="`proto-${p.protocol}`">{{ p.protocol }}</span>
            <span class="mono proxy-addr">{{ p.host }}:{{ p.port }}</span>
          </div>
        </div>
        <div class="proxy-name">{{ p.name }}</div>
        <div class="proxy-meta mono">
          <span>auth: {{ p.hasUsername || p.hasPassword ? 'yes' : 'no' }}</span>
        </div>
        <div class="card-actions">
          <el-tooltip content="测连通性" :show-after="200">
            <el-button text type="primary" :loading="testingId === p.id" @click="testProxy(p)">
              <el-icon :loading="testingId === p.id"><CircleCheck /></el-icon>
            </el-button>
          </el-tooltip>
          <el-tooltip content="编辑" :show-after="200">
            <el-button text size="small" @click="openEdit(p)"><el-icon><Edit /></el-icon></el-button>
          </el-tooltip>
          <span class="actions-spacer" />
          <el-popconfirm content="确认删除此代理？" width="200" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(p)">
            <template #reference>
              <el-button text size="small" type="danger"><el-icon><Delete /></el-icon></el-button>
            </template>
          </el-popconfirm>
        </div>

        <div v-if="testMsg[p.id]" class="test-msg mono" :class="testOk[p.id] ? 'ok' : 'fail'">
          {{ testMsg[p.id] }}
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <el-empty v-else description="暂无代理，点击「新增代理」开始配置" />

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialog"
      :title="editingId ? '编辑代理' : '新增代理'"
      width="480px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="80px">
        <el-form-item label="名称">
          <el-input v-model="form.name" placeholder="代理名称（可留空自动生成）" />
        </el-form-item>
        <el-form-item label="协议">
          <el-radio-group v-model="form.protocol">
            <el-radio-button value="http">HTTP</el-radio-button>
            <el-radio-button value="https">HTTPS</el-radio-button>
            <el-radio-button value="socks">SOCKS5</el-radio-button>
          </el-radio-group>
        </el-form-item>
        <el-form-item label="地址">
          <div class="addr-line">
            <el-input v-model="form.host" placeholder="代理主机，如 127.0.0.1" />
            <el-input-number v-model="form.port" :min="1" :max="65535" placeholder="端口" class="port-input" :controls="false" />
          </div>
        </el-form-item>
        <el-form-item label="用户名">
          <el-input v-model="form.username" :placeholder="editingId && editingHasUser ? '留空表示不修改' : '可选'" />
        </el-form-item>
        <el-form-item label="密码">
          <el-input v-model="form.password" type="password" show-password :placeholder="editingId && editingHasPass ? '留空表示不修改' : '可选'" />
        </el-form-item>
      </el-form>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Edit, Delete, CircleCheck, Connection } from '@element-plus/icons-vue';
import { api } from '../api';

const proxies = ref([]);
const dialog = ref(false);
const editingId = ref(null);
const editingHasUser = ref(false);
const editingHasPass = ref(false);
const saving = ref(false);
const form = ref(emptyForm());

const testingId = ref('');
const testMsg = ref({});
const testOk = ref({});

function emptyForm() {
  return { name: '', protocol: 'http', host: '', port: 7890, username: '', password: '' };
}

async function load() {
  const res = await api.listProxies();
  proxies.value = res.data;
}

function openCreate() {
  editingId.value = null;
  form.value = emptyForm();
  editingHasUser.value = false;
  editingHasPass.value = false;
  dialog.value = true;
}

function openEdit(p) {
  editingId.value = p.id;
  editingHasUser.value = p.hasUsername;
  editingHasPass.value = p.hasPassword;
  form.value = {
    name: p.name,
    protocol: p.protocol,
    host: p.host,
    port: p.port,
    username: '',
    password: '',
  };
  dialog.value = true;
}

async function save() {
  if (!form.value.host) return ElMessage.warning('请填写代理地址');
  if (!form.value.port) return ElMessage.warning('请填写代理端口');

  const payload = {
    name: form.value.name,
    protocol: form.value.protocol,
    host: form.value.host,
    port: Number(form.value.port),
    username: form.value.username,
    password: form.value.password,
  };
  if (editingId.value) {
    if (!payload.username) delete payload.username;
    if (!payload.password) delete payload.password;
  }

  saving.value = true;
  try {
    if (editingId.value) {
      await api.updateProxy(editingId.value, payload);
      ElMessage.success('已保存');
    } else {
      await api.createProxy(payload);
      ElMessage.success('已新增');
    }
    dialog.value = false;
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  } finally {
    saving.value = false;
  }
}

async function testProxy(p) {
  testingId.value = p.id;
  testMsg.value[p.id] = '';
  try {
    const res = await api.testProxy(p.id);
    testOk.value[p.id] = res.success;
    testMsg.value[p.id] = res.message || (res.success ? '代理可用' : '代理不可用');
  } catch (e) {
    testOk.value[p.id] = false;
    testMsg.value[p.id] = e.message;
  } finally {
    testingId.value = '';
  }
}

async function remove(p) {
  try {
    await api.deleteProxy(p.id);
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

onMounted(load);
</script>

<style scoped>
.gap { margin-bottom: 16px; }
.btn-icon { margin-right: 4px; }

.hint-desc { font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); margin-top: 4px; }

.toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }

.proxy-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.proxy-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.proxy-card:hover { border-color: var(--el-color-primary, #22c55e); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35); }
.card-head { display: flex; align-items: center; justify-content: space-between; }
.proxy-id { display: flex; align-items: center; gap: 10px; }
.proto-badge {
  padding: 2px 8px;
  border-radius: 5px;
  font-family: var(--el-font-family-mono, Menlo, Consolas, monospace);
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
}
.proto-http { background: rgba(34, 197, 94, 0.16); color: #4ade80; }
.proto-https { background: rgba(64, 158, 255, 0.16); color: #60a5fa; }
.proto-socks { background: rgba(239, 68, 68, 0.16); color: #f87171; }
.proxy-addr { font-size: 13px; color: var(--el-text-color-regular); }
.proxy-name { font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.proxy-meta { font-size: 12px; color: var(--el-text-color-secondary); }
.card-actions { display: flex; align-items: center; gap: 2px; padding-top: 6px; border-top: 1px solid var(--el-border-color-lighter); }
.actions-spacer { flex: 1; }
.test-msg { font-size: 12px; margin-top: 2px; }
.test-msg.ok { color: var(--el-color-success, #67c23a); }
.test-msg.fail { color: var(--el-color-danger, #f56c6c); }

.addr-line { display: flex; gap: 10px; width: 100%; }
.addr-line .el-input { flex: 1; }
.port-input { width: 120px; }
</style>