<template>
  <div class="app-shell">
    <!-- 顶部栏 -->
    <header class="app-header">
      <div class="header-inner">
        <div class="brand">
          <span class="brand-mark">⌘</span>
          <span class="mono brand-name">webSearch</span>
          <span class="brand-sub">多源聚合搜索引擎</span>
        </div>
        <div class="header-status">
          <span class="status-dot" />
          <span class="mono status-label">5 sources ready</span>
        </div>
      </div>
    </header>

    <!-- 顶部导航 -->
    <el-menu mode="horizontal" :default-active="activeMenu" class="top-nav" :ellipsis="false" router>
      <el-menu-item index="/search">
        <el-icon><Search /></el-icon>
        <span>搜索</span>
      </el-menu-item>
      <el-menu-item index="/sources">
        <el-icon><Setting /></el-icon>
        <span>搜索源管理</span>
      </el-menu-item>
      <el-menu-item index="/proxies">
        <el-icon><Connection /></el-icon>
        <span>代理管理</span>
      </el-menu-item>
      <el-menu-item index="/keys">
        <el-icon><Key /></el-icon>
        <span>访问密钥</span>
      </el-menu-item>
    </el-menu>

    <!-- 主体 -->
    <main class="app-main">
      <router-view />
    </main>

    <!-- 页脚 -->
    <footer class="app-footer">
      <span class="mono">websearch@0.1.0</span>
      <span class="footer-divider">·</span>
      <span>按需配置 · 优先级故障转移 · 谁成功返回谁</span>
    </footer>
  </div>
</template>

<script setup>
import { computed } from 'vue';
import { useRoute } from 'vue-router';

const route = useRoute();
const activeMenu = computed(() => {
  if (route.path.startsWith('/sources')) return '/sources';
  if (route.path.startsWith('/proxies')) return '/proxies';
  if (route.path.startsWith('/keys')) return '/keys';
  return '/search';
});
</script>

<style scoped>
.app-shell {
  display: flex;
  flex-direction: column;
  min-height: 100vh;
  background: var(--el-bg-color-page);
}
.app-header {
  background: var(--el-bg-color);
  border-bottom: 1px solid var(--el-border-color-lighter);
  padding: 0 24px;
  height: 60px;
  display: flex;
  align-items: center;
}
.header-inner {
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.brand {
  display: flex;
  align-items: baseline;
  gap: 10px;
}
.brand-mark {
  color: var(--el-color-primary, #22c55e);
  font-size: 20px;
  font-weight: 700;
}
.brand-name {
  font-size: 20px;
  font-weight: 700;
  color: var(--el-text-color-primary);
  letter-spacing: -0.5px;
}
.brand-sub {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
.header-status {
  display: flex;
  align-items: center;
  gap: 7px;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--el-color-primary, #22c55e);
}
.status-label {
  font-size: 12px;
  color: var(--el-text-color-regular);
}

.top-nav {
  max-width: 1080px;
  width: 100%;
  margin: 0 auto;
  padding: 0 12px;
  border-bottom: none;
  background: var(--el-bg-color-page);
}
.top-nav :deep(.el-menu-item) {
  border-bottom: 2px solid transparent;
}
.top-nav :deep(.el-menu-item.is-active) {
  color: var(--el-color-primary, #22c55e);
  border-bottom-color: var(--el-color-primary, #22c55e);
  font-weight: 600;
}

.app-main {
  flex: 1;
  width: 100%;
  max-width: 1080px;
  margin: 0 auto;
  padding: 24px;
}

.app-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 18px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
  border-top: 1px solid var(--el-border-color-lighter);
}
.footer-divider {
  color: var(--el-border-color);
}
</style>