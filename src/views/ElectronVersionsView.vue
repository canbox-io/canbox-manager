<script setup>
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import { useI18n } from 'vue-i18n';
import notification from '@/utils/notification';
import { useElectronStore } from '@/stores/electron';
import { useAppsStore } from '@/stores/apps';

const { t } = useI18n();
const electronStore = useElectronStore();
const appsStore = useAppsStore();

const loading = ref(false);
const versions = ref([]);

// 下载状态从全局 store 读取（跨页面共享，切换路由不丢失）
const downloadingVersion = computed(() => electronStore.downloadingVersion);
const downloadProgress = computed(() => electronStore.downloadProgress);
// 安装中（zip 下载完成后的解压/写注册表阶段），progress 卡在 100 但未完成
const installing = computed(() => downloadingVersion.value && downloadProgress.value >= 100);

/**
 * 构造下载中版本的占位行。
 * 用于从其他页面跳转过来时，loadVersions 未返回前先渲染进度条。
 * 真实数据加载后会被替换。
 */
function makePlaceholderRow(version) {
    return {
        version,
        installed: false,
        source: null,
        supported: true
    };
}

const loadVersions = async () => {
    // 若进入页面时已有下载任务进行中，先放占位行，确保进度条立即可见
    if (downloadingVersion.value && !versions.value.some(v => v.version === downloadingVersion.value)) {
        versions.value = [makePlaceholderRow(downloadingVersion.value)];
    }
    loading.value = true;
    try {
        const res = await window.api.manager.electronListAllowed();
        if (res.success) {
            versions.value = res.versions;
        } else {
            notification.error(t('electronVersions.loadFailed'));
        }
    } catch (e) {
        notification.error(t('electronVersions.loadFailedDetail', { error: e.message }));
    } finally {
        loading.value = false;
    }
};

const builtinVersion = computed(() => versions.value.find(v => v.source === 'builtin'));

const handleDownload = async (version) => {
    try {
        await ElMessageBox.confirm(
            t('electronVersions.downloadConfirmPrompt', { version }),
            t('electronVersions.downloadConfirmTitle'),
            { confirmButtonText: t('electronVersions.downloadConfirmBtn'), cancelButtonText: t('common.cancel'), type: 'info' }
        );
    } catch (e) {
        return;
    }
    try {
        const res = await electronStore.downloadElectron(version);
        if (res.success) {
            notification.success(t('electronVersions.downloadSuccess', { version }));
            await loadVersions();
            // 刷新 APP 列表：依赖该版本的 APP 现在可运行了（electronStatus 更新）
            // 主进程侧已补生成 launcher，这里同步前端状态
            await appsStore.fetchApps();
        } else {
            notification.error(t('electronVersions.downloadFailed', { version, error: res.error }), t('electronVersions.downloadFailedTitle'));
        }
    } catch (e) {
        notification.error(t('electronVersions.downloadError', { version, error: e.message }), t('electronVersions.downloadFailedTitle'));
    }
};

const handleCancelDownload = async () => {
    try {
        await electronStore.cancelDownload();
        notification.success(t('electronVersions.cancelSuccess'));
    } catch (e) {
        notification.error(t('electronVersions.cancelFailed', { error: e.message }));
    }
};

const handleDelete = async (version) => {
    try {
        await ElMessageBox.confirm(
            t('electronVersions.deleteConfirmPrompt', { version }),
            t('electronVersions.deleteConfirmTitle'),
            { confirmButtonText: t('electronVersions.deleteConfirmBtn'), cancelButtonText: t('common.cancel'), type: 'warning' }
        );
    } catch (e) {
        return;
    }
    try {
        const res = await window.api.manager.electronDelete(version);
        if (res.success) {
            notification.success(t('electronVersions.deleteSuccess', { version }));
            await loadVersions();
            // 刷新 APP 列表：依赖该版本的 APP 现在缺运行时了（electronStatus 更新）
            // 主进程侧已清理 launcher，这里同步前端状态
            await appsStore.fetchApps();
        } else {
            notification.error(t('electronVersions.deleteFailed', { error: res.error }));
        }
    } catch (e) {
        notification.error(t('electronVersions.deleteError', { error: e.message }));
    }
};

const sourceLabel = (source) => {
    if (source === 'builtin') return t('electronVersions.statusBuiltin');
    if (source === 'downloaded') return t('electronVersions.statusDownloaded');
    return t('electronVersions.statusNotInstalled');
};

const sourceType = (source) => {
    if (source === 'builtin') return 'success';
    if (source === 'downloaded') return 'primary';
    return 'info';
};

// 下载中行的状态标签：覆盖 sourceLabel/sourceType
function rowStatusLabel(row) {
    if (downloadingVersion.value === row.version) {
        if (installing.value) return t('electronVersions.statusInstalling');
        return t('electronVersions.statusDownloading', { progress: downloadProgress.value || 0 });
    }
    return sourceLabel(row.source);
}

function rowStatusType(row) {
    if (downloadingVersion.value === row.version) {
        return 'warning';
    }
    return sourceType(row.source);
}

// 为下载中的行附加 class，用于在行底部渲染进度条
function tableRowClassName({ row }) {
    if (downloadingVersion.value === row.version) {
        return 'row-downloading';
    }
    return '';
}

