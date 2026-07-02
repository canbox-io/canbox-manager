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
    ElButton, ElCard, ElTag, ElEmpty,
    ElDialog, ElForm, ElFormItem, ElInput,
    ElSelect, ElOption, ElSwitch, ElInputNumber
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

// 注册 Element Plus 组件
app.component('ElContainer', ElContainer);
app.component('ElAside', ElAside);
app.component('ElMain', ElMain);
app.component('ElButton', ElButton);
app.component('ElCard', ElCard);
app.component('ElTag', ElTag);
app.component('ElEmpty', ElEmpty);
app.component('ElDialog', ElDialog);
app.component('ElForm', ElForm);
app.component('ElFormItem', ElFormItem);
app.component('ElInput', ElInput);
app.component('ElSelect', ElSelect);
app.component('ElOption', ElOption);
app.component('ElSwitch', ElSwitch);
app.component('ElInputNumber', ElInputNumber);

app.mount('#app');
const _tMounted = performance.now();

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
