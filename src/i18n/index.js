import { createI18n } from 'vue-i18n';
import zhCN from './locales/zh-CN.json';
import enUS from './locales/en-US.json';

const i18n = createI18n({
    legacy: false,
    locale: 'zh-CN',
    fallbackLocale: 'zh-CN',
    messages: {
        'zh-CN': zhCN,
        'en-US': enUS
    }
});

/**
 * 将主进程返回的结构化错误转换为当前界面语言的文案。
 * 主进程返回 errorCode + errorParams，渲染层用 i18n 翻译；
 * 无 errorCode 时继续使用原有 error 文本。
 */
export function translateIpcError(t, result, fallbackKey = 'common.error') {
    if (result && result.errorCode) {
        return t(result.errorCode, result.errorParams || {});
    }
    return (result && result.error) || t(fallbackKey);
}

export default i18n;
