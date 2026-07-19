import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useUpdaterStore = defineStore('updater', () => {
    // 更新检查相关状态（跨视图保持，避免组件卸载后丢失）
    const updateInfo = ref(null);
    const checking = ref(false);
    const downloading = ref(false);
    const downloadProgress = ref(0);

    // 安装包已下载完成，等待用户决定是否重启
    const pendingRestart = ref(false);
    // 下载完成的安装包路径
    const installerPath = ref('');

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

    // 查询当前进行中的任务（electron 下载 / APP 安装）
    async function checkRunningTasks() {
        const result = await window.api.manager.tasksListRunning();
        return (result && result.tasks) || [];
    }

    // 下载 manager 安装包；下载完成后根据并发任务情况决定直接安装还是等待用户重启
    async function downloadAndInstall(t, notification) {
        if (!updateInfo.value || !updateInfo.value.downloadUrl) return;
        downloading.value = true;
        downloadProgress.value = 0;
        try {
            const result = await window.api.manager.updateDownload(updateInfo.value.downloadUrl);
            if (!result.success) {
                downloading.value = false;
                if (notification) {
                    notification.error(result.error || t('about.update.downloadFailed'));
                }
                return;
            }
            downloadProgress.value = 100;
            // 下载完成：检查是否有并发任务
            const tasks = await checkRunningTasks();
            if (tasks.length === 0) {
                // 无并发任务：直接安装
                await window.api.manager.updateInstall(result.installerPath);
            } else {
                // 有并发任务：进入等待重启状态，让前端弹窗询问用户
                installerPath.value = result.installerPath;
                pendingRestart.value = true;
            }
        } catch (e) {
            downloading.value = false;
            if (notification) {
                notification.error(t('about.update.downloadFailed'));
            }
        }
    }

    // 用户点击"立即重启"时调用（pendingRestart 状态下）
    // force=true 表示用户已在确认弹窗中同意中断并发任务
    async function installNow() {
        if (!installerPath.value) return { success: false };
        const result = await window.api.manager.updateInstall(installerPath.value);
        if (result && result.success) {
            pendingRestart.value = false;
            return { success: true };
        }
        return { success: false, error: result && result.error, code: result && result.code };
    }

    return {
        updateInfo,
        checking,
        downloading,
        downloadProgress,
        pendingRestart,
        installerPath,
        ensureListeners,
        checkUpdate,
        checkRunningTasks,
        downloadAndInstall,
        installNow
    };
});
