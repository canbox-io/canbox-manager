<script setup>
import { onMounted, onUnmounted, ref, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import { useReposStore } from '@/stores/repos';
import notification from '@/utils/notification';

const { t } = useI18n();
const reposStore = useReposStore();

const showAddDialog = ref(false);
const addForm = ref({ url: '' });
const adding = ref(false);

// README 抽屉
const showReadmeDrawer = ref(false);
const readmeContent = ref('');
const readmeRepoName = ref('');
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const renderedReadme = computed(() => {
    if (!readmeContent.value) return '';
    try {
        return md.render(readmeContent.value);
    } catch (e) {
        return readmeContent.value;
    }
});

// 平台 SVG 图标（与 AppsView 保持一致）
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

function getPlatforms(repo) {
    return repo.platforms && repo.platforms.length > 0 ? repo.platforms : ['windows', 'darwin', 'linux'];
}

let removeProgressListener = null;

onMounted(() => {
    reposStore.fetchRepos();
    removeProgressListener = window.api.manager.onInstallProgress((data) => {
        if (data && data.repoId) {
            reposStore.installProgress[data.repoId] = data.progress;
        }
    });
});

onUnmounted(() => {
    if (removeProgressListener) removeProgressListener();
});

async function handleAdd() {
    if (!addForm.value.url.trim()) return;
    adding.value = true;
    try {
        const result = await reposStore.addRepo(addForm.value.url.trim());
        if (result.success) {
            notification.success(t('repos.addSuccess'));
            showAddDialog.value = false;
            addForm.value = { url: '' };
        } else if (result.error === 'duplicate_url') {
            notification.warning(t('repos.addDuplicate'));
        } else {
            notification.error(result.error || t('repos.addFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('repos.addFailed'));
    } finally {
        adding.value = false;
    }
}

async function handleRemove(repo) {
    try {
        await ElMessageBox.confirm(
            t('repos.removeConfirm'),
            t('repos.remove'),
            { type: 'warning' }
        );
        const result = await reposStore.removeRepo(repo.id);
        if (result.success) {
            notification.success(t('repos.removeSuccess'));
        } else {
            notification.error(result.error);
        }
    } catch (e) {
        // 用户取消
    }
}

async function handleSync(repo) {
    const result = await reposStore.syncRepo(repo.id);
    if (result.success) {
        notification.success(t('repos.syncSuccess'));
    } else {
        notification.error(result.error || t('repos.syncFailed'));
    }
}

async function handleInstall(repo) {
    const result = await reposStore.installRepo(repo.id);
    if (result.success) {
        notification.success(t('repos.installSuccess'));
    } else {
        notification.error(result.error || t('repos.installFailed'));
    }
}

async function handleLaunch(repo) {
    if (!repo.installedAppId) return;
    try {
        const result = await window.api.manager.appsLaunch(repo.installedAppId);
        if (!result.success) {
            notification.error(result.error || t('apps.launchFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('apps.launchFailed'));
    }
}

async function openReadme(repo) {
    const result = await reposStore.getReadme(repo.id);
    if (result.success) {
        readmeContent.value = result.readme || '';
        readmeRepoName.value = repo.name;
        showReadmeDrawer.value = true;
    } else {
        notification.error(result.error);
    }
}
</script>

<template>
    <div class="view-container">
        <div class="view-header">
            <h2 class="view-title">{{ $t('repos.title') }}</h2>
            <el-button type="primary" @click="showAddDialog = true">
                ＋ {{ $t('repos.add') }}
            </el-button>
        </div>

        <div v-if="reposStore.loading" class="loading-state">
            <span class="spinner"></span>
        </div>

        <div v-else-if="!reposStore.repos.length" class="empty-state">
            <el-empty :description="$t('repos.empty')">
                <template #extra>
                    <p class="empty-hint">{{ $t('repos.emptyHint') }}</p>
                </template>
            </el-empty>
        </div>

        <div v-else class="repo-list">
            <div v-for="repo in reposStore.repos" :key="repo.id" class="repo-card">
                <!-- Logo -->
                <div class="logo-section">
                    <img v-if="repo.logo" :src="repo.logo" :alt="repo.name" />
                    <span v-else class="logo-placeholder">📦</span>
                </div>

                <!-- 信息区域 -->
                <div class="info-section">
                    <div class="name-row">
                        <span class="repo-name" @click="openReadme(repo)" :title="$t('repos.viewReadme')">
                            {{ repo.displayName || repo.name }}
                        </span>
                        <span class="repo-version">v{{ repo.version }}</span>
                        <span class="platforms">
                            <el-tooltip
                                v-for="p in getPlatforms(repo)"
                                :key="p"
                                :content="PLATFORM_NAMES[p] || p"
                                placement="top"
                            >
                                <span class="platform-icon" v-html="PLATFORM_ICONS_SVG[p] || ''"></span>
                            </el-tooltip>
                        </span>
                    </div>
                    <div class="repo-desc">{{ repo.description || $t('apps.noDesc') }}</div>
                    <div class="repo-url">{{ repo.url }}</div>

                    <!-- keywords -->
                    <div v-if="repo.keywords && repo.keywords.length > 0" class="repo-keywords">
                        <span v-for="kw in repo.keywords" :key="kw" class="keyword-tag">#{{ kw }}</span>
                    </div>

                    <!-- 状态标签 -->
                    <div class="repo-status">
                        <el-tag v-if="repo.lastError" type="danger" size="small">{{ $t('repos.probeFailed') }}</el-tag>
                        <el-tag v-else-if="repo.installedAppId && repo.toUpdate" type="warning" size="small">{{ $t('repos.hasUpdate') }}</el-tag>
                        <el-tag v-else-if="repo.installedAppId" type="success" size="small">{{ $t('repos.installed') }}</el-tag>
                    </div>

                    <!-- 操作按钮 -->
                    <div class="repo-actions">
                        <!-- 安装/启动/更新 -->
                        <el-tooltip v-if="!repo.installedAppId" :content="$t('repos.install')" placement="top">
                            <button
                                class="icon-btn install-btn"
                                :disabled="reposStore.installing[repo.id]"
                                @click="handleInstall(repo)"
                            >
                                <span v-if="reposStore.installing[repo.id]" class="mini-spinner"></span>
                                <span v-else>⬇️</span>
                            </button>
                        </el-tooltip>
                        <el-tooltip v-else-if="repo.toUpdate" :content="$t('repos.update')" placement="top">
                            <button
                                class="icon-btn install-btn"
                                :disabled="reposStore.installing[repo.id]"
                                @click="handleInstall(repo)"
                            >
                                <span v-if="reposStore.installing[repo.id]" class="mini-spinner"></span>
                                <span v-else>🔄</span>
                            </button>
                        </el-tooltip>
                        <el-tooltip v-else :content="$t('apps.launch')" placement="top">
                            <button class="icon-btn run-btn" @click="handleLaunch(repo)">▶️</button>
                        </el-tooltip>

                        <!-- 同步 -->
                        <el-tooltip :content="$t('repos.sync')" placement="top">
                            <button
                                class="icon-btn sync-btn"
                                :disabled="reposStore.syncing[repo.id]"
                                @click="handleSync(repo)"
                            >
                                <span v-if="reposStore.syncing[repo.id]" class="mini-spinner"></span>
                                <span v-else>↻</span>
                            </button>
                        </el-tooltip>

                        <!-- 删除 -->
                        <el-tooltip :content="$t('repos.remove')" placement="top">
                            <button class="icon-btn delete-btn" @click="handleRemove(repo)">🗑️</button>
                        </el-tooltip>
                    </div>

                    <!-- 安装进度条 -->
                    <div v-if="reposStore.installing[repo.id] && reposStore.installProgress[repo.id] > 0" class="progress-bar">
                        <el-progress :percentage="reposStore.installProgress[repo.id]" :stroke-width="4" :show-text="false" />
                    </div>
                </div>
            </div>
        </div>

        <!-- 添加仓库对话框 -->
        <el-dialog
            v-model="showAddDialog"
            :title="$t('repos.addDialogTitle')"
            width="480px"
            :close-on-click-modal="false"
        >
            <el-form label-position="top">
                <el-form-item :label="$t('repos.url')">
                    <el-input
                        v-model="addForm.url"
                        :placeholder="$t('repos.urlPlaceholder')"
                        clearable
                        @keyup.enter="handleAdd"
                    />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showAddDialog = false">{{ $t('common.cancel') }}</el-button>
                <el-button type="primary" @click="handleAdd" :loading="adding">
                    {{ $t('common.confirm') }}
                </el-button>
            </template>
        </el-dialog>

        <!-- README 抽屉 -->
        <el-drawer
            v-model="showReadmeDrawer"
            :title="readmeRepoName"
            direction="rtl"
            size="580px"
        >
            <div class="readme-content" v-html="renderedReadme"></div>
        </el-drawer>
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

/* 卡片布局：logo 左侧 + 信息右侧（与 AppsView 一致） */
.repo-list {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(520px, 1fr));
    gap: 16px;
    align-content: start;
}

.repo-card {
    background: var(--el-fill-color-light);
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    padding: 20px;
    display: flex;
    align-items: flex-start;
    transition: box-shadow 0.2s;
}
.repo-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

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
.repo-name {
    font-size: 19px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    cursor: pointer;
    transition: color 0.2s;
}
.repo-name:hover {
    color: var(--el-color-primary);
}
.repo-version {
    color: var(--el-text-color-regular);
    font-size: 15px;
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
.repo-desc {
    color: var(--el-text-color-primary);
    font-size: 16px;
    margin-top: 6px;
    line-height: 1.5;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.repo-url {
    color: var(--el-text-color-placeholder);
    font-size: 13px;
    margin-top: 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}
.repo-keywords {
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
.repo-status {
    margin-top: 8px;
}

/* 操作按钮 */
.repo-actions {
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
.icon-btn:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}
.icon-btn:active:not(:disabled) {
    transform: translateY(0);
}
.icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.6;
}
.install-btn:hover:not(:disabled) { background: var(--el-color-primary-light-9); }
.run-btn:hover { background: var(--el-color-success-light-9); }
.sync-btn:hover:not(:disabled) { background: var(--el-color-info-light-9); }
.delete-btn:hover { background: var(--el-color-danger-light-9); }

.mini-spinner {
    width: 16px;
    height: 16px;
    border: 2px solid var(--el-border-color);
    border-top-color: var(--el-color-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    display: inline-block;
}

.progress-bar {
    margin-top: 8px;
}

/* README 抽屉内容 */
.readme-content {
    padding: 0 8px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
    word-wrap: break-word;
}
.readme-content :deep(h1),
.readme-content :deep(h2),
.readme-content :deep(h3) {
    margin: 20px 0 10px;
    font-weight: 600;
}
.readme-content :deep(h1) { font-size: 24px; }
.readme-content :deep(h2) { font-size: 20px; }
.readme-content :deep(h3) { font-size: 17px; }
.readme-content :deep(p) { margin: 10px 0; }
.readme-content :deep(ul),
.readme-content :deep(ol) { padding-left: 24px; margin: 10px 0; }
.readme-content :deep(li) { margin: 4px 0; }
.readme-content :deep(pre) {
    background: var(--el-fill-color-darker);
    border-radius: 6px;
    padding: 12px;
    overflow-x: auto;
    font-size: 13px;
}
.readme-content :deep(code) {
    font-family: monospace;
    font-size: 13px;
}
.readme-content :deep(pre code) {
    background: none;
    padding: 0;
}
.readme-content :deep(:not(pre) > code) {
    background: var(--el-fill-color-darker);
    padding: 2px 6px;
    border-radius: 3px;
}
.readme-content :deep(img) {
    max-width: 100%;
    border-radius: 6px;
}
.readme-content :deep(table) {
    border-collapse: collapse;
    width: 100%;
    margin: 12px 0;
}
.readme-content :deep(th),
.readme-content :deep(td) {
    border: 1px solid var(--el-border-color);
    padding: 8px 12px;
}
.readme-content :deep(th) {
    background: var(--el-fill-color-light);
}
.readme-content :deep(a) {
    color: var(--el-color-primary);
    text-decoration: none;
}
.readme-content :deep(a:hover) {
    text-decoration: underline;
}
.readme-content :deep(blockquote) {
    border-left: 4px solid var(--el-border-color);
    padding-left: 16px;
    margin: 12px 0;
    color: var(--el-text-color-secondary);
}
</style>
