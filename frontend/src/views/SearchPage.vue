<template>
  <div class="search-page">
    <!-- 搜索区 -->
    <el-card class="search-card" shadow="never" body-style="padding: 20px">
      <div class="search-bar">
        <el-input
          v-model="query"
          placeholder="输入要搜索的内容，回车或点搜索"
          size="large"
          clearable
          @keyup.enter="doSearch"
        >
          <template #prefix>
            <el-icon><Search /></el-icon>
          </template>
        </el-input>
        <el-button type="primary" size="large" :loading="loading" class="search-btn" @click="doSearch">
          <el-icon class="btn-icon"><Search /></el-icon>搜索
        </el-button>
      </div>

      <div class="mode-row">
        <el-radio-group v-model="mode" size="default">
          <el-radio-button value="auto">按优先级 failover</el-radio-button>
          <el-radio-button value="single">仅指定源</el-radio-button>
          <el-radio-button value="compare">全源对比</el-radio-button>
        </el-radio-group>
        <el-select
          v-if="mode === 'single'"
          v-model="singleType"
          placeholder="选择搜索源"
          class="mode-select mono"
          size="default"
        >
          <el-option v-for="t in sourceTypes" :key="t" :value="t" :label="t" />
        </el-select>
      </div>
    </el-card>

    <!-- 错误 -->
    <el-alert
      v-if="error"
      type="error"
      :closable="true"
      class="gap"
      @close="error = ''"
    >
      {{ error }}
    </el-alert>

    <!-- 调用链路 -->
    <el-card v-if="result || tried.length" class="chain-card gap" shadow="never">
      <template #header>
        <div class="section-head">
          <span class="section-label">调用链路</span>
          <span class="mono section-meta">{{ tried.length ? tried.length + '✗' : '' }} {{ hitProvider ? '→ 命中' : '' }}</span>
        </div>
      </template>
      <div class="chain">
        <el-tag
          v-for="(t, i) in tried"
          :key="i"
          type="warning"
          effect="plain"
          class="chain-tag"
        >
          <span class="mono chain-idx">{{ i + 1 }}</span>{{ t.providerLabel }} ✗ {{ t.error }}
        </el-tag>
        <el-tag v-if="hitProvider" type="success" effect="dark" class="chain-tag chain-hit">
          {{ hitProviderLabel }} 命中
        </el-tag>
        <el-tag v-else-if="!loading && !error" type="danger" effect="plain" class="chain-tag">
          全部失败
        </el-tag>
      </div>
    </el-card>

    <!-- AI 摘要 -->
    <el-alert
      v-if="result?.extra?.answer"
      type="success"
      :closable="false"
      class="gap"
      title="AI 摘要"
    >
      <div class="answer-body">{{ result.extra.answer }}</div>
    </el-alert>

    <!-- 全源对比 -->
    <template v-if="mode === 'compare' && compareResults.length">
      <el-card class="gap" shadow="never">
        <div class="section-head">
          <span class="section-label">全源对比</span>
        </div>
        <el-collapse v-model="expandedPanels">
          <el-collapse-item
            v-for="c in compareResults"
            :key="c.provider"
            :name="c.provider"
          >
            <template #title>
              <div class="compare-head">
                <el-icon :style="{ color: c.success ? '#22c55e' : '#ef4444', marginRight: '6px' }">
                  <CircleCheck v-if="c.success" />
                  <CircleClose v-else />
                </el-icon>
                <span class="font-medium">{{ c.providerLabel }}</span>
                <el-tag v-if="c.success" type="success" size="small" effect="plain" class="compare-tag">{{ c.items.length }} 条</el-tag>
                <el-tag v-else type="danger" size="small" effect="plain" class="compare-tag">失败</el-tag>
              </div>
            </template>
            <el-alert v-if="c.error" type="error" :closable="false">{{ c.error }}</el-alert>
            <ResultList v-else :items="c.items.slice(0, 10)" />
          </el-collapse-item>
        </el-collapse>
      </el-card>
    </template>

    <!-- 普通结果 -->
    <el-card v-if="result && mode !== 'compare'" class="gap result-card" shadow="never">
      <template #header>
        <div class="section-head">
          <span class="section-label">结果</span>
          <span class="mono section-meta">{{ result.items.length }} hits</span>
        </div>
      </template>
      <ResultList :items="result.items" />
      <el-empty v-if="result.items.length === 0" description="该源未返回结果" />
    </el-card>

    <!-- 空态 -->
    <div v-if="!loading && !result && !compareResults.length && !error" class="empty-state">
      <el-icon :size="56" class="empty-icon"><Search /></el-icon>
      <div class="empty-title">搜索你要的内容</div>
      <div class="empty-desc">输入搜索词，系统将按优先级自动尝试已启用的搜索源</div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import { Search, CircleCheck, CircleClose } from '@element-plus/icons-vue';
