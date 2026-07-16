/**
 * canbox-manager — Vue 应用入口
 *
 * Element Plus 组件通过手动 import + app.component() 注册。
 * CSS 使用全量导入 (element-plus/dist/index.css)，避免按需加载产生大量 HTTP 请求。
 */

const _t0 = performance.now();

import { createApp } from 'vue';
const _t1 = performance.now();

import { createPinia } from 'pinia';
const _t2 = performance.now();

import App from './App.vue';
import router from './router';
import i18n from './i18n';

// Element Plus — 全量 CSS（单次请求，比按需加载的 N 个小文件快）
import 'element-plus/dist/index.css';

// Element Plus — 手动按需注册组件（避免 unplugin-vue-components 产生大量 sub-path HTTP 请求）
import {
    ElContainer, ElAside, ElMain,
    ElButton, ElCard, ElTag, ElEmpty, ElTooltip,
    ElDialog, ElForm, ElFormItem, ElInput,
    ElSelect, ElOption, ElSwitch, ElInputNumber,
    ElDrawer, ElProgress
} from 'element-plus';

import './assets/styles.css';

const _tAfterImports = performance.now();

const app = createApp(App);
app.use(createPinia());
const _tPinia = performance.now();
app.use(router);
const _tRouter = performance.now();
app.use(i18n);
const _tI18n = performance.now();

// 应用持久化的 locale（避免重启后回退到默认中文）
// electron-store 无同步 API，用 localStorage 做同步缓存
try {
    const cachedLocale = localStorage.getItem('canbox.locale');
    if (cachedLocale === 'zh-CN' || cachedLocale === 'en-US') {
        i18n.global.locale.value = cachedLocale;
    }
} catch (e) {
    console.warn('[i18n] Failed to read cached locale:', e);
}

// 注册 Element Plus 组件
app.component('ElContainer', ElContainer);
app.component('ElAside', ElAside);
app.component('ElMain', ElMain);
app.component('ElButton', ElButton);
app.component('ElCard', ElCard);
app.component('ElTag', ElTag);
app.component('ElEmpty', ElEmpty);
app.component('ElTooltip', ElTooltip);
app.component('ElDialog', ElDialog);
app.component('ElForm', ElForm);
app.component('ElFormItem', ElFormItem);
app.component('ElInput', ElInput);
app.component('ElSelect', ElSelect);
app.component('ElOption', ElOption);
app.component('ElSwitch', ElSwitch);
app.component('ElInputNumber', ElInputNumber);
app.component('ElDrawer', ElDrawer);
app.component('ElProgress', ElProgress);

app.mount('#app');
const _tMounted = performance.now();

// ====== 缩放快捷键（Ctrl+滚轮 / Ctrl++ / Ctrl+- / Ctrl+0） ======
let currentZoom = 1.0;

window.api.manager.zoomGet().then(result => {
    if (result.success) currentZoom = result.factor;
}).catch(() => {});

function adjustZoom(delta) {
    let newZoom = Math.max(0.5, Math.min(2.0, currentZoom + delta));
    newZoom = Math.round(newZoom * 10) / 10;
    if (newZoom !== currentZoom) {
        currentZoom = newZoom;
        window.api.manager.zoomSet(currentZoom);
    }
}

document.addEventListener('wheel', (e) => {
    if (e.ctrlKey) {
        e.preventDefault();
        adjustZoom(e.deltaY > 0 ? -0.1 : 0.1);
    }
}, { passive: false });

document.addEventListener('keydown', (e) => {
    if (!e.ctrlKey) return;
    // 使用 e.code（物理按键，不受 Ctrl/Shift 修饰影响）判断
    // 修复 Ctrl+= 不触发、必须 Ctrl+Shift+= 才能放大的问题
    if (e.code === 'Equal') {
        e.preventDefault();
        adjustZoom(0.1);
    } else if (e.code === 'Minus') {
        e.preventDefault();
        adjustZoom(-0.1);
    } else if (e.code === 'Digit0' || e.code === 'Numpad0') {
        e.preventDefault();
        currentZoom = 1.0;
        window.api.manager.zoomReset();
    }
});

// 主进程推送的 zoom 变化（如设置页调节后同步）
window.api.manager.onZoomChanged((factor) => {
    currentZoom = factor;
});

console.log('[renderer-timing] ===== 各阶段耗时 =====');
console.log(`[renderer-timing] import vue             ${(_t1 - _t0).toFixed(1)}ms`);
console.log(`[renderer-timing] import pinia           ${(_t2 - _t1).toFixed(1)}ms`);
console.log(`[renderer-timing] import App+router+i18n+el+styles  ${(_tAfterImports - _t2).toFixed(1)}ms`);
console.log(`[renderer-timing] imports 总计           ${(_tAfterImports - _t0).toFixed(1)}ms`);
console.log(`[renderer-timing] createApp+use(pinia)   ${(_tPinia - _tAfterImports).toFixed(1)}ms`);
console.log(`[renderer-timing] use(router)            ${(_tRouter - _tPinia).toFixed(1)}ms`);
console.log(`[renderer-timing] use(i18n)              ${(_tI18n - _tRouter).toFixed(1)}ms`);
console.log(`[renderer-timing] app.mount()            ${(_tMounted - _tI18n).toFixed(1)}ms`);
console.log(`[renderer-timing] 总计                   ${(_tMounted - _t0).toFixed(1)}ms`);
