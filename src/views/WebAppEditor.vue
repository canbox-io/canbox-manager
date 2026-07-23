<script setup>
/**
 * 网页应用创建/编辑对话框
 *
 * 用法：
 *   <WebAppEditor v-model:visible="show" mode="create" @success="onSuccess" />
 *   <WebAppEditor v-model:visible="show" mode="edit" :edit-app="app" @success="onSuccess" />
 *
 * 创建模式：表单为空，提交时调 createWebApp
 * 编辑模式：表单预填充 editApp 的 canbox.webApp 配置，提交时调 editWebApp
 *
 * PWA manifest 抓取：输入 URL 后点"自动抓取"按钮，主进程 fetch manifest 预填表单。
 * 失败时静默回退手填模式（仅提示一下，不阻塞）。
 */
import { ref, reactive, watch, computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { useAppsStore } from '@/stores/apps';
import notification from '@/utils/notification';

const props = defineProps({
    visible: { type: Boolean, default: false },
    mode: { type: String, default: 'create' }, // 'create' | 'edit'
    editApp: { type: Object, default: null } // 编辑模式传入的 app 对象
});

const emit = defineEmits(['update:visible', 'success']);

const { t } = useI18n();
const appsStore = useAppsStore();

const dialogVisible = computed({
    get: () => props.visible,
    set: (val) => emit('update:visible', val)
});

// 表单状态
const form = reactive({
    url: '',
    name: '',
    logo: '', // base64 data URI
    width: 1280,
    height: 800,
    menuBar: true,
    // PWA 元数据（仅用于生成 package.json，用户不可见）
    isPwa: false,
    manifestUrl: '',
    themeColor: '',
    bgColor: ''
});

const fetching = ref(false);
const submitting = ref(false);
const userEditedName = ref(false);

// URL → 英文标识提取
function extractDomainKeyword(urlString) {
    if (!urlString) return null;
    try {
        const u = new URL(urlString);
        const hostname = u.hostname;
        const parts = hostname.split('.').filter(p => p);
        parts.pop();
        const commonPrefixes = ['www', 'm', 'mobile', 'app', 'api', 'docs', 'blog', 'shop'];
        const meaningfulParts = parts.filter(p => !commonPrefixes.includes(p.toLowerCase()));
        if (meaningfulParts.length === 0) return null;
        const mainDomain = meaningfulParts[0];
        return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch (e) {
        return null;
    }
}

// 全中文检测
function isAllChinese(str) {
    if (!str) return false;
    const clean = str.replace(/[\s\u3000-\u303f\uff00-\uffef]/g, '');
    if (!clean) return false;
    return /^[\u4e00-\u9fff]+$/.test(clean);
}

// 自动追加域名关键词到名称
function autoAppendDomainKeyword() {
    if (!form.url || userEditedName.value) return;
    if (!isAllChinese(form.name)) return;
    const keyword = extractDomainKeyword(form.url);
    if (!keyword) return;
    form.name = form.name + keyword;
}

// 名称输入框手动编辑检测
function onNameInput() {
    userEditedName.value = true;
}

// URL 变化时尝试自动追加
watch(() => form.url, () => {
    autoAppendDomainKeyword();
});

// 重置表单
function resetForm() {
    form.url = '';
    form.name = '';
    form.logo = '';
    form.width = 1280;
    form.height = 800;
    form.menuBar = true;
    form.isPwa = false;
    form.manifestUrl = '';
    form.themeColor = '';
    form.bgColor = '';
    userEditedName.value = false;
}

// 编辑模式：从 editApp 读取已存配置预填充
function loadFromEditApp() {
    if (!props.editApp) return;
    // 从 app 对象只能拿到显示信息，详细配置需要从 package.json 读
    // 但 manager.apps.list 返回的 app 对象没有 canbox.webApp 细节
    // 这里依赖父组件传入完整的 editApp（包含 webAppConfig）
    const cfg = props.editApp.webAppConfig || {};
    form.url = cfg.url || '';
    form.name = props.editApp.name || '';
    form.logo = props.editApp.logo || '';
    form.width = cfg.width || 1280;
    form.height = cfg.height || 800;
    form.menuBar = cfg.menuBar !== false;
    form.isPwa = !!cfg.isPwa;
    form.manifestUrl = cfg.manifestUrl || '';
    form.themeColor = cfg.themeColor || '';
    form.bgColor = cfg.backgroundColor || '';
    userEditedName.value = false;
    autoAppendDomainKeyword();
}

watch(() => props.visible, (val) => {
    if (val) {
        resetForm();
        if (props.mode === 'edit') {
            loadFromEditApp();
        }
    }
});

// 自动抓取 manifest
async function handleFetchManifest() {
    if (!form.url) {
        notification.warning(t('webApp.urlRequired'));
        return;
    }
    // URL 规范化：补全协议
    let url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
        url = 'https://' + url;
        form.url = url;
    }

    fetching.value = true;
    try {
        const result = await appsStore.fetchManifest(url);
        if (result.success) {
            // 预填表单
            if (result.name) {
                form.name = result.name;
                userEditedName.value = false;
                autoAppendDomainKeyword();
            }
            if (result.icon) form.logo = result.icon;
            if (result.backgroundColor) form.bgColor = result.backgroundColor;
            if (result.themeColor) form.themeColor = result.themeColor;
            // 用重定向后的最终 URL 替换
            if (result.finalUrl) form.url = result.finalUrl;
            form.isPwa = true;
            form.manifestUrl = result.manifestUrl || '';
            notification.success(t('webApp.fetchSuccess'));
        } else {
            // 静默回退：仅提示，不阻塞
            form.isPwa = false;
            form.manifestUrl = '';
            notification.info(t('webApp.fetchFailed'));
        }
    } catch (e) {
        form.isPwa = false;
        form.manifestUrl = '';
        notification.info(t('webApp.fetchFailed'));
    } finally {
        fetching.value = false;
    }
}

// URL 失焦时自动补全协议
function handleUrlBlur() {
    if (!form.url) return;
    let url = form.url.trim();
    if (!/^https?:\/\//i.test(url)) {
        form.url = 'https://' + url;
    }
}

// 提交
async function handleSubmit() {
    if (!form.url) {
        notification.warning(t('webApp.urlRequired'));
        return;
    }
    if (!form.name) {
        notification.warning(t('webApp.nameRequired'));
        return;
    }

    submitting.value = true;
    try {
        const config = {
            url: form.url.trim(),
            name: form.name.trim(),
            logo: form.logo,
            width: Number(form.width) || 1280,
            height: Number(form.height) || 800,
            menuBar: form.menuBar,
            isPwa: form.isPwa,
            manifestUrl: form.manifestUrl,
            themeColor: form.themeColor,
            bgColor: form.bgColor
        };

        let result;
        if (props.mode === 'edit' && props.editApp) {
            result = await appsStore.editWebApp(props.editApp.appId, config);
        } else {
            result = await appsStore.createWebApp(config);
        }

        if (result.success) {
            notification.success(
                props.mode === 'edit' ? t('webApp.editSuccess') : t('webApp.createSuccess')
            );
            dialogVisible.value = false;
            emit('success', result);
        } else {
            notification.error(result.error || t('webApp.submitFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('webApp.submitFailed'));
    } finally {
        submitting.value = false;
    }
}
</script>

<template>
    <el-dialog
        v-model="dialogVisible"
        :title="mode === 'edit' ? $t('webApp.editTitle') : $t('webApp.createTitle')"
        width="560px"
        :close-on-click-modal="false"
        destroy-on-close
    >
        <el-form :model="form" label-width="100px" label-position="right">
            <el-form-item :label="$t('webApp.url')">
                <div style="display: flex; gap: 8px; width: 100%;">
                    <el-input
                        v-model="form.url"
                        placeholder="https://example.com"
                        @blur="handleUrlBlur"
                        @keyup.enter="handleFetchManifest"
                    />
                    <el-button :loading="fetching" @click="handleFetchManifest">
                        {{ $t('webApp.fetch') }}
                    </el-button>
                </div>
            </el-form-item>

            <el-form-item :label="$t('webApp.name')">
                <el-input v-model="form.name" :placeholder="$t('webApp.namePlaceholder')" @input="onNameInput" />
            </el-form-item>

            <el-form-item :label="$t('webApp.logo')">
                <div class="logo-preview-row">
                    <div class="logo-preview">
                        <img v-if="form.logo" :src="form.logo" alt="logo" />
                        <span v-else class="logo-placeholder">🌐</span>
                    </div>
                    <span class="logo-hint">{{ $t('webApp.logoHint') }}</span>
                </div>
            </el-form-item>

            <el-form-item :label="$t('webApp.width')">
                <el-input-number v-model="form.width" :min="320" :max="3840" :step="80" />
            </el-form-item>

            <el-form-item :label="$t('webApp.height')">
                <el-input-number v-model="form.height" :min="240" :max="2160" :step="60" />
            </el-form-item>

            <el-form-item :label="$t('webApp.menuBar')">
                <el-switch v-model="form.menuBar" />
                <span class="form-tip">{{ $t('webApp.menuBarHint') }}</span>
            </el-form-item>
        </el-form>

        <template #footer>
            <el-button @click="dialogVisible = false">{{ $t('common.cancel') }}</el-button>
            <el-button type="primary" :loading="submitting" @click="handleSubmit">
                {{ $t('common.confirm') }}
            </el-button>
        </template>
    </el-dialog>
</template>

<style scoped>
.logo-preview-row {
    display: flex;
    align-items: center;
    gap: 12px;
}
.logo-preview {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    border: 1px solid var(--el-border-color-light);
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background: var(--el-fill-color-light);
}
.logo-preview img {
    width: 100%;
    height: 100%;
    object-fit: cover;
}
.logo-placeholder {
    font-size: 24px;
}
.logo-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
.form-tip {
    margin-left: 12px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}
</style>
