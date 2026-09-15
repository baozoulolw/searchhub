<template>
  <div class="result-list">
    <div v-for="(item, i) in items" :key="i" class="result-item">
      <a :href="item.link" target="_blank" rel="noopener" class="result-link">
        <div class="result-title">
          <span class="mono rank">{{ pad(i + 1) }}</span>
          <span class="title-text">{{ item.title }}</span>
          <span v-if="item.source" class="mono source">{{ item.source }}</span>
        </div>
        <div class="result-snippet">{{ item.snippet }}</div>
        <div v-if="item.publishedAt" class="result-meta mono">{{ item.publishedAt }}</div>
      </a>
    </div>
    <div v-if="!items.length" class="no-result">无结果</div>
  </div>
</template>

<script setup>
function pad(n) {
  return String(n).padStart(2, '0');
}
defineProps({
  items: { type: Array, default: () => [] },
});
</script>

<style scoped>
.result-list { display: flex; flex-direction: column; }
.result-item {
  padding: 14px 12px;
  border-radius: 8px;
  transition: background 0.15s;
}
.result-item:hover { background: var(--el-fill-color-light); }
.result-item + .result-item { border-top: 1px solid var(--el-border-color-lighter); }

.result-link { display: flex; flex-direction: column; gap: 6px; text-decoration: none; color: inherit; }
.result-title { display: flex; align-items: flex-start; gap: 10px; }
.rank { color: var(--el-color-primary, #22c55e); font-size: 13px; min-width: 22px; }
.title-text {
  font-size: 15px;
  font-weight: 500;
  color: var(--el-text-color-primary);
  overflow: hidden;
}
.result-item:hover .title-text { color: var(--el-color-primary-dark-2, #16a34a); }
.source { margin-left: auto; font-size: 12px; color: var(--el-text-color-secondary); white-space: nowrap; }

.result-snippet {
  font-size: 13px;
  line-height: 1.7;
  color: var(--el-text-color-regular);
  padding-left: 32px;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  -webkit-box-orient: vertical;
}
.result-meta {
  padding-left: 32px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.no-result { padding: 20px; text-align: center; color: var(--el-text-color-secondary); font-size: 13px; }
</style>