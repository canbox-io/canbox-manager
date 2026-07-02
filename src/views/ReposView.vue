<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import { useReposStore } from '@/stores/repos';
import notification from '@/utils/notification';

const { t } = useI18n();
const reposStore = useReposStore();

const showAddDialog = ref(false);
const addForm = ref({ url: '', name: '' });
const adding = ref(false);

onMounted(() => {
    reposStore.fetchRepos();
});

async function handleAdd() {
    if (!addForm.value.url.trim()) return;
    adding.value = true;
    try {
        const result = await reposStore.addRepo(
            addForm.value.url.trim(),
            { name: addForm.value.name.trim() || undefined }
        );
        if (result.success) {
            notification.success(t('repos.addSuccess'));
            showAddDialog.value = false;
            addForm.value = { url: '', name: '' };
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
        await reposStore.removeRepo(repo._id);
        notification.success(t('repos.removeSuccess'));
    } catch (e) {
        // 用户取消
    }
}

function formatTime(timestamp) {
    if (!timestamp) return t('repos.never');
    return new Date(timestamp).toLocaleString();
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

        <div v-else class="repos-grid">
            <el-card
                v-for="repo in reposStore.repos"
                :key="repo._id"
                class="repo-card"
                shadow="hover"
            >
                <div class="repo-info">
                    <div class="repo-icon">
                        <span class="icon-emoji">📁</span>
                    </div>
                    <div class="repo-meta">
                        <h3 class="repo-name">{{ repo.name || repo.url }}</h3>
                        <p class="repo-url">{{ repo.url }}</p>
                        <p class="repo-time">{{ $t('repos.lastSync') }}: {{ formatTime(repo.updatedAt) }}</p>
                    </div>
                </div>
                <div class="repo-actions">
                    <el-button size="small" @click="() => {}">
                        ↻ {{ $t('repos.sync') }}
                    </el-button>
                    <el-button size="small" type="danger" plain @click="handleRemove(repo)">
                        🗑 {{ $t('repos.remove') }}
                    </el-button>
                </div>
            </el-card>
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
                    />
                </el-form-item>
                <el-form-item :label="$t('repos.name')">
                    <el-input
                        v-model="addForm.name"
                        :placeholder="$t('repos.namePlaceholder')"
                        clearable
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

.repos-grid {
    display: flex;
    flex-direction: column;
    gap: 12px;
}

.repo-card :deep(.el-card__body) {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 20px;
}

.repo-info {
    display: flex;
    align-items: center;
    gap: 16px;
    flex: 1;
    min-width: 0;
}

.repo-icon {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    background: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
}

.repo-meta {
    min-width: 0;
}

.repo-name {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 4px;
    color: var(--el-text-color-primary);
}

.repo-url {
    font-size: 12px;
    color: var(--el-color-primary);
    margin: 0 0 4px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.repo-time {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
    margin: 0;
}

.repo-actions {
    display: flex;
    align-items: center;
    gap: 8px;
    flex-shrink: 0;
}
</style>
