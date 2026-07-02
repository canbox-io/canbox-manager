<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { useAppsStore } from '@/stores/apps';
import notification from '@/utils/notification';

const { t } = useI18n();
const appsStore = useAppsStore();
const importing = ref(false);

onMounted(() => {
    appsStore.fetchApps();
});

async function handleImport() {
    try {
        const result = await window.api.dialog.showOpenDialog({
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
        const result = await appsStore.launchApp(app.id);
        if (!result.success) {
            notification.error(result.error || t('apps.launchFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('apps.launchFailed'));
    }
}

async function handleRemove(app) {
    try {
        await ElMessageBox.confirm(
            t('apps.removeConfirm'),
            t('apps.remove'),
            { type: 'warning' }
        );
        await appsStore.removeApp(app.id);
        notification.success(t('apps.removeSuccess'));
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
        const result = await appsStore.clearAppData(app.id);
        if (result.success) {
            notification.success(t('apps.clearDataSuccess'));
        }
    } catch (e) {
        // 用户取消
    }
}

function isRunning(appId) {
    return appsStore.runningApps.has(appId);
}
</script>

<template>
    <div class="view-container">
        <div class="view-header">
            <h2 class="view-title">{{ $t('apps.title') }}</h2>
            <el-button type="primary" @click="handleImport" :loading="importing">
                📦 {{ $t('apps.import') }}
            </el-button>
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

        <div v-else class="apps-grid">
            <el-card
                v-for="app in appsStore.apps"
                :key="app.id"
                class="app-card"
                shadow="hover"
            >
                <div class="app-info">
                    <div class="app-icon">
                        <span class="icon-emoji">📦</span>
                    </div>
                    <div class="app-meta">
                        <h3 class="app-name">{{ app.name }}</h3>
                        <p class="app-version">v{{ app.version }}</p>
                        <p v-if="app.description" class="app-desc">{{ app.description }}</p>
                    </div>
                </div>
                <div class="app-actions">
                    <el-tag
                        v-if="isRunning(app.id)"
                        type="success"
                        size="small"
                        class="running-tag"
                    >
                        {{ $t('apps.running') }}
                    </el-tag>
                    <el-button size="small" @click="handleLaunch(app)">
                        ▶️ {{ $t('apps.launch') }}
                    </el-button>
                    <el-button size="small" type="danger" plain @click="handleRemove(app)">
                        🗑 {{ $t('apps.remove') }}
                    </el-button>
                    <el-button size="small" @click="handleClearData(app)">
                        🧹 {{ $t('apps.clearData') }}
                    </el-button>
                </div>
            </el-card>
        </div>
    </div>
</template>

<style scoped>
.view-container {
    padding: 24px;
    height: 100%;
    box-sizing: border-box;
}

.view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 24px;
}

.view-title {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
    color: var(--el-text-color-primary);
}

.empty-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
}

.empty-hint {
    color: var(--el-text-color-secondary);
    font-size: 14px;
}

.loading-state {
    display: flex;
    justify-content: center;
    align-items: center;
    min-height: 400px;
    color: var(--el-color-primary);
}

.apps-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.app-card :deep(.el-card__body) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
}

.app-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
}

.app-icon {
    width: 52px;
    height: 52px;
    border-radius: 12px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.app-meta {
    min-width: 0;
}

.app-name {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 2px;
    color: var(--el-text-color-primary);
}

.app-version {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin: 0 0 4px;
}

.app-desc {
    font-size: 13px;
    color: var(--el-text-color-secondary);
    margin: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.app-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}

.running-tag {
    margin-right: 4px;
}
</style>
