<template>
  <div class="sources-page">
    <!-- 提示条 -->
    <el-alert type="info" :closable="false" class="gap">
      <template #title>
        <el-icon style="margin-right: 6px"><InfoFilled /></el-icon>故障转移策略
      </template>
      <div class="hint-desc">
        按优先级依次尝试已启用的源，第一个成功即返回，失败自动切换下一个。当前顺序：
        <el-tag v-for="(s, i) in enabledOrdered" :key="s.id" size="small" effect="plain" class="order-chip">{{ s.label }}</el-tag>
        <span v-if="!enabledOrdered.length" class="order-none">（暂无已启用的源）</span>
      </div>
    </el-alert>

    <!-- 工具栏 -->
    <div class="toolbar">
      <el-button type="primary" @click="openCreate">
        <el-icon class="btn-icon"><Plus /></el-icon>新增搜索源
      </el-button>
    </div>

    <!-- 源卡片网格 -->
    <div v-if="sources.length" class="source-grid">
      <div
        v-for="src in sources"
        :key="src.id"
        class="source-card"
        :class="{ 'card-disabled': !src.enabled, dragging: dragId === src.id }"
        draggable="true"
        @click="openEdit(src)"
        @dragstart="onDragStart(src)"
        @dragover.prevent="onDragOver(src)"
        @drop.prevent
        @dragend="onDragEnd"
      >
        <!-- 卡片头 -->
        <div class="card-head">
          <div class="drag-grip" title="拖拽排序，调整优先级"><el-icon><Rank /></el-icon></div>
          <div class="card-id">
            <span class="mono card-badge">{{ src.priority }}</span>
            <span class="mono card-type">{{ src.type }}</span>
          </div>
          <el-switch v-model="src.enabled" size="small" @change="toggleEnabled(src)" @click.stop />
        </div>

        <!-- 名称 + 状态 -->
        <div class="card-label">{{ src.label }}</div>
        <div class="card-status">
          <span class="status-light" :class="src.hasApiKey ? 'has-key' : ''" />
          <span class="mono status-text">{{ src.enabled ? 'enabled' : 'disabled' }} · {{ src.hasApiKey ? 'key ✓' : 'no key' }}</span>
        </div>

        <!-- 操作 -->
        <div class="card-actions" @click.stop>
          <el-tooltip content="测试" :show-after="200">
            <el-button text size="small" @click="openTest(src)"><el-icon><CircleCheck /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip content="编辑" :show-after="200">
            <el-button text size="small" @click="openEdit(src)"><el-icon><Edit /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip content="上移" :show-after="200">
            <el-button text size="small" :disabled="isFirst(src)" @click="move(src, -1)"><el-icon><ArrowUp /></el-icon></el-button>
          </el-tooltip>
          <el-tooltip content="下移" :show-after="200">
            <el-button text size="small" :disabled="isLast(src)" @click="move(src, 1)"><el-icon><ArrowDown /></el-icon></el-button>
          </el-tooltip>
          <span class="actions-spacer" />
          <el-popconfirm content="确认删除此搜索源？" width="200" confirm-button-text="删除" cancel-button-text="取消" @confirm="remove(src)">
            <template #reference>
              <el-button text size="small" type="danger"><el-icon><Delete /></el-icon></el-button>
            </template>
          </el-popconfirm>
        </div>
      </div>
    </div>

    <!-- 空态 -->
    <el-empty v-else description="暂无搜索源，点击「新增搜索源」开始配置" />

    <!-- 新增/编辑弹窗 -->
    <el-dialog
      v-model="dialog"
      :title="editingId ? '编辑搜索源' : '新增搜索源'"
      width="520px"
      :close-on-click-modal="false"
    >
      <el-form :model="form" label-width="90px">
        <el-form-item label="类型" v-if="!editingId">
          <el-select v-model="form.type" placeholder="选择搜索源类型" style="width: 100%" @change="onTypeChange">
            <el-option v-for="r in registry" :key="r.type" :value="r.type" :label="r.label" />
          </el-select>
        </el-form-item>
        <el-form-item label="名称">
          <el-input v-model="form.label" placeholder="搜索源名称" />
        </el-form-item>
        <el-form-item label="优先级">
          <el-input-number v-model="form.priority" :min="1" :max="99" size="small" />
          <span class="mono form-hint">越小越先调用</span>
        </el-form-item>
        <el-form-item label="启用">
          <el-switch v-model="form.enabled" />
        </el-form-item>

        <el-divider class="form-divider" />
        <div class="form-section-title">代理</div>
        <el-form-item label=" ">
          <div class="proxy-config">
            <el-switch v-model="form.useProxy" />
            <div v-if="form.useProxy" class="proxy-select">
              <el-select v-model="form.proxyId" placeholder="选择使用的代理" style="width: 100%" @click.stop>
                <el-option v-for="p in proxyOptions" :key="p.id" :value="p.id" :label="p.name" />
              </el-select>
            </div>
            <span v-else class="proxy-no" @click="form.useProxy = true">关闭 = 直连（不走代理），点击启用</span>
          </div>
        </el-form-item>

        <el-divider class="form-divider" />
        <div class="form-section-title">适配器配置</div>

        <template v-if="currentMeta">
          <el-form-item v-for="f in currentMeta.fields" :key="f.name" :label="f.label">
            <el-input
              v-if="f.name === 'apiKey'"
              v-model="form.config[f.name]"
              type="password"
              show-password
              :placeholder="editingId && sourceHasKey ? '留空表示不修改当前 Key' : ''"
            />
            <el-input-number v-else-if="f.type === 'number'" v-model="form.config[f.name]" :min="f.min" :max="f.max" />
            <el-select v-else-if="f.type === 'select'" v-model="form.config[f.name]" style="width: 100%">
              <el-option v-for="opt in f.options || []" :key="opt" :value="opt" :label="opt" />
            </el-select>
            <el-input v-else v-model="form.config[f.name]" />
          </el-form-item>
        </template>
        <div v-else class="mono form-hint">请先选择搜索源类型</div>
      </el-form>

      <template #footer>
        <el-button @click="dialog = false">取消</el-button>
        <el-button type="primary" :loading="saving" @click="save">保存</el-button>
      </template>
    </el-dialog>

    <!-- 单源测试弹窗 -->
    <el-dialog v-model="testDialog" :title="`测试：${testing?.label || ''}`" width="520px">
      <div class="test-bar">
        <el-input v-model="testQuery" placeholder="测试搜索词" @keyup.enter="runTest" />
        <el-button type="primary" :loading="testingLoading" @click="runTest">测试</el-button>
      </div>
      <template v-if="testResult">
        <el-alert v-if="testSuccess" type="success" :closable="false" class="gap-sm">命中 {{ testItems.length }} 条结果</el-alert>
        <el-alert v-else type="error" :closable="false" class="gap-sm">{{ testError }}</el-alert>
        <ResultList :items="testItems.slice(0, 5)" />
      </template>
    </el-dialog>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { ElMessage } from 'element-plus';
