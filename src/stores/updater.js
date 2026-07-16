import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUpdaterStore = defineStore('updater', () => {
    // 更新检查相关状态（跨视图保持，避免组件卸载后丢失）
    const updateInfo = ref(null);
    const checking = ref(false);
    const downloading = ref(false);
    const downloadProgress = ref(0);

    // 事件订阅句柄（全局只订阅一次，不随组件挂载/卸载变化）
    let unsubUpdateAvailable = null;
    let unsubDownloadProgress = null;

    // 确保事件监听只注册一次
    function ensureListeners() {
        if (unsubUpdateAvailable && unsubDownloadProgress) return;

        if (!unsubUpdateAvailable) {
            unsubUpdateAvailable = window.api.manager.onUpdateAvailable((data) => {
                updateInfo.value = data;
            });
        }
        if (!unsubDownloadProgress) {
            unsubDownloadProgress = window.api.manager.onUpdateDownloadProgress((data) => {
                downloadProgress.value = data.progress;
            });
        }
    }

    async function checkUpdate() {
        ensureListeners();
        checking.value = true;
        try {
            const result = await window.api.manager.updateCheck();
            updateInfo.value = result;
            return result;
        } finally {
            checking.value = false;
        }
    }

    async function downloadAndInstall(t, notification) {
        if (!updateInfo.value || !updateInfo.value.downloadUrl) return;
        downloading.value = true;
        downloadProgress.value = 0;
        try {
            const result = await window.api.manager.updateDownload(updateInfo.value.downloadUrl);
            if (result.success) {
                downloadProgress.value = 100;
                await window.api.manager.updateInstall(result.installerPath);
            } else {
                downloading.value = false;
                if (notification) {
                    notification.error(result.error || t('about.update.downloadFailed'));
                }
            }
        } catch (e) {
            downloading.value = false;
            if (notification) {
                notification.error(t('about.update.downloadFailed'));
            }
        }
    }

    return {
        updateInfo,
        checking,
        downloading,
        downloadProgress,
        ensureListeners,
        checkUpdate,
        downloadAndInstall
    };
});
