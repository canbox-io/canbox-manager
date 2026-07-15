<script setup>
import { onMounted, ref, onUnmounted } from 'vue';
import { useI18n } from 'vue-i18n';
import logoUrl from '../../logo.svg';
import notification from '@/utils/notification';

const { t } = useI18n();

const platformInfo = ref(null);
const coreVersion = ref('');
const appVersion = __APP_VERSION__;

// 更新相关
const updateInfo = ref(null);
const checking = ref(false);
const downloading = ref(false);
const downloadProgress = ref(0);

let unsubUpdateAvailable = null;
let unsubDownloadProgress = null;

onMounted(async () => {
    try {
        platformInfo.value = await window.api.misc.getPlatformInfo();
        coreVersion.value = await window.api.misc.getCoreVersion();
    } catch (e) {
        // 降级
    }

    // 监听启动时后台检查的新版本通知
    unsubUpdateAvailable = window.api.manager.onUpdateAvailable((data) => {
        updateInfo.value = data;
    });

    // 监听下载进度
    unsubDownloadProgress = window.api.manager.onUpdateDownloadProgress((data) => {
        downloadProgress.value = data.progress;
    });
});

onUnmounted(() => {
    if (unsubUpdateAvailable) unsubUpdateAvailable();
    if (unsubDownloadProgress) unsubDownloadProgress();
});

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
    checking.value = true;
    try {
        const result = await window.api.manager.updateCheck();
        updateInfo.value = result;
        if (!result.hasUpdate) {
            if (result.error) {
                notification.error(t('about.update.checkFailed'));
            } else {
                notification.success(t('about.update.upToDate'));
            }
        }
    } catch (e) {
        notification.error(t('about.update.checkFailed'));
    } finally {
        checking.value = false;
    }
}

async function doUpdate() {
    if (!updateInfo.value || !updateInfo.value.downloadUrl) return;
    downloading.value = true;
    downloadProgress.value = 0;
    try {
        const result = await window.api.manager.updateDownload(updateInfo.value.downloadUrl);
        if (result.success) {
            downloadProgress.value = 100;
            // 启动安装包并退出 manager
            await window.api.manager.updateInstall(result.installerPath);
        } else {
            downloading.value = false;
            notification.error(result.error || t('about.update.downloadFailed'));
        }
    } catch (e) {
        downloading.value = false;
        notification.error(t('about.update.downloadFailed'));
    }
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
                            v-if="updateInfo && updateInfo.hasUpdate && !downloading"
                            type="primary"
                            @click="doUpdate"
                        >
                            {{ $t('about.update.updateNow') }}
                        </el-button>
                    </div>

                    <div v-if="updateInfo && updateInfo.hasUpdate" class="update-notice">
                        {{ $t('about.update.newVersionAvailable') }}
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
                        <span class="info-value">rexlevin</span>
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
