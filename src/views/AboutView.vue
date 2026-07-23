<script setup>
import { onMounted, ref, watch } from 'vue';
import { storeToRefs } from 'pinia';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import logoUrl from '../../logo.svg';
import notification from '@/utils/notification';
import { useUpdaterStore } from '@/stores/updater';

const { t } = useI18n();

const platformInfo = ref(null);
const coreVersion = ref('');
const appVersion = __APP_VERSION__;

// 更新状态从 store 获取，跨视图保持
const updater = useUpdaterStore();
const { updateInfo, checking, downloading, downloadProgress, pendingRestart } = storeToRefs(updater);

onMounted(async () => {
    try {
        platformInfo.value = await window.api.misc.getPlatformInfo();
        coreVersion.value = await window.api.misc.getCoreVersion();
    } catch (e) {
        // 降级
    }

    // 确保全局事件监听已注册（store 内部只注册一次）
    updater.ensureListeners();

    // 进入待重启状态时弹窗询问用户
    if (pendingRestart.value) {
        promptRestartNow();
    }
});

// 监听 pendingRestart 变化：下载完成且有并发任务时弹窗
watch(pendingRestart, (val) => {
    if (val) {
        promptRestartNow();
    }
});

// 把任务列表翻译成可读文案
function describeTasks(tasks) {
    return tasks.map((task) => {
        if (task.type === 'electron_download') return t('about.update.electronDownloading');
        if (task.type === 'app_install') return t('about.update.appInstalling');
        return t('about.update.taskRunning');
    });
}

// 下载完成但有并发任务：弹窗询问用户是立即重启还是等待
async function promptRestartNow() {
    try {
        const tasks = await updater.checkRunningTasks();
        if (tasks.length === 0) {
            // 任务已结束，直接安装
            const result = await updater.installNow();
            if (!result.success && result.code !== 'TASKS_RUNNING') {
                notification.error(result.error || t('about.update.installFailed'));
            }
            return;
        }
        const desc = describeTasks(tasks).join('、');
        await ElMessageBox.confirm(
            t('about.update.tasksRunningPrompt', { tasks: desc }),
            t('about.update.tasksRunningTitle'),
            {
                confirmButtonText: t('about.update.restartNow'),
                cancelButtonText: t('about.update.waitFinish'),
                type: 'warning'
            }
        );
        // 用户选择立即重启
        const result = await updater.installNow();
        if (!result.success && result.code !== 'TASKS_RUNNING') {
            notification.error(result.error || t('about.update.installFailed'));
        }
    } catch (e) {
        // 用户选择等待，不做任何操作，保留 pendingRestart 状态
    }
}

// 用户在关于页点击"立即重启"按钮
async function restartNow() {
    // 再次检查并发任务（用户可能在等待期间又发起了新任务）
    const tasks = await updater.checkRunningTasks();
    if (tasks.length > 0) {
        const desc = describeTasks(tasks).join('、');
        try {
            await ElMessageBox.confirm(
                t('about.update.tasksRunningPrompt', { tasks: desc }),
                t('about.update.tasksRunningTitle'),
                {
                    confirmButtonText: t('about.update.restartNow'),
                    cancelButtonText: t('about.update.waitFinish'),
                    type: 'warning'
                }
            );
        } catch (e) {
            return; // 用户取消
        }
    }
    const result = await updater.installNow();
    if (!result.success && result.code !== 'TASKS_RUNNING') {
        notification.error(result.error || t('about.update.installFailed'));
    }
}

const infoItems = [
    { key: 'coreVersion', value: coreVersion, i18n: 'about.coreVersion' },
    { key: 'platform', value: () => platformInfo.value ? `${platformInfo.value.platform} (${platformInfo.value.arch})` : '-', i18n: 'about.platform' },
    { key: 'electronVersion', value: () => platformInfo.value ? `Electron ${platformInfo.value.electronVersion}` : '-', i18n: 'about.electronVersion' },
    { key: 'chromeVersion', value: () => platformInfo.value ? `Chromium ${platformInfo.value.chromeVersion}` : '-', i18n: 'about.chromeVersion' },
    { key: 'nodeVersion', value: () => platformInfo.value ? `Node.js ${platformInfo.value.nodeVersion}` : '-', i18n: 'about.nodeVersion' }
];

async function openHomepage() {
    try {
        await window.api.manager.openUrl('https://github.com/canbox-io/canbox-manager');
    } catch (e) {
        // 忽略打开失败
    }
}

async function checkUpdate() {
    try {
        const result = await updater.checkUpdate();
        if (!result.hasUpdate) {
            if (result.error) {
                notification.error(t('about.update.checkFailed'));
            } else {
                notification.success(t('about.update.upToDate'));
            }
        }
    } catch (e) {
        notification.error(t('about.update.checkFailed'));
    }
}

async function doUpdate() {
    await updater.downloadAndInstall(t, notification);
}
</script>