import { api } from '../api';
import ResultList from '../components/ResultList.vue';

const query = ref('');
const loading = ref(false);
const error = ref('');
const result = ref(null);
const tried = ref([]);
const compareResults = ref([]);
const expandedPanels = ref([]);

const mode = ref('auto');
const singleType = ref('');
const sourceTypes = ref([]);

const hitProvider = computed(() => result.value?.provider);
const hitProviderLabel = computed(() => result.value?.providerLabel);

async function loadTypes() {
  try {
    const { data } = await api.getRegistry();
    sourceTypes.value = data.map((m) => m.type);
  } catch (e) {
    console.error(e);
  }
}

async function doSearch() {
  const q = query.value.trim();
  if (!q || loading.value) return;

  loading.value = true;
  error.value = '';
  result.value = null;
  tried.value = [];
  compareResults.value = [];

  try {
    if (mode.value === 'compare') {
      await runCompare(q);
    } else {
      const onlyTypes = mode.value === 'single' ? [singleType.value] : undefined;
      const res = await api.search(q, { onlyTypes });
      applyAutoResult(res);
    }
  } catch (e) {
    error.value = e.message;
    if (e.payload?.tried) tried.value = e.payload.tried;
  } finally {
    loading.value = false;
  }
}

function applyAutoResult(res) {
  if (!res.success) {
    error.value = res.message || '搜索失败';
    tried.value = res.tried || [];
    return;
  }
  result.value = res;
  tried.value = res.tried || [];
}

async function runCompare(q) {
  const { data } = await api.getRegistry();
  const jobs = data.map(async (m) => {
    try {
      const res = await api.search(q, { onlyTypes: [m.type] });
      return { provider: m.type, providerLabel: res.providerLabel || m.label, success: true, items: res.items || [] };
    } catch (e) {
      return { provider: m.type, providerLabel: m.label, success: false, error: e.message };
    }
  });
  compareResults.value = await Promise.all(jobs);
}

onMounted(loadTypes);
</script>

<style scoped>
.search-card { background: var(--el-bg-color); }
.btn-icon { margin-right: 4px; }
.search-bar { display: flex; gap: 12px; }
.search-btn { min-width: 90px; }
.mode-row { display: flex; align-items: center; justify-content: space-between; margin-top: 18px; flex-wrap: wrap; gap: 12px; }
.mode-select { width: 220px; }
.gap { margin-bottom: 16px; }

.section-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 4px; }
.section-label { font-size: 13px; font-weight: 600; letter-spacing: 0.3px; color: var(--el-text-color-regular); }
.section-meta { font-size: 12px; color: var(--el-text-color-secondary); }
.chain-card { background: var(--el-bg-color); }
.chain { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 4px; }
.chain-tag { display: inline-flex; align-items: center; gap: 6px; margin: 0; max-width: 100%; }
.chain-idx { opacity: 0.6; font-size: 12px; }
.chain-hit { font-weight: 600; }

.answer-body { line-height: 1.7; font-size: 14px; color: var(--el-text-color-regular); }

.compare-head { display: flex; align-items: center; }
.compare-tag { margin-left: 8px; }
.font-medium { font-weight: 500; }
.result-card { background: var(--el-bg-color); }

.empty-state { text-align: center; padding: 100px 0 80px; }
.empty-icon { color: var(--el-color-primary, #22c55e); }
.empty-title { margin-top: 16px; font-size: 16px; font-weight: 600; color: var(--el-text-color-primary); }
.empty-desc { margin-top: 8px; font-size: 13px; color: var(--el-text-color-secondary); }
</style>