import { Plus, Edit, Delete, ArrowUp, ArrowDown, CircleCheck, InfoFilled, Rank } from '@element-plus/icons-vue';
import { api } from '../api';
import ResultList from '../components/ResultList.vue';

const sources = ref([]);
const registry = ref([]);
const proxyOptions = ref([]);

const dialog = ref(false);
const editingId = ref(null);
const saving = ref(false);
const sourceHasKey = ref(false);
const form = ref(emptyForm());

const testDialog = ref(false);
const testing = ref(null);
const testQuery = ref('');
const testingLoading = ref(false);
const testResult = ref(null);
const testItems = ref([]);
const testSuccess = ref(false);
const testError = ref('');

const enabledOrdered = computed(() => sources.value.filter((s) => s.enabled).sort((a, b) => a.priority - b.priority));

const currentMeta = computed(() => {
  if (!form.value.type) return null;
  return registry.value.find((r) => r.type === form.value.type) || null;
});

function emptyForm() {
  return { type: '', label: '', priority: 1, enabled: true, config: {}, useProxy: false, proxyId: '' };
}

async function load() {
  const [srcRes, regRes, proxyRes] = await Promise.all([api.listSources(), api.getRegistry(), api.listProxyOptions()]);
  sources.value = srcRes.data;
  registry.value = regRes.data;
  proxyOptions.value = proxyRes.data;
}

