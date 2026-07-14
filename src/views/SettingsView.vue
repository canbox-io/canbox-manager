<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { ElMessageBox } from 'element-plus';
import notification from '@/utils/notification';

const { t, locale } = useI18n();
const settingsStore = useSettingsStore();

const zoomFactor = ref(1.0);

const languages = [
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'en-US', label: 'English (US)' }
];

onMounted(async () => {
    await settingsStore.fetchSettings();
    // 同步持久化的语言到 i18n（修复重启后 store 与 i18n 不一致）
    const savedLang = settingsStore.settings.language;
    if (savedLang && savedLang !== locale.value) {
        locale.value = savedLang;
    }
    // 同步写 localStorage 缓存（保证 main.js 启动时读到的 cache 与 source 一致）
    try { localStorage.setItem('canbox.locale', savedLang); } catch (e) {}
    const result = await window.api.manager.zoomGet();
    if (result.success) zoomFactor.value = result.factor;
});

async function handleLanguageChange(value) {
    await settingsStore.setSetting('language', value);
    locale.value = value;
    try { localStorage.setItem('canbox.locale', value); } catch (e) {}
}

async function handleToggle(key) {
    const newValue = !settingsStore.settings[key];
    await settingsStore.setSetting(key, newValue);
}

async function handleZoomChange(value) {
    zoomFactor.value = value;
    await window.api.manager.zoomSet(value);
}

async function handleZoomReset() {
    zoomFactor.value = 1.0;
    await window.api.manager.zoomReset();
}

// 监听主进程推送的 zoom 变化（快捷键调节后同步 UI）
window.api.manager.onZoomChanged((factor) => {
    zoomFactor.value = factor;
});

async function handleReset() {
    try {
        await ElMessageBox.confirm(
            t('settings.resetConfirm'),
            t('settings.resetSettings'),
            { type: 'warning' }
        );
        const defaults = {
            language: 'zh-CN',
            autoStart: false,
            fontSize: 14,
            logRetention: 30
        };
        for (const [key, value] of Object.entries(defaults)) {
            await settingsStore.setSetting(key, value);
        }
        locale.value = 'zh-CN';
        try { localStorage.setItem('canbox.locale', 'zh-CN'); } catch (e) {}
        await handleZoomReset();
        notification.success('Settings reset to defaults');
    } catch (e) {
        // 用户取消
    }
}
</script>

<template>
    <div class="view-container">
        <div class="view-header">
            <h2 class="view-title">{{ $t('settings.title') }}</h2>
        </div>

        <div class="settings-sections">
            <!-- 通用设置 -->
            <el-card class="settings-section" shadow="never">
                <template #header>
                    <span class="section-title">{{ $t('settings.general') }}</span>
                </template>

                <!-- 语言 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">{{ $t('settings.language') }}</span>
                        <span class="label-hint">{{ $t('settings.languageHint') }}</span>
                    </div>
                    <el-select
                        :model-value="settingsStore.settings.language"
                        @change="handleLanguageChange"
                        size="default"
                        style="width: 180px"
                    >
                        <el-option
                            v-for="lang in languages"
                            :key="lang.value"
                            :label="lang.label"
                            :value="lang.value"
                        />
                    </el-select>
                </div>

                <!-- 开机自启 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">{{ $t('settings.autoStart') }}</span>
                        <span class="label-hint">{{ $t('settings.autoStartHint') }}</span>
                    </div>
                    <el-switch
                        :model-value="settingsStore.settings.autoStart"
                        @change="handleToggle('autoStart')"
                    />
                </div>

                <!-- 字体大小 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">{{ $t('settings.fontSize') }}</span>
                    </div>
                    <el-input-number
                        :model-value="settingsStore.settings.fontSize"
                        @change="(val) => settingsStore.setSetting('fontSize', val)"
                        :min="10"
                        :max="24"
                        size="default"
                    />
                </div>

                <!-- 缩放比例 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">{{ $t('settings.zoom') }}</span>
                        <span class="label-hint">{{ $t('settings.zoomHint') }}</span>
                    </div>
                    <div class="zoom-control">
                        <el-button size="small" @click="handleZoomChange(Math.max(0.5, zoomFactor - 0.1))">-</el-button>
                        <span class="zoom-value">{{ zoomFactor.toFixed(1) }}x</span>
                        <el-button size="small" @click="handleZoomChange(Math.min(2.0, zoomFactor + 0.1))">+</el-button>
                        <el-button size="small" plain @click="handleZoomReset">{{ $t('settings.zoomReset') }}</el-button>
                    </div>
                </div>

                <!-- 日志保留 -->
                <div class="setting-item">
                    <div class="setting-label">
                        <span class="label-text">{{ $t('settings.logRetention') }}</span>
                    </div>
                    <el-input-number
                        :model-value="settingsStore.settings.logRetention"
                        @change="(val) => settingsStore.setSetting('logRetention', val)"
                        :min="1"
                        :max="365"
                        size="default"
                    />
                </div>
            </el-card>

            <!-- 重置 -->
            <div class="settings-footer">
                <el-button type="danger" plain @click="handleReset">
                    {{ $t('settings.resetSettings') }}
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

.settings-sections {
    flex: 1;
    padding: 24px;
    overflow-y: auto;
}

.settings-section {
    margin-bottom: 20px;
}

.section-title {
    font-size: 17px;
    font-weight: 600;
}

.setting-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 14px 0;
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.setting-item:last-child {
    border-bottom: none;
}

.setting-label {
    display: flex;
    flex-direction: column;
    gap: 2px;
}

.label-text {
    font-size: 15px;
    color: var(--el-text-color-primary);
}

.label-hint {
    font-size: 13px;
    color: var(--el-text-color-placeholder);
}

.settings-footer {
    margin-top: 20px;
}

.zoom-control {
    display: flex;
    align-items: center;
    gap: 8px;
}

.zoom-value {
    min-width: 44px;
    text-align: center;
    font-size: 15px;
    color: var(--el-text-color-primary);
}
</style>