// 行样式：通过 CSS 变量传递进度百分比，供 ::after 伪元素读取
function tableRowStyle({ row }) {
    if (downloadingVersion.value === row.version && !installing.value) {
        return { '--download-progress': `${downloadProgress.value || 0}%` };
    }
    return {};
}

onMounted(() => {
    loadVersions();
});
</script>

<template>
    <div class="electron-versions-view">
        <div class="page-header">
            <div>
                <h2 class="page-title">{{ t('electronVersions.title') }}</h2>
                <p class="page-desc">{{ t('electronVersions.desc') }}</p>
            </div>
            <el-button :icon="'Refresh'" :loading="loading" @click="loadVersions">{{ t('electronVersions.refresh') }}</el-button>
        </div>

        <el-card v-loading="loading" shadow="never">
            <el-table
                :data="versions"
                style="width: 100%"
                :row-class-name="tableRowClassName"
                :row-style="tableRowStyle"
            >
                <el-table-column :label="t('electronVersions.colVersion')" prop="version" width="140">
                    <template #default="{ row }">
                        <span class="version-cell">Electron {{ row.version }}</span>
                    </template>
                </el-table-column>
                <el-table-column :label="t('electronVersions.colStatus')" min-width="140">
                    <template #default="{ row }">
                        <el-tag :type="rowStatusType(row)" size="small" :class="{ 'status-downloading': downloadingVersion === row.version }">
                            {{ rowStatusLabel(row) }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column :label="t('electronVersions.colPlatform')" width="120">
                    <template #default="{ row }">
                        <el-tag :type="row.supported ? 'success' : 'danger'" size="small" effect="plain">
                            {{ row.supported ? t('electronVersions.platformCurrent') : t('electronVersions.platformUnsupported') }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column :label="t('electronVersions.colActions')" width="220" align="right">
                    <template #default="{ row }">
                        <template v-if="downloadingVersion === row.version">
                            <el-button size="small" type="warning" plain @click="handleCancelDownload">{{ t('electronVersions.actionCancel') }}</el-button>
                        </template>
                        <template v-else-if="row.source === 'downloaded'">
                            <el-button
                                size="small"
                                type="danger"
                                plain
                                :disabled="!row.supported"
                                @click="handleDelete(row.version)"
                            >{{ t('electronVersions.actionDelete') }}</el-button>
                        </template>
                        <template v-else-if="row.source === null && row.supported">
                            <el-button
                                size="small"
                                type="primary"
                                @click="handleDownload(row.version)"
                            >{{ t('electronVersions.actionDownload') }}</el-button>
                        </template>
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <div class="info-section">
            <el-alert type="info" :closable="false" show-icon>
                <template #title>
                    <span>{{ t('electronVersions.noticeTitle') }}</span>
                </template>
                <ul class="info-list">
                    <li>{{ t('electronVersions.noticeBuiltin') }}</li>
                    <li>{{ t('electronVersions.noticeDownloaded') }}</li>
                    <li>{{ t('electronVersions.noticeRange') }}</li>
                    <li>{{ t('electronVersions.noticeDelete') }}</li>
                </ul>
            </el-alert>
        </div>
    </div>
</template>

<style scoped>
.electron-versions-view {
    padding: 24px;
}

.page-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 20px;
    gap: 16px;
}

.page-title {
    margin: 0 0 8px 0;
    font-size: 22px;
    font-weight: 600;
}

.page-desc {
    margin: 0;
    color: var(--el-text-color-secondary);
    font-size: 13px;
    line-height: 1.6;
    max-width: 720px;
}

.page-desc code {
    background-color: var(--el-fill-color-light);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: 'Menlo', 'Consolas', monospace;
    font-size: 12px;
}

.version-cell {
    font-weight: 600;
    font-family: 'Menlo', 'Consolas', monospace;
}

.hint-text {
    color: var(--el-text-color-placeholder);
    font-size: 13px;
}

.installing-text {
    color: var(--el-color-primary);
    font-weight: 500;
}

/* 下载中行的状态标签轻微脉冲，提示进行中 */
.status-downloading {
    animation: status-pulse 1.5s ease-in-out infinite;
}
@keyframes status-pulse {
    0%, 100% { opacity: 1; }
    50% { opacity: 0.7; }
}

/* 下载中行：底部贴一条进度条（通过 CSS 变量 --download-progress 驱动宽度） */
:deep(.el-table__row.row-downloading) {
    position: relative;
}
:deep(.el-table__row.row-downloading)::after {
    content: '';
    position: absolute;
    left: 0;
    bottom: 0;
    height: 3px;
    width: var(--download-progress, 0%);
    background: var(--el-color-primary);
    transition: width 0.3s ease;
    z-index: 1;
    pointer-events: none;
}

.info-section {
    margin-top: 20px;
}

.info-list {
    margin: 8px 0 0 0;
    padding-left: 18px;
    line-height: 1.8;
    font-size: 13px;
}

.info-list code {
    background-color: var(--el-fill-color-light);
    padding: 1px 6px;
    border-radius: 4px;
    font-family: 'Menlo', 'Consolas', monospace;
    font-size: 12px;
}
</style>
