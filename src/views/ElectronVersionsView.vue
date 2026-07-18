<script setup>
import { ref, onMounted, computed } from 'vue';
import { ElMessage, ElMessageBox } from 'element-plus';
import notification from '@/utils/notification';
import { useElectronStore } from '@/stores/electron';

const electronStore = useElectronStore();

const loading = ref(false);
const versions = ref([]);

// 下载状态从全局 store 读取（跨页面共享，切换路由不丢失）
const downloadingVersion = computed(() => electronStore.downloadingVersion);
const downloadProgress = computed(() => electronStore.downloadProgress);

const loadVersions = async () => {
    loading.value = true;
    try {
        const res = await window.api.manager.electronListAllowed();
        if (res.success) {
            versions.value = res.versions;
        } else {
            notification.error('加载 Electron 版本失败');
        }
    } catch (e) {
        notification.error('加载版本列表失败: ' + e.message);
    } finally {
        loading.value = false;
    }
};

const builtinVersion = computed(() => versions.value.find(v => v.source === 'builtin'));

const handleDownload = async (version) => {
    try {
        await ElMessageBox.confirm(
            `将下载 Electron ${version} 到用户数据目录，用于运行声明该版本的 APP。是否继续？`,
            '下载 Electron 版本',
            { confirmButtonText: '下载', cancelButtonText: '取消', type: 'info' }
        );
    } catch (e) {
        return;
    }
    try {
        const res = await electronStore.downloadElectron(version);
        if (res.success) {
            notification.success(`Electron ${version} 下载安装成功`);
            await loadVersions();
        } else {
            notification.error(`Electron ${version} 下载失败：${res.error}`, '下载失败');
        }
    } catch (e) {
        notification.error(`Electron ${version} 下载异常：${e.message}`, '下载失败');
    }
};

const handleCancelDownload = async () => {
    try {
        await electronStore.cancelDownload();
        notification.success('已取消下载');
    } catch (e) {
        notification.error('取消失败: ' + e.message);
    }
};

const handleDelete = async (version) => {
    try {
        await ElMessageBox.confirm(
            `确认删除已下载的 Electron ${version}？使用该版本的 APP 将无法启动，需重新下载。`,
            '删除版本',
            { confirmButtonText: '删除', cancelButtonText: '取消', type: 'warning' }
        );
    } catch (e) {
        return;
    }
    try {
        const res = await window.api.manager.electronDelete(version);
        if (res.success) {
            notification.success(`已删除 Electron ${version}`);
            await loadVersions();
        } else {
            notification.error('删除失败: ' + res.error);
        }
    } catch (e) {
        notification.error('删除异常: ' + e.message);
    }
};

const sourceLabel = (source) => {
    if (source === 'builtin') return '内置';
    if (source === 'downloaded') return '已下载';
    return '未安装';
};

const sourceType = (source) => {
    if (source === 'builtin') return 'success';
    if (source === 'downloaded') return 'primary';
    return 'info';
};

onMounted(() => {
    loadVersions();
});
</script>

<template>
    <div class="electron-versions-view">
        <div class="page-header">
            <div>
                <h2 class="page-title">Electron 版本管理</h2>
                <p class="page-desc">
                    管理 APP 运行所需的 Electron 版本。内置版本由安装包提供，其他版本需在线下载。
                    APP 通过 <code>.canbox-app</code> 声明所需版本，启动时自动选择。
                </p>
            </div>
            <el-button :icon="'Refresh'" :loading="loading" @click="loadVersions">刷新</el-button>
        </div>

        <el-card v-loading="loading" shadow="never">
            <el-table :data="versions" style="width: 100%">
                <el-table-column label="版本号" prop="version" width="140">
                    <template #default="{ row }">
                        <span class="version-cell">Electron {{ row.version }}</span>
                    </template>
                </el-table-column>
                <el-table-column label="状态" width="120">
                    <template #default="{ row }">
                        <el-tag :type="sourceType(row.source)" size="small">
                            {{ sourceLabel(row.source) }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="平台支持" width="120">
                    <template #default="{ row }">
                        <el-tag :type="row.supported ? 'success' : 'danger'" size="small" effect="plain">
                            {{ row.supported ? '当前平台' : '不支持' }}
                        </el-tag>
                    </template>
                </el-table-column>
                <el-table-column label="下载进度">
                    <template #default="{ row }">
                        <el-progress
                            v-if="downloadingVersion === row.version"
                            :percentage="downloadProgress || 0"
                            :stroke-width="10"
                            status="success"
                        />
                        <span v-else-if="row.source === 'builtin'" class="hint-text">安装包内置，无需下载</span>
                        <span v-else-if="row.source === 'downloaded'" class="hint-text">已就绪</span>
                        <span v-else class="hint-text">未安装</span>
                    </template>
                </el-table-column>
                <el-table-column label="操作" width="220" align="right">
                    <template #default="{ row }">
                        <template v-if="downloadingVersion === row.version">
                            <el-button size="small" type="warning" plain @click="handleCancelDownload">取消</el-button>
                        </template>
                        <template v-else-if="row.source === 'downloaded'">
                            <el-button
                                size="small"
                                type="danger"
                                plain
                                :disabled="!row.supported"
                                @click="handleDelete(row.version)"
                            >删除</el-button>
                        </template>
                        <template v-else-if="row.source === null && row.supported">
                            <el-button
                                size="small"
                                type="primary"
                                @click="handleDownload(row.version)"
                            >下载</el-button>
                        </template>
                    </template>
                </el-table-column>
            </el-table>
        </el-card>

        <div class="info-section">
            <el-alert type="info" :closable="false" show-icon>
                <template #title>
                    <span>说明</span>
                </template>
                <ul class="info-list">
                    <li>内置版本（builtin）：安装包自带，仅一个，随 Canbox 升级而变更</li>
                    <li>下载版本（downloaded）：用户在线下载，存于用户数据目录 <code>runtime/electron-{version}/</code></li>
                    <li>APP 在 <code>.canbox-app</code> 中声明 <code>electron.range</code>，启动时按范围选择最高已装版本</li>
                    <li>删除内置版本不可用，只能删除下载版本</li>
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
