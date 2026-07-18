import { defineStore } from 'pinia';
import { ref } from 'vue';

/**
 * Electron 版本下载状态管理。
 *
 * 设计目的：下载进度是跨页面共享的全局状态。
 * 无论用户在 AppsView 触发下载，还是在 ElectronVersionsView 触发，
 * 切换路由后进度都不应丢失。
 *
 * 全局只订阅一次 onElectronDownloadProgress，
 * 多个组件读取同一个 store 状态即可同步显示。
 */
export const useElectronStore = defineStore('electron', () => {
    // 当前正在下载的版本（一次只允许一个）：version 字符串 | null
    const downloadingVersion = ref(null);
    // 下载进度：0-100
    const downloadProgress = ref(0);
    // 最近一次下载结果：{ success, version, error? } | null
    const lastResult = ref(null);

    let unsubscribeProgress = null;
    let subscribed = false;

    /**
     * 订阅主进程下载进度事件。
     * 幂等：多次调用只会订阅一次。
     * 应在 App.vue 或首次使用时调用，确保整个应用生命周期内有效。
     */
    function subscribe() {
        if (subscribed) return;
        subscribed = true;
        unsubscribeProgress = window.api.manager.onElectronDownloadProgress((data) => {
            if (data && data.version === downloadingVersion.value) {
                downloadProgress.value = data.progress || 0;
            }
        });
    }

    /**
     * 触发下载指定版本。
     * @param {string} version
     * @returns {Promise<{success: boolean, version?: string, error?: string}>}
     */
    async function downloadElectron(version) {
        if (downloadingVersion.value) {
            return { success: false, error: '已有下载任务进行中' };
        }
        subscribe();
        downloadingVersion.value = version;
        downloadProgress.value = 0;
        lastResult.value = null;
        try {
            const r = await window.api.manager.electronDownload(version);
            console.log('[electronStore] downloadElectron IPC 返回:', JSON.stringify(r));
            lastResult.value = r;
            return r;
        } finally {
            console.log('[electronStore] finally 执行, 清空 downloadingVersion');
            downloadingVersion.value = null;
            downloadProgress.value = 0;
        }
    }

    /**
     * 取消当前下载。
     */
    async function cancelDownload() {
        if (!downloadingVersion.value) return;
        try {
            await window.api.manager.electronCancelDownload(downloadingVersion.value);
        } finally {
            downloadingVersion.value = null;
            downloadProgress.value = 0;
        }
    }

    return {
        downloadingVersion,
        downloadProgress,
        lastResult,
        subscribe,
        downloadElectron,
        cancelDownload
    };
});
