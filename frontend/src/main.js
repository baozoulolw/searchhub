import { createApp } from 'vue';
import ElementPlus from 'element-plus';
import 'element-plus/dist/index.css';
// Element Plus 官方暗色模式变量
import 'element-plus/theme-chalk/dark/css-vars.css';
import * as ElementPlusIconsVue from '@element-plus/icons-vue';
import './styles.css';
import App from './App.vue';
import { router } from './router';

// 启用暗色模式：html.dark 类名触发 Element Plus 暗色变量
document.documentElement.classList.add('dark');

const app = createApp(App);

// 全局注册所有图标
for (const [name, comp] of Object.entries(ElementPlusIconsVue)) {
  app.component(name, comp);
}

app.use(ElementPlus).use(router).mount('#app');