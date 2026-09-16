<template>
  <div class="stats-page">
    <!-- 提示条 -->
    <el-alert type="info" :closable="false" class="gap">
      <template #title>
        <el-icon style="margin-right: 6px"><DataAnalysis /></el-icon>总览看板
      </template>
      <div class="hint-desc">
        统计所有搜索入口（管理页 / REST API / MCP）的调用情况。每次引擎尝试（含失败的故障转移重试）都计为一次引擎调用。
      </div>
    </el-alert>

    <!-- 统计卡 -->
    <div class="stat-cards">
      <div class="stat-card">
        <div class="stat-label">总调用次数</div>
        <div class="stat-value mono">{{ fmt(summary.total) }}</div>
        <div class="stat-sub">
          <span class="ok">✓ {{ fmt(summary.success) }}</span>
          <span class="dot">·</span>
          <span class="bad">✕ {{ fmt(summary.fail) }}</span>
          <el-popover placement="top" :width="300" trigger="hover" content="各入口：管理页 / REST API / MCP">
            <template #reference>
              <span class="channel-ref">按入口：A{{ summary.byChannel?.admin || 0 }} · R{{ summary.byChannel?.api || 0 }} · M{{ summary.byChannel?.mcp || 0 }}</span>
            </template>
          </el-popover>
        </div>
      </div>
      <div class="stat-card">
        <div class="stat-label">成功率</div>
        <div class="stat-value mono">{{ summary.successRate }}<small>%</small></div>
        <div class="stat-sub">请求级别成功率</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">平均耗时</div>
        <div class="stat-value mono">{{ summary.avgLatencyMs }}<small>ms</small></div>
        <div class="stat-sub">单次搜索请求</div>
      </div>
      <div class="stat-card">
        <div class="stat-label">最近 24h 调用</div>
        <div class="stat-value mono">{{ fmt(summary.last24h) }}</div>
        <div class="stat-sub">引擎尝试共 {{ fmt(summary.attempts) }} 次</div>
      </div>
    </div>

    <!-- 图表面板 -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">调用趋势</div>
        <el-radio-group v-model="range" size="small" @change="loadSeries">
          <el-radio-button value="24h">24 小时</el-radio-button>
          <el-radio-button value="7d">7 天</el-radio-button>
          <el-radio-button value="30d">30 天</el-radio-button>
        </el-radio-group>
      </div>
      <div ref="seriesEl" class="chart chart-tall"></div>
    </div>

    <div class="panel-row">
      <div class="panel">
        <div class="panel-title">引擎调用占比</div>
        <div ref="pieEl" class="chart chart-mid"></div>
      </div>
      <div class="panel">
        <div class="panel-title">引擎调用次数排行</div>
        <div ref="barEl" class="chart chart-mid"></div>
      </div>
    </div>

    <!-- 调用日志 -->
    <div class="panel">
      <div class="panel-head">
        <div class="panel-title">调用日志</div>
        <div class="filter-bar">
          <el-input v-model="filters.q" placeholder="搜索词关键字" clearable class="f-q" @keyup.enter="reloadLogs" @clear="reloadLogs" />
          <el-select v-model="filters.channel" placeholder="渠道" clearable class="f-s" @change="reloadLogs">
            <el-option label="管理页" value="admin" />
            <el-option label="REST API" value="api" />
            <el-option label="MCP" value="mcp" />
          </el-select>
          <el-select v-model="filters.provider" placeholder="引擎" clearable class="f-s" @change="reloadLogs">
            <el-option v-for="e in engines" :key="e.provider" :label="e.providerLabel" :value="e.provider" />
          </el-select>
          <el-select v-model="filters.ok" placeholder="状态" clearable class="f-s" @change="reloadLogs">
            <el-option label="成功" value="true" />
            <el-option label="失败" value="false" />
          </el-select>
          <el-button :icon="Refresh" circle @click="reloadLogs" />
        </div>
      </div>

      <el-table :data="logs.items" stripe class="logs-table" v-loading="logsLoading">
        <el-table-column label="时间" width="150">
          <template #default="{ row }">
            <span class="mono ts">{{ fmtTs(row.ts) }}</span>
          </template>
        </el-table-column>
        <el-table-column label="渠道" width="86">
          <template #default="{ row }">
            <el-tag size="small" effect="plain" :class="'ch-' + row.channel">{{ channelLabel(row.channel) }}</el-tag>
          </template>
        </el-table-column>
        <el-table-column label="查询" min-width="200" show-overflow-tooltip>
          <template #default="{ row }"><span class="query-text">{{ row.query }}</span></template>
        </el-table-column>
        <el-table-column label="结果" width="92">
          <template #default="{ row }">
            <span class="ok-text" v-if="row.success">成功</span>
            <span class="bad-text" v-else>失败</span>
          </template>
        </el-table-column>
        <el-table-column label="命中引擎 / 条数" width="150">
          <template #default="{ row }">
            <template v-if="row.success">
              <span class="result-label">{{ row.resultProviderLabel || '-' }}</span>
              <span class="mono items">{{ winItems(row) }} 条</span>
            </template>
            <span v-else class="muted mono">—</span>
          </template>
        </el-table-column>
        <el-table-column label="尝试" width="140">
          <template #default="{ row }">
            <div class="attempt-chips">
              <el-tooltip v-for="a in row.attempts" :key="a.provider" :content="attemptTip(a)" placement="top">
                <span class="chip" :class="a.ok ? 'chip-ok' : 'chip-bad'">{{ a.provider }}</span>
              </el-tooltip>
              <span v-if="!row.attempts.length" class="muted mono">—</span>
            </div>
          </template>
        </el-table-column>
        <el-table-column label="耗时" width="86">
          <template #default="{ row }"><span class="mono ts">{{ row.elapsedMs }}ms</span></template>
        </el-table-column>
      </el-table>

      <div class="pager">
        <el-pagination
          layout="total, prev, pager, next, sizes"
          :total="logs.total"
          :page-size="filters.pageSize"
          :current-page="filters.page"
          :page-sizes="[20, 50, 100]"
          background
          @current-change="onPage"
          @size-change="onSize"
        />
        <el-button size="small" type="danger" text :icon="Delete" :disabled="!summary.total" @click="confirmClear">清空统计</el-button>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount, reactive } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { DataAnalysis, Refresh, Delete } from '@element-plus/icons-vue';
