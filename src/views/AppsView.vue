<script setup>
import { computed, onMounted, onUnmounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import { ElMessageBox } from 'element-plus';
import { useAppsStore } from '@/stores/apps';
import { useReposStore } from '@/stores/repos';
import { useElectronStore } from '@/stores/electron';
import notification from '@/utils/notification';
import WebAppEditor from './WebAppEditor.vue';

const { t } = useI18n();
const router = useRouter();
const appsStore = useAppsStore();
const reposStore = useReposStore();
const importing = ref(false);
// installingDeveloper 提升至 store，避免路由切换组件卸载后状态丢失
const installingDeveloper = computed(() => reposStore.installingDeveloper);

// 网页应用创建/编辑对话框
const webAppEditorVisible = ref(false);
const webAppEditorMode = ref('create'); // 'create' | 'edit'
const editingApp = ref(null);

function handleCreateWebApp() {
    webAppEditorMode.value = 'create';
    editingApp.value = null;
    webAppEditorVisible.value = true;
}

function handleEditWebApp(app) {
    webAppEditorMode.value = 'edit';
    editingApp.value = app;
    webAppEditorVisible.value = true;
}

function onWebAppSuccess() {
    appsStore.fetchApps();
}

// canbox-developer 的标识（package.json 的 id / name）
const DEVELOPER_APP_ID = 'com.github.canbox-io.canbox-developer';
const DEVELOPER_APP_NAME = 'canbox-developer';

// 是否已安装 developer（已安装则不显示引导 banner）
const hasDeveloperInstalled = computed(() => {
    return appsStore.apps.some(app =>
        app.id === DEVELOPER_APP_ID || app.name === DEVELOPER_APP_NAME
    );
});

// 平台 SVG 图标（与 canbox-developer 保持一致）
const PLATFORM_ICONS_SVG = {
    windows: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
    darwin: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/></svg>'
};
const PLATFORM_NAMES = {
    windows: 'Windows',
    darwin: 'macOS',
    linux: 'Linux'
};

// 解析 APP 支持的平台，无 platforms 字段则默认全平台
function getPlatforms(app) {
    return app.platforms && app.platforms.length > 0 ? app.platforms : ['windows', 'darwin', 'linux'];
}

// APP 更新信息：{ [appId]: { repoId, currentVersion, newVersion } }
const appUpdates = ref({});
let offUpdatesAvailable = null;

// 下载状态从全局 store 读取（跨页面共享，切换路由不丢失）
const electronStore = useElectronStore();
const downloadingElectron = computed(() => {
    if (!electronStore.downloadingVersion) return null;
    return {
        version: electronStore.downloadingVersion,
        progress: electronStore.downloadProgress
    };
});

async function refreshUpdates() {
    try {
        const result = await appsStore.checkUpdates();
        if (result.success) {
            const map = {};
            for (const u of result.updates) {
                map[u.appId] = u;
            }
            appUpdates.value = map;
            await reposStore.fetchRepos();
        }
    } catch (e) {
        // 静默失败
    }
}

onMounted(() => {
    appsStore.fetchApps();
    // 监听后台自动检查结果
    offUpdatesAvailable = window.api.manager.onAppsUpdatesAvailable((updates) => {
        const map = {};
        for (const u of updates) {
            map[u.appId] = u;
        }
        appUpdates.value = map;
        reposStore.fetchRepos();
    });
});

onUnmounted(() => {
    if (offUpdatesAvailable) offUpdatesAvailable();
});

async function handleImport() {
    try {
        const result = await window.api.manager.showOpenDialog({
            properties: ['openFile'],
            filters: [
                { name: 'Canbox APP 压缩包', extensions: ['zip'] }
            ],
            title: t('apps.importTitle')
        });
        if (result.canceled || !result.filePaths.length) return;
        await doImport(result.filePaths[0]);
    } catch (e) {
        notification.error(e.message || t('apps.importFailed'));
    }
}

async function doImport(appPath) {
    try {
        importing.value = true;
        const res = await appsStore.importApp(appPath);
        if (res.success) {
            notification.success(t('apps.importSuccess'));
        } else {
            notification.error(res.error || t('apps.importFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('apps.importFailed'));
    } finally {
        importing.value = false;
    }
}

async function handleLaunch(app) {
    try {
        const result = await appsStore.launchApp(app.appId);
        if (!result.success) {
            // 启动失败且需要下载 electron：弹引导对话框
            if (result.needDownload) {
                await promptDownloadElectron(app, result.version, result.url);
                return;
            }
            notification.error(result.error || t('apps.launchFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('apps.launchFailed'));
    }
}

// 缺失 electron 版本时弹对话框引导下载，下载完成后自动启动
async function promptDownloadElectron(app, version, url) {
    try {
        await ElMessageBox.confirm(
            t('apps.electronMissingPrompt', { version, name: app.name }),
            t('apps.electronMissingTitle'),
            {
                confirmButtonText: t('apps.electronDownloadNow'),
                cancelButtonText: t('apps.electronDownloadLater'),
                type: 'warning'
            }
        );
    } catch (e) {
        // 用户取消
        return;
    }
    await startElectronDownloadAndNavigate(app, version);
}

// 触发 electron 下载并跳转到 electron 版本管理页面查看进度
// 下载完成后自动刷新 APP 列表并重试启动（若来源 APP 已知）
async function startElectronDownloadAndNavigate(app, version) {
    try {
        // 不 await，让跳转先发生，下载在后台进行
        const downloadPromise = electronStore.downloadElectron(version);
        // 提示用户并跳转到 electron 版本管理页面查看进度
        notification.info(t('apps.electronDownloadingHint', { version }));
        router.push('/electron-versions');

        const r = await downloadPromise;
        if (!r || !r.success) {
            notification.error(
                t('apps.electronDownloadFailedDetail', { version, error: (r && r.error) || t('apps.electronDownloadFailed') }),
                t('apps.electronMissingTitle')
            );
            return;
        }
        notification.success(t('apps.electronDownloadDone'));
        // 下载完成 → 自动重试启动
        await appsStore.fetchApps();
        const fresh = appsStore.apps.find((a) => a.appId === app.appId);
        if (fresh) {
            await handleLaunch(fresh);
        }
    } catch (e) {
        notification.error(
            t('apps.electronDownloadFailedDetail', { version, error: e.message || t('apps.electronDownloadFailed') }),
            t('apps.electronMissingTitle')
        );
    }
}

// 是否需要展示"下载 Electron"按钮（native APP 且缺 electron 运行时）
function needDownloadElectron(app) {
    return app.type !== 'web' && app.electronStatus && !app.electronStatus.ok && app.electronStatus.needDownload;
}

// 当前 APP 是否正在下载其所需的 electron 运行时
function isDownloadingForApp(app) {
    return !!downloadingElectron.value
        && app.electronStatus
        && app.electronStatus.needDownload
        && downloadingElectron.value.version === app.electronStatus.version;
}

// 从 APP 卡片直接触发 electron 下载（不弹确认框，跳转到 electron 页面查看进度）
async function handleDownloadElectronForApp(app) {
    if (!app.electronStatus || !app.electronStatus.needDownload) return;
    await startElectronDownloadAndNavigate(app, app.electronStatus.version);
}

async function handleRemove(app) {
    try {
        await ElMessageBox.confirm(
            t('apps.removeConfirm'),
            t('apps.remove'),
            { type: 'warning' }
        );
        await appsStore.removeApp(app.appId);
        notification.success(t('apps.removeSuccess'));
        await appsStore.fetchApps();
    } catch (e) {
        // 用户取消
    }
}

async function handleClearData(app) {
    try {
        await ElMessageBox.confirm(
            t('apps.clearDataConfirm'),
            t('apps.clearData'),
            { type: 'warning' }
        );
        const result = await appsStore.clearAppData(app.appId);
        if (result.success) {
            notification.success(t('apps.clearDataSuccess'));
        }
    } catch (e) {
        // 用户取消
    }
}

// 修复快捷方式（强制重新生成 launcher）
async function handleRepairLauncher(app) {
    try {
        const result = await window.api.manager.appsRepairLauncher(app.appId);
        if (result.success) {
            if (result.skipped) {
                notification.info(t('apps.repairLauncherSkipped'));
            } else {
                notification.success(t('apps.repairLauncherSuccess'));
            }
        } else {
            notification.error(t('apps.repairLauncherFailed', { error: result.error }));
        }
    } catch (e) {
        notification.error(t('apps.repairLauncherFailed', { error: e.message || t('common.error') }));
    }
}

// 更新 APP（通过仓库重新下载安装）
async function handleUpdateApp(app) {
    const update = appUpdates.value[app.appId];
    if (!update) return;
    try {
        await ElMessageBox.confirm(
            t('apps.updateConfirm', {
                name: app.name,
                current: update.currentVersion,
                newVersion: update.newVersion
            }),
            t('apps.update'),
            { type: 'info' }
        );

        // 检测 APP 是否正在运行
        let { running } = await window.api.manager.appsIsRunning(app.appId);
        if (running) {
            try {
                await ElMessageBox.confirm(
                    t('apps.updateRunningPrompt', { name: app.name }),
                    t('apps.update'),
                    {
                        type: 'warning',
                        confirmButtonText: t('apps.closeAndUpdate'),
                        cancelButtonText: t('common.cancel')
                    }
                );
            } catch (cancelErr) {
                // 用户取消
                return;
            }
            const killRes = await window.api.manager.appsKillRunning(app.appId);
            if (killRes.stillRunning) {
                notification.error(t('apps.updateKillFailed'));
                return;
            }
        }

        await reposStore.installRepo(update.repoId);
        notification.success(t('apps.updateSuccess'));
        // 更新完成后清除该 APP 的更新标记并刷新列表
        const next = { ...appUpdates.value };
        delete next[app.appId];
        appUpdates.value = next;
        await appsStore.fetchApps();
    } catch (e) {
        // 用户取消或安装失败
        if (e && e.message) {
            notification.error(e.message);
        }
    }
}

// 开发者工具引导 banner 跳转 URL（canbox-pages 网站开发者工具板块）
const DEVELOPER_URL = 'https://canbox-io.github.io/canbox-pages/#developer';
// canbox-developer 仓库 URL（用于一键添加仓库并安装）
const DEVELOPER_REPO_URL = 'https://github.com/canbox-io/canbox-developer';

async function openDeveloperTools() {
    try {
        await window.api.manager.openUrl(DEVELOPER_URL);
    } catch (e) {
        notification.error(e.message || t('common.error'));
    }
}

// 一键安装 Developer：add repo → install → 跳转仓库页
async function installDeveloper() {
    if (reposStore.installingDeveloper) return;
    reposStore.installingDeveloper = true;

    let repoId = null;
    try {
        // 1. 添加 developer 仓库（已存在则复用）
        await reposStore.fetchRepos();
        const existing = reposStore.repos.find(r => r.url === DEVELOPER_REPO_URL);
        if (existing) {
            repoId = existing.id;
            notification.info(t('developer.repoExists'));
        } else {
            const addResult = await reposStore.addRepo(DEVELOPER_REPO_URL);
            if (!addResult.success) {
                notification.error(addResult.error || t('developer.addFailed'));
                return;
            }
            repoId = addResult.repo.id;
        }

        // 2. 跳转仓库页（让用户看到下载进度卡片）
        router.push('/repos');

        // 3. 触发安装（下载 + import）
        const installResult = await reposStore.installRepo(repoId);
        if (installResult.success) {
            notification.success(t('developer.installSuccess'));
        } else {
            notification.error(installResult.error || t('developer.installFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('developer.installFailed'));
    } finally {
        reposStore.installingDeveloper = false;
    }
}

</script>

<template>
    <div class="view-container">
        <div class="view-header">
            <h2 class="view-title">{{ $t('apps.title') }}</h2>
            <div class="view-header-actions">
                <el-button type="success" @click="handleCreateWebApp">
                    🌐 {{ $t('webApp.create') }}
                </el-button>
                <el-button type="primary" @click="handleImport" :loading="importing">
                    📦 {{ $t('apps.import') }}
                </el-button>
            </div>
        </div>

        <div v-if="appsStore.loading" class="loading-state">
            <span class="spinner"></span>
        </div>

        <div v-else-if="!appsStore.apps.length" class="empty-state">
            <el-empty :description="$t('apps.empty')">
                <template #extra>
                    <p class="empty-hint">{{ $t('apps.emptyHint') }}</p>
                </template>
            </el-empty>
        </div>

        <div v-else class="app-list">
            <div v-for="app in appsStore.apps" :key="app.appId" class="app-card" :class="{ 'app-card-missing-electron': needDownloadElectron(app) }">
                <!-- Logo -->
                <div class="logo-section">
                    <img v-if="app.logo" :src="app.logo" :alt="app.name" />
                    <span v-else class="logo-placeholder">📦</span>
                </div>

                <!-- 信息区域 -->
                <div class="info-section">
                    <div class="name-row">
                        <span class="app-name">{{ app.name }}</span>
                        <span class="app-version">v{{ app.version }}</span>
                        <!-- 网页/PWA 角标 -->
                        <el-tooltip
                            v-if="app.type === 'web'"
                            :content="app.isPwa ? $t('webApp.pwaBadge') : $t('webApp.webBadge')"
                            placement="top"
                        >
                            <span class="type-badge" :class="{ 'pwa-badge': app.isPwa }">
                                {{ app.isPwa ? 'PWA' : 'WEB' }}
                            </span>
                        </el-tooltip>
                        <!-- 更新提醒徽章 -->
                        <el-tooltip
                            v-if="appUpdates[app.appId]"
                            :content="$t('apps.updateAvailable', {
                                current: appUpdates[app.appId].currentVersion,
                                newVersion: appUpdates[app.appId].newVersion
                            })"
                            placement="top"
                        >
                            <span class="update-badge" @click="handleUpdateApp(app)">
                                {{ $t('apps.hasUpdate') }} v{{ appUpdates[app.appId].newVersion }}
                            </span>
                        </el-tooltip>
                        <!-- electron 版本缺失徽标 -->
                        <el-tooltip
                            v-if="app.electronStatus && !app.electronStatus.ok && app.electronStatus.needDownload"
                            :content="$t('apps.electronMissingTooltip', { version: app.electronStatus.version })"
                            placement="top"
                        >
                            <span class="electron-missing-badge">
                                {{ $t('apps.electronMissingBadge', { version: app.electronStatus.version }) }}
                            </span>
                        </el-tooltip>
                        <!-- 下载进度条（store 中正在下载的版本等于该 APP 缺失的版本时显示） -->
                        <span
                            v-if="downloadingElectron && app.electronStatus && app.electronStatus.needDownload && downloadingElectron.version === app.electronStatus.version"
                            class="downloading-electron"
                        >
                            <el-progress
                                :percentage="downloadingElectron.progress"
                                :stroke-width="6"
                                :show-text="false"
                                style="width: 80px;"
                            />
                        </span>
                        <!-- 平台图标靠右，无 platforms 则默认全平台 -->
                        <span class="platforms">
                            <el-tooltip
                                v-for="p in getPlatforms(app)"
                                :key="p"
                                :content="PLATFORM_NAMES[p] || p"
                                placement="top"
                            >
                                <span class="platform-icon" v-html="PLATFORM_ICONS_SVG[p] || ''"></span>
                            </el-tooltip>
                        </span>
                    </div>
                    <div class="app-desc">{{ app.description || $t('apps.noDesc') }}</div>
                    <div class="app-id">{{ app.appId }}</div>

                    <!-- keywords 标签 -->
                    <div v-if="app.keywords && app.keywords.length > 0" class="app-keywords">
                        <span v-for="kw in app.keywords" :key="kw" class="keyword-tag">#{{ kw }}</span>
                    </div>

                    <!-- 底部操作按钮 -->
                    <div class="app-actions">
                        <!-- 缺 electron 运行时：显示下载按钮（下载中显示进度，禁用点击） -->
                        <el-tooltip
                            v-if="needDownloadElectron(app)"
                            :content="isDownloadingForApp(app)
                                ? $t('apps.electronDownloadingTooltip', { version: app.electronStatus.version })
                                : $t('apps.downloadElectronTooltip', { version: app.electronStatus.version })"
                            placement="top"
                        >
                            <button
                                class="icon-btn download-electron-btn"
                                :disabled="isDownloadingForApp(app)"
                                @click="handleDownloadElectronForApp(app)"
                            >
                                <span v-if="isDownloadingForApp(app)" class="mini-spinner"></span>
                                <span v-else>⬇️</span>
                            </button>
                        </el-tooltip>
                        <!-- 有可运行 electron：显示运行按钮 -->
                        <el-tooltip v-else :content="$t('apps.launch')" placement="top">
                            <button class="icon-btn run-btn" @click="handleLaunch(app)">▶️</button>
                        </el-tooltip>
                        <!-- 仅网页/PWA APP 显示编辑按钮 -->
                        <el-tooltip
                            v-if="app.type === 'web'"
                            :content="$t('webApp.edit')"
                            placement="top"
                        >
                            <button class="icon-btn edit-btn" @click="handleEditWebApp(app)">✏️</button>
                        </el-tooltip>
                        <el-tooltip
                            v-if="appUpdates[app.appId]"
                            :content="$t('apps.update')"
                            placement="top"
                        >
                            <button class="icon-btn update-btn" @click="handleUpdateApp(app)">🔄</button>
                        </el-tooltip>
                        <el-tooltip :content="$t('apps.repairLauncher')" placement="top">
                            <button class="icon-btn repair-btn" @click="handleRepairLauncher(app)">🔧</button>
                        </el-tooltip>
                        <el-tooltip :content="$t('apps.clearData')" placement="top">
                            <button class="icon-btn clear-btn" @click="handleClearData(app)">🧹</button>
                        </el-tooltip>
                        <el-tooltip :content="$t('apps.remove')" placement="top">
                            <button class="icon-btn delete-btn" @click="handleRemove(app)">🗑️</button>
                        </el-tooltip>
                    </div>
                </div>
            </div>
        </div>

        <!-- 开发者工具引导 banner（已安装 developer 则隐藏） -->
        <div v-if="!hasDeveloperInstalled" class="developer-banner">
            <div class="banner-icon">🛠️</div>
            <div class="banner-text">
                <div class="banner-title">{{ $t('developer.bannerTitle') }}</div>
                <div class="banner-desc">{{ $t('developer.bannerDesc') }}</div>
            </div>
            <div class="banner-actions">
                <button
                    class="banner-btn banner-btn-primary"
                    :disabled="installingDeveloper"
                    @click="installDeveloper"
                >
                    <span v-if="installingDeveloper" class="banner-spinner"></span>
                    <span v-else>⬇️</span>
                    {{ installingDeveloper ? $t('developer.installing') : $t('developer.bannerInstall') }}
                </button>
                <button class="banner-btn banner-btn-secondary" @click="openDeveloperTools">
                    {{ $t('developer.bannerCta') }}
                    <span class="banner-arrow">→</span>
                </button>
            </div>
        </div>

        <!-- 网页应用创建/编辑对话框 -->
        <WebAppEditor
            v-model:visible="webAppEditorVisible"
            :mode="webAppEditorMode"
            :edit-app="editingApp"
            @success="onWebAppSuccess"
        />
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
.view-header-actions {
    display: flex;
    gap: 8px;
}

.empty-state,
.loading-state {
    flex: 1;
    display: flex;
    justify-content: center;
    align-items: center;
}

.empty-hint {
    color: var(--el-text-color-secondary);
    font-size: 14px;
}

.spinner {
    width: 32px;
    height: 32px;
    border: 3px solid var(--el-border-color-lighter);
    border-top-color: var(--el-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
}

@keyframes spin {
    to { transform: rotate(360deg); }
}

@keyframes update-pulse {
    0%, 100% { box-shadow: 0 0 0 0 rgba(230, 162, 60, 0.4); }
    50% { box-shadow: 0 0 0 6px rgba(230, 162, 60, 0); }
}

/* 卡片布局：logo 左侧 + 信息右侧 */
.app-list {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
    gap: 16px;
    align-content: start;
}

.app-card {
    background: var(--el-fill-color-light);
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    padding: 20px;
    display: flex;
    align-items: flex-start;
    transition: box-shadow 0.2s;
}
.app-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}
/* 缺 electron 运行时的 APP 卡片：左侧橙色边框提示 */
.app-card-missing-electron {
    border-left: 3px solid var(--el-color-warning);
}

/* Logo */
.logo-section {
    flex-shrink: 0;
}
.logo-section img {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    object-fit: cover;
}
.logo-placeholder {
    width: 72px;
    height: 72px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 36px;
    background: var(--el-fill-color-darker);
}

/* 信息区域 */
.info-section {
    flex: 1;
    margin-left: 16px;
    min-width: 0;
    display: flex;
    flex-direction: column;
}
.name-row {
    display: flex;
    align-items: baseline;
    gap: 10px;
}
.app-name {
    font-size: 19px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}
.app-version {
    color: var(--el-text-color-regular);
    font-size: 15px;
}

/* 网页/PWA 类型角标 */
.type-badge {
    display: inline-flex;
    align-items: center;
    padding: 1px 6px;
    background: var(--el-color-info-light-9);
    color: var(--el-color-info-dark-2);
    border: 1px solid var(--el-color-info-light-5);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    line-height: 1.4;
    letter-spacing: 0.5px;
}
.type-badge.pwa-badge {
    background: var(--el-color-success-light-9);
    color: var(--el-color-success-dark-2);
    border-color: var(--el-color-success-light-5);
}

/* 更新徽章 */
.update-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--el-color-warning-light-9);
    color: var(--el-color-warning-dark-2);
    border: 1px solid var(--el-color-warning-light-5);
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.2s;
}
.update-badge:hover {
    background: var(--el-color-warning-light-7);
}
/* electron 版本缺失徽标 */
.electron-missing-badge {
    display: inline-flex;
    align-items: center;
    padding: 2px 8px;
    background: var(--el-color-danger-light-9);
    color: var(--el-color-danger-dark-2);
    border: 1px solid var(--el-color-danger-light-5);
    border-radius: 10px;
    font-size: 12px;
    font-weight: 500;
}
.downloading-electron {
    display: inline-flex;
    align-items: center;
    margin-left: 4px;
}
.platforms {
    margin-left: auto;
    display: flex;
    gap: 6px;
}
.platform-icon {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-secondary);
    cursor: help;
}
.platform-icon :deep(svg) {
    width: 100%;
    height: 100%;
}
.app-desc {
    color: var(--el-text-color-primary);
    font-size: 16px;
    margin-top: 6px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-id {
    color: var(--el-text-color-placeholder);
    font-size: 13px;
    margin-top: 4px;
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.app-keywords {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
    margin-top: 6px;
}
.keyword-tag {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color-darker);
    border-radius: 4px;
    padding: 2px 8px;
}

/* 操作按钮 */
.app-actions {
    display: flex;
    gap: 10px;
    margin-top: 12px;
}

.icon-btn {
    width: 40px;
    height: 40px;
    border: none;
    background: var(--el-fill-color);
    border-radius: 8px;
    cursor: pointer;
    font-size: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    line-height: 1;
}
.icon-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.icon-btn:active {
    transform: translateY(0);
}
.run-btn:hover { background: var(--el-color-success-light-9); }
.download-electron-btn:hover { background: var(--el-color-warning-light-9); }
.download-electron-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
}
/* 小型旋转 spinner（下载按钮内） */
.mini-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--el-color-warning-light-5);
    border-top-color: var(--el-color-warning);
    border-radius: 50%;
    animation: mini-spin 0.8s linear infinite;
}
@keyframes mini-spin {
    to { transform: rotate(360deg); }
}
.edit-btn:hover { background: var(--el-color-primary-light-9); }
.update-btn { animation: update-pulse 2s ease-in-out infinite; }
.update-btn:hover { background: var(--el-color-warning-light-9); }
.repair-btn:hover { background: var(--el-color-primary-light-9); }
.clear-btn:hover { background: var(--el-color-warning-light-9); }
.delete-btn:hover { background: var(--el-color-danger-light-9); }

/* 开发者工具引导 banner */
.developer-banner {
    flex-shrink: 0;
    margin: 0 24px 16px;
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
    background: linear-gradient(135deg, var(--el-color-primary), var(--el-color-primary-light-3));
    color: #fff;
    border-radius: 12px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.banner-icon {
    font-size: 28px;
    flex-shrink: 0;
    line-height: 1;
}

.banner-text {
    flex: 1;
    min-width: 0;
}
.banner-title {
    font-size: 15px;
    font-weight: 600;
    line-height: 1.4;
}
.banner-desc {
    font-size: 13px;
    opacity: 0.9;
    margin-top: 2px;
    line-height: 1.4;
}

.banner-actions {
    flex-shrink: 0;
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

.banner-btn {
    font-size: 14px;
    font-weight: 500;
    padding: 8px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
    gap: 6px;
    white-space: nowrap;
    transition: background 0.2s, transform 0.1s;
    font-family: inherit;
}
.banner-btn:active {
    transform: translateY(1px);
}
.banner-btn:disabled {
    opacity: 0.65;
    cursor: not-allowed;
}

.banner-btn-primary {
    background: rgba(255, 255, 255, 0.95);
    color: var(--el-color-primary);
}
.banner-btn-primary:hover:not(:disabled) {
    background: #fff;
}

.banner-btn-secondary {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
}
.banner-btn-secondary:hover {
    background: rgba(255, 255, 255, 0.3);
}

.banner-spinner {
    width: 12px;
    height: 12px;
    border: 2px solid currentColor;
    border-top-color: transparent;
    border-radius: 50%;
    animation: banner-spin 0.8s linear infinite;
    display: inline-block;
}
@keyframes banner-spin {
    to { transform: rotate(360deg); }
}

.banner-arrow {
    transition: transform 0.2s;
}
.banner-btn-secondary:hover .banner-arrow {
    transform: translateX(3px);
}

@media (max-width: 600px) {
    .developer-banner {
        flex-direction: column;
        align-items: flex-start;
        gap: 8px;
    }
    .banner-actions {
        width: 100%;
    }
    .banner-btn {
        flex: 1;
        justify-content: center;
    }
}
</style>