<template>
    <div class="view-container">
        <div class="view-header">
            <h2 class="view-title">{{ $t('about.title') }}</h2>
        </div>

        <div class="about-content">
            <!-- 产品信息 -->
            <div class="about-hero">
                <div class="hero-icon">
                    <img :src="logoUrl" :alt="$t('app.name')" class="hero-logo" />
                </div>
                <h1 class="hero-name">{{ $t('app.name') }}</h1>
                <p class="hero-version">v{{ $t('app.version') }}</p>
            </div>

            <!-- 更新检查 -->
            <el-card class="info-card update-card" shadow="never">
                <template #header>
                    <span class="section-title">{{ $t('about.update.title') }}</span>
                </template>
                <div class="update-section">
                    <div class="update-info">
                        <div class="info-row">
                            <span class="info-label">{{ $t('about.update.currentVersion') }}</span>
                            <span class="info-value">v{{ appVersion }}</span>
                        </div>
                        <div v-if="updateInfo && updateInfo.latestVersion" class="info-row">
                            <span class="info-label">{{ $t('about.update.latestVersion') }}</span>
                            <span class="info-value" :class="{ 'new-version': updateInfo.hasUpdate }">
                                v{{ updateInfo.latestVersion }}
                            </span>
                        </div>
                    </div>

                    <div class="update-actions">
                        <el-button :loading="checking" @click="checkUpdate">
                            {{ $t('about.update.checkUpdate') }}
                        </el-button>
                        <el-button
                            v-if="updateInfo && updateInfo.hasUpdate && !downloading && !pendingRestart"
                            type="primary"
                            @click="doUpdate"
                        >
                            {{ $t('about.update.updateNow') }}
                        </el-button>
                        <el-button
                            v-if="pendingRestart"
                            type="primary"
                            @click="restartNow"
                        >
                            {{ $t('about.update.restartNow') }}
                        </el-button>
                    </div>

                    <div v-if="updateInfo && updateInfo.hasUpdate && !pendingRestart" class="update-notice">
                        {{ $t('about.update.newVersionAvailable') }}
                    </div>

                    <div v-if="pendingRestart" class="update-notice pending-notice">
                        {{ $t('about.update.pendingRestartNotice') }}
                    </div>

                    <div v-if="downloading" class="download-progress">
                        <el-progress :percentage="downloadProgress" :stroke-width="8" />
                        <p class="progress-text">{{ $t('about.update.downloading') }}{{ downloadProgress }}%</p>
                    </div>
                </div>
            </el-card>

            <!-- 技术信息 -->
            <el-card class="info-card" shadow="never">
                <template #header>
                    <span class="section-title">System Info</span>
                </template>
                <div class="info-list">
                    <div v-for="item in infoItems" :key="item.key" class="info-row">
                        <span class="info-label">{{ $t(item.i18n) }}</span>
                        <span class="info-value">{{ typeof item.value === 'function' ? item.value() : item.value }}</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">{{ $t('about.license') }}</span>
                        <span class="info-value">Apache-2.0</span>
                    </div>
                    <div class="info-row">
                        <span class="info-label">{{ $t('about.author') }}</span>
                        <span class="info-value">canbox-io</span>
                    </div>
                </div>
            </el-card>

            <!-- 链接 -->
            <div class="about-links">
                <el-button @click="openHomepage">
                    🔗 {{ $t('about.homepage') }}
                </el-button>
            </div>
        </div>
    </div>
</template>

<style scoped>
.view-container {
    height: 100%;
    display: flex;
    flex-direction: column;
}

.view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    border-bottom: 1px solid var(--el-border-color-light);
    flex-shrink: 0;
}

.view-title {
    font-size: 20px;
    font-weight: 600;
    margin: 0;
    color: var(--el-text-color-primary);
}

.about-content {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

.about-hero {
    text-align: center;
    padding: 32px 0;
}

.hero-icon {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 16px;
}

.hero-logo {
    width: 96px;
    height: 96px;
    border-radius: 20px;
    object-fit: contain;
}

.hero-name {
    font-size: 28px;
    font-weight: 700;
    margin: 0 0 8px;
    color: var(--el-text-color-primary);
}

.hero-version {
    font-size: 15px;
    color: var(--el-text-color-secondary);
    margin: 0;
}

.info-card {
    margin-bottom: 20px;
}

.section-title {
    font-size: 16px;
    font-weight: 600;
}

.info-list {
    display: flex;
    flex-direction: column;
}

.info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 10px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.info-row:last-child {
    border-bottom: none;
}

.info-label {
    font-size: 14px;
    color: var(--el-text-color-secondary);
}

.info-value {
    font-size: 14px;
    color: var(--el-text-color-primary);
    font-family: 'SF Mono', 'Cascadia Code', monospace;
}

.about-links {
    display: flex;
    gap: 12px;
}

.update-card {
    margin-bottom: 20px;
}

.update-section {
    display: flex;
    flex-direction: column;
    gap: 16px;
}

.update-actions {
    display: flex;
    gap: 12px;
}

.update-notice {
    font-size: 13px;
    color: var(--el-color-success);
    padding: 8px 12px;
    background: var(--el-color-success-light-9);
    border-radius: 4px;
}

.pending-notice {
    color: var(--el-color-warning);
    background: var(--el-color-warning-light-9);
}

.new-version {
    color: var(--el-color-success);
    font-weight: 600;
}

.download-progress {
    margin-top: 4px;
}

.progress-text {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin: 8px 0 0;
}
</style>