function openCreate() {
  editingId.value = null;
  form.value = emptyForm();
  sourceHasKey.value = false;
  dialog.value = true;
}

function openEdit(src) {
  editingId.value = src.id;
  sourceHasKey.value = src.hasApiKey;
  form.value = {
    type: src.type,
    label: src.label,
    priority: src.priority,
    enabled: src.enabled,
    config: { ...src.config, apiKey: '' },
    useProxy: !!src.config?.useProxy,
    proxyId: src.config?.proxyId || '',
  };
  dialog.value = true;
}

function onTypeChange() {
  const meta = currentMeta.value;
  if (!meta) return;
  const cfg = {};
  for (const f of meta.fields) {
    cfg[f.name] = f.default !== undefined ? f.default : f.type === 'number' ? 0 : '';
  }
  form.value.config = cfg;
  if (!form.value.label) form.value.label = meta.label;
}

async function save() {
  const payload = {
    type: form.value.type,
    label: form.value.label,
    priority: Number(form.value.priority) || 1,
    enabled: !!form.value.enabled,
    config: form.value.config,
  };
  payload.config.useProxy = !!form.value.useProxy;
  payload.config.proxyId = form.value.useProxy ? (form.value.proxyId || '') : '';
  if (!payload.type) return ElMessage.warning('请选择搜索源类型');
  if (!payload.label) return ElMessage.warning('请填写名称');
  if (editingId.value && !payload.config.apiKey) delete payload.config.apiKey;

  saving.value = true;
  try {
    if (editingId.value) {
      await api.updateSource(editingId.value, payload);
      ElMessage.success('已保存');
    } else {
      await api.createSource(payload);
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

async function toggleEnabled(src) {
  try {
    await api.updateSource(src.id, { enabled: src.enabled });
    ElMessage.success(`${src.enabled ? '已启用' : '已禁用'}「${src.label}」`);
  } catch (e) {
    ElMessage.error(e.message);
    src.enabled = !src.enabled;
  }
}

function isFirst(src) { return src.priority === Math.min(...sources.value.map((s) => s.priority)); }
function isLast(src) { return src.priority === Math.max(...sources.value.map((s) => s.priority)); }

async function move(src, delta) {
  const sorted = sources.value.slice().sort((a, b) => a.priority - b.priority);
  const idx = sorted.findIndex((s) => s.id === src.id);
  const target = sorted[idx + delta];
  if (!target) return;
  const otherPriority = target.priority;
  try {
    await Promise.all([
      api.updateSource(src.id, { priority: otherPriority }),
      api.updateSource(target.id, { priority: src.priority }),
    ]);
    const p = target.priority;
    target.priority = src.priority;
    src.priority = p;
  } catch (e) {
    ElMessage.error(e.message);
  }
}

// 拖拽排序：整卡可拖，实时重排，松手后按新顺序重置优先级 1..N 并持久化。
const dragId = ref(null);
const dragOverId = ref(null);

function onDragStart(src) {
  dragId.value = src.id;
  dragOverId.value = null;
}

function onDragOver(src) {
  const arr = sources.value;
  const from = arr.findIndex((s) => s.id === dragId.value);
  const t = arr.findIndex((s) => s.id === src.id);
  if (from === -1 || t === -1 || from === t) return;
  if (dragOverId.value === src.id) return; // 已对同一目标处理过一次，避免反复触发
  dragOverId.value = src.id;
  const [moved] = arr.splice(from, 1);
  const insert = from < t ? t - 1 : t; // 插到目标卡之前；向下跨越时目标索引随之减少 1
  arr.splice(insert, 0, moved);
}

async function onDragEnd() {
  const started = dragId.value;
  dragId.value = null;
  dragOverId.value = null;
  if (!started) return;
  // 新顺序即新优先级：第 i 个（0 起）→ priority = i+1；只更新有变化的源
  const changed = [];
  sources.value.forEach((s, i) => {
    const newP = i + 1;
    if (Number(s.priority) !== newP) {
      s.priority = newP;
      changed.push(s);
    }
  });
  if (!changed.length) return;
  try {
    await Promise.all(changed.map((s) => api.updateSource(s.id, { priority: s.priority })));
    ElMessage.success('已按新顺序更新优先级');
  } catch (e) {
    ElMessage.error(e.message);
    await load(); // 失败则拉回服务端权威顺序
  }
}

async function remove(src) {
  try {
    await api.deleteSource(src.id);
    ElMessage.success('已删除');
    await load();
  } catch (e) {
    ElMessage.error(e.message);
  }
}

function openTest(src) {
  testing.value = src;
  testQuery.value = '';
  testResult.value = null;
  testItems.value = [];
  testSuccess.value = false;
  testError.value = '';
  testDialog.value = true;
}

async function runTest() {
  const q = testQuery.value.trim();
  if (!q) return ElMessage.warning('请先输入测试搜索词');
  if (testingLoading.value) return;
  testingLoading.value = true;
  testResult.value = null;
  try {
    const res = await api.testSource(testing.value.id, q);
    testSuccess.value = true;
    testItems.value = res.items || [];
    testResult.value = res;
  } catch (e) {
    testSuccess.value = false;
    testError.value = e.payload?.tried?.[0]?.error || e.message;
  } finally {
    testingLoading.value = false;
  }
}

onMounted(load);
</script>

<style scoped>
.gap { margin-bottom: 16px; }
.gap-sm { margin-bottom: 12px; }
.btn-icon { margin-right: 4px; }

.hint-desc { font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); margin-top: 4px; }
.order-chip { margin: 0 4px; }
.order-none { color: var(--el-text-color-secondary); }

.toolbar { display: flex; justify-content: flex-end; margin-bottom: 16px; }

.source-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 14px; }
.source-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: grab;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.source-card:hover { border-color: var(--el-color-primary, #22c55e); box-shadow: 0 2px 12px rgba(0, 0, 0, 0.35); }
.card-disabled { opacity: 0.55; }
.source-card.dragging { opacity: 0.45; cursor: grabbing; box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45); }

.drag-grip { display: inline-flex; align-items: center; color: var(--el-text-color-secondary); cursor: grab; }
.drag-grip:hover { color: var(--el-color-primary, #22c55e); }

.card-head { display: flex; align-items: center; justify-content: space-between; }
.card-id { display: flex; align-items: center; gap: 8px; }
.card-badge { width: 24px; height: 24px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; background: rgba(34, 197, 94, 0.16); color: var(--el-color-primary, #22c55e); font-weight: 600; font-size: 13px; }
.card-type { font-size: 12px; color: var(--el-text-color-secondary); }

.card-label { font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.card-status { display: flex; align-items: center; gap: 8px; }
.status-light { width: 8px; height: 8px; border-radius: 50%; background: var(--el-text-color-disabled); }
.status-light.has-key { background: var(--el-color-primary, #22c55e); }
.status-text { font-size: 12px; color: var(--el-text-color-secondary); }

.card-actions { display: flex; align-items: center; gap: 2px; padding-top: 6px; border-top: 1px solid var(--el-border-color-lighter); }
.actions-spacer { flex: 1; }

.form-divider { margin: 12px 0; }
.form-section-title { font-weight: 600; margin-bottom: 12px; color: var(--el-text-color-primary); }
.form-hint { margin-left: 8px; color: var(--el-text-color-secondary); font-size: 12px; }

.proxy-config { display: flex; align-items: center; gap: 12px; width: 100%; }
.proxy-select { flex: 1; }
.proxy-no { color: var(--el-text-color-secondary); font-size: 12px; cursor: pointer; }

.test-bar { display: flex; gap: 12px; margin-bottom: 12px; }
</style>