// 按需引入 ECharts，仅加载本页用到的图表与组件，避免整包 1MB+ 拖慢 /stats 路由
import * as echarts from 'echarts/core';
import { LineChart, BarChart, PieChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent, GraphicComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
echarts.use([LineChart, BarChart, PieChart, GridComponent, TooltipComponent, LegendComponent, GraphicComponent, CanvasRenderer]);
import { api } from '../api';

// —— 暗色主题（页面/卡片背景 #151d30）下可读的配色 ——
// 引擎 → 固定色（颜色跟随实体，不跟随排名，保证看板与排行/占比图一致）
const ENGINE_COLORS = {
  tavily: '#3987e5',      // 蓝
  doubao: '#d95926',      // 橙
  brave: '#199e70',       // 水绿青
  exa: '#c98500',         // 黄
  browserbase: '#d55181', // 品红
  default: '#9085e9',     // 紫（兜底）
};
const INK = {
  primary: '#edf0f5',
  secondary: '#c6ccd9',
  muted: '#9aa5b8',
  grid: '#26304a',
  axis: '#2c3850',
  area: 'rgba(57,135,229,0.18)',
};
const ok = '#22c55e';
const bad = '#ef4444';

const summary = ref({ total: 0, success: 0, fail: 0, successRate: 0, avgLatencyMs: 0, attempts: 0, last24h: 0, byChannel: {} });
const engines = ref([]);
const range = ref('24h');

const seriesEl = ref(null);
const pieEl = ref(null);
const barEl = ref(null);
let seriesChart = null;
let pieChart = null;
let barChart = null;

const logs = ref({ items: [], total: 0 });
const logsLoading = ref(false);
const filters = reactive({ q: '', channel: '', provider: '', ok: '', page: 1, pageSize: 20 });

const fmt = (n) => (Number(n) || 0).toLocaleString('en-US');
const pad = (n) => `${n}`.padStart(2, '0');
const channelLabel = (c) => ({ admin: '管理页', api: 'REST', mcp: 'MCP' }[c] || c);
function fmtTs(iso) {
  const d = new Date(iso);
  return `${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
function winItems(row) {
  const win = row.attempts.find((a) => a.ok);
  return win?.itemsCount ?? 0;
}
function attemptTip(a) {
  return `${a.providerLabel} · ${a.ok ? `成功 ${a.itemsCount ?? 0} 条` : '失败'} · ${a.elapsedMs}ms${a.ok ? '' : `\n${a.error || ''}`}`;
}

function initChart(elRef) {
  if (!elRef.value) return null;
  return echarts.init(elRef.value);
}
function setOption(chart, option) {
  if (chart) chart.setOption(option, true);
}
function noData(option, emptyText = '暂无数据') {
  const g = option.color ? (option.color[0] || INK.secondary) : INK.secondary;
  option.graphic = [
    {
      type: 'text',
      left: 'center',
      top: 'middle',
      style: { text: emptyText, fill: INK.muted, fontSize: 13 },
    },
  ];
  return option;
}

function colorFor(provider) {
  return ENGINE_COLORS[provider] || ENGINE_COLORS.default;
}

async function loadSummary() {
  summary.value = await api.statsSummary();
}
async function loadEngines() {
  engines.value = await api.statsEngines();
}
async function loadSeries() {
  const data = await api.statsSeries(range.value);
  setOption(seriesChart, buildSeriesOption(data));
}
function buildSeriesOption(data) {
  const have = data.some((p) => p.total > 0);
  const base = {
    backgroundColor: 'transparent',
    grid: { left: 12, right: 12, top: 14, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      backgroundColor: '#1a2438',
      borderColor: '#2c3850',
      textStyle: { color: INK.primary },
      formatter: (ps) => {
        const p = ps[0];
        const it = data.find((d) => d.time === p.axisValue) || {};
        return `${p.axisValue}<br/>调用 ${it.total ?? 0} 次 · 成功 ${it.success ?? 0} · 失败 ${it.fail ?? 0}`;
      },
    },
    xAxis: {
      type: 'category',
      data: data.map((d) => d.time),
      axisLine: { lineStyle: { color: INK.axis } },
      axisLabel: { color: INK.muted, fontSize: 11 },
      axisTick: { show: false },
    },
    yAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: INK.grid } },
      axisLabel: { color: INK.muted, fontSize: 11 },
    },
    series: [
      {
        name: '调用次数',
        type: 'line',
        smooth: true,
        symbol: 'circle',
        symbolSize: 6,
        data: data.map((d) => d.total),
        lineStyle: { width: 2, color: '#3987e5' },
        itemStyle: { color: '#3987e5' },
        areaStyle: { color: INK.area },
      },
    ],
  };
  return have ? base : noData(base);
}

function buildPieOption() {
  const list = engines.value;
  const base = {
    backgroundColor: 'transparent',
    color: list.map((e) => colorFor(e.provider)),
    tooltip: {
      trigger: 'item',
      backgroundColor: '#1a2438',
      borderColor: '#2c3850',
      textStyle: { color: INK.primary },
      formatter: (p) => `${p.name}<br/>${p.value} 次 · ${p.percent}%`,
    },
    legend: {
      type: 'scroll',
      orient: 'vertical',
      right: 4,
      top: 'middle',
      textStyle: { color: INK.secondary, fontSize: 12 },
      itemWidth: 10,
      itemHeight: 10,
      icon: 'circle',
    },
    series: [
      {
        name: '引擎调用',
        type: 'pie',
        radius: ['52%', '74%'],
        center: ['34%', '50%'],
        avoidLabelOverlap: true,
        itemStyle: { borderColor: '#151d30', borderWidth: 2, borderRadius: 4 },
        label: { color: INK.secondary, fontSize: 12 },
        emphasis: { itemStyle: { shadowBlur: 0 } },
        data: list.map((e) => ({
          name: e.providerLabel,
          value: e.calls,
          itemStyle: { color: colorFor(e.provider) },
        })),
      },
    ],
  };
  return list.length ? base : noData(base);
}

function buildBarOption() {
  const list = engines.value.slice().sort((a, b) => b.calls - a.calls);
  const base = {
    backgroundColor: 'transparent',
    grid: { left: 12, right: 30, top: 10, bottom: 8, containLabel: true },
    tooltip: {
      trigger: 'axis',
      axisPointer: { type: 'shadow' },
      backgroundColor: '#1a2438',
      borderColor: '#2c3850',
      textStyle: { color: INK.primary },
      formatter: (ps) => {
        const p = ps[0];
        const e = list[p.dataIndex];
        return `${e.providerLabel}<br/>调用 ${e.calls} 次<br/>成功 ${e.success}（${e.successRate}%）· 失败 ${e.fail}<br/>平均 ${e.avgLatencyMs}ms · 命中 ${e.itemsCount} 条`;
      },
    },
    xAxis: {
      type: 'value',
      minInterval: 1,
      splitLine: { lineStyle: { color: INK.grid } },
      axisLabel: { color: INK.muted, fontSize: 11 },
    },
    yAxis: {
      type: 'category',
      data: list.map((e) => e.providerLabel),
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: INK.secondary, fontSize: 12 },
    },
    series: [
      {
        name: '调用次数',
        type: 'bar',
        data: list.map((e) => ({
          value: e.calls,
          itemStyle: {
            color: colorFor(e.provider),
            borderRadius: [0, 4, 4, 0],
          },
        })),
        barWidth: 14,
        label: {
          show: true,
          position: 'right',
          color: INK.secondary,
          fontSize: 11,
          formatter: (p) => `${p.value}`,
        },
      },
    ],
  };
  return list.length ? base : noData(base, '暂无引擎调用');
}

async function reloadLogs() {
  logsLoading.value = true;
  try {
    logs.value = await api.statsLogs({ ...filters });
  } finally {
    logsLoading.value = false;
  }
}
function onPage(p) {
  filters.page = p;
  reloadLogs();
}
function onSize(s) {
  filters.pageSize = s;
  filters.page = 1;
  reloadLogs();
}
function confirmClear() {
  ElMessageBox.confirm('确认清空全部调用统计与日志？此操作不可恢复。', '清空统计', {
    confirmButtonText: '清空',
    cancelButtonText: '取消',
    type: 'warning',
  })
    .then(async () => {
      await api.clearStats();
      ElMessage.success('已清空');
      await Promise.all([loadSummary(), loadEngines(), loadSeries(), reloadLogs()]);
    })
    .catch(() => {});
}

function onResize() {
  seriesChart?.resize();
  pieChart?.resize();
  barChart?.resize();
}

onMounted(async () => {
  seriesChart = initChart(seriesEl);
  pieChart = initChart(pieEl);
  barChart = initChart(barEl);
  window.addEventListener('resize', onResize);
  const [s, e] = await Promise.all([api.statsSummary(), api.statsEngines()]);
  summary.value = s;
  engines.value = e;
  await Promise.all([loadSeries(), reloadLogs()]);
  setOption(pieChart, buildPieOption());
  setOption(barChart, buildBarOption());
});

onBeforeUnmount(() => {
  window.removeEventListener('resize', onResize);
  seriesChart?.dispose();
  pieChart?.dispose();
  barChart?.dispose();
});
</script>

<style scoped>
.gap { margin-bottom: 16px; }
.hint-desc { font-size: 13px; line-height: 1.7; color: var(--el-text-color-regular); margin-top: 4px; }

.stat-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 14px; margin-bottom: 16px; }
.stat-card {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px 18px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.stat-label { font-size: 13px; color: var(--el-text-color-secondary); }
.stat-value { font-size: 30px; font-weight: 700; color: var(--el-text-color-primary); letter-spacing: -0.5px; line-height: 1; }
.stat-value small { font-size: 14px; font-weight: 500; color: var(--el-text-color-secondary); margin-left: 2px; }
.stat-sub { font-size: 12px; color: var(--el-text-color-secondary); display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.ok { color: var(--el-color-success, #22c55e); }
.bad { color: var(--el-color-danger, #ef4444); }
.dot { color: var(--el-border-color); }
.channel-ref { color: var(--el-text-color-placeholder); cursor: help; border-bottom: 1px dashed var(--el-border-color); }

.panel {
  background: var(--el-bg-color);
  border: 1px solid var(--el-border-color-lighter);
  border-radius: 10px;
  padding: 16px;
  margin-bottom: 16px;
}
.panel-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
.panel-row .panel { margin-bottom: 0; }
@media (max-width: 860px) { .panel-row { grid-template-columns: 1fr; } .panel-row .panel { margin-bottom: 16px; } }
.panel-head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 12px; flex-wrap: wrap; gap: 10px; }
.panel-title { font-size: 15px; font-weight: 600; color: var(--el-text-color-primary); }
.chart { width: 100%; }
.chart-tall { height: 260px; }
.chart-mid { height: 300px; }

.filter-bar { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.f-q { width: 180px; }
.f-s { width: 120px; }

.logs-table :deep(.el-table__row) { font-size: 13px; }
.query-text { color: var(--el-text-color-primary); }
.ts { font-size: 12px; color: var(--el-text-color-secondary); }
.ok-text { color: var(--el-color-success, #22c55e); font-weight: 500; }
.bad-text { color: var(--el-color-danger, #ef4444); font-weight: 500; }
.muted { color: var(--el-text-color-placeholder); }
.result-label { color: var(--el-text-color-primary); margin-right: 6px; }
.items { color: var(--el-text-color-secondary); }

.attempt-chips { display: flex; gap: 4px; flex-wrap: wrap; }
.chip {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  padding: 1px 7px;
  border-radius: 5px;
  border: 1px solid transparent;
}
.chip-ok { color: var(--el-color-success, #22c55e); background: rgba(34, 197, 94, 0.12); border-color: rgba(34, 197, 94, 0.35); }
.chip-bad { color: var(--el-color-danger, #ef4444); background: rgba(239, 68, 68, 0.12); border-color: rgba(239, 68, 68, 0.35); }

.ch-admin { color: #3987e5; border-color: rgba(57, 135, 229, 0.4); }
.ch-api { color: #c98500; border-color: rgba(201, 133, 0, 0.4); }
.ch-mcp { color: #d55181; border-color: rgba(213, 81, 129, 0.4); }

.pager { display: flex; align-items: center; justify-content: space-between; margin-top: 14px; flex-wrap: wrap; gap: 10px; }
</style>