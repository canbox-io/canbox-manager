<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useSettingsStore } from '@/stores/settings';
import { ElMessageBox } from 'element-plus';
import notification from '@/utils/notification';

const { t, locale } = useI18n();
const settingsStore = useSettingsStore();

const languages = [
    { value: 'zh-CN', label: '中文（简体）' },
    { value: 'en-US', label: 'English (US)' }
];

onMounted(() => {
    settingsStore.fetchSettings();
});

async function handleLanguageChange(value) {
    await settingsStore.setSetting('language', value);
    locale.value = value;
}

async function handleToggle(key) {
    const newValue = !settingsStore.settings[key];
    await settingsStore.setSetting(key, newValue);
}

async function handleReset() {
    try {
        await ElMessageBox.confirm(
            t('settings.resetConfirm'),
            t('settings.resetSettings'),
            { type: 'warning' }
        );
        // 重置为默认值
        const defaults = {
            language: 'zh-CN',
            autoStart: false,
            fontSize: 14,
            zoomFactor: 1.0,
            logRetention: 30
        };
        for (const [key, value] of Object.entries(defaults)) {
            await settingsStore.setSetting(key, value);
        }
        locale.value = 'zh-CN';
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
    padding: 24px;
    height: 100%;
    box-sizing: border-box;
}

.view-header {
    margin-bottom: 24px;
}

.view-title {
    font-size: 22px;
    font-weight: 600;
    margin: 0;
    color: var(--el-text-color-primary);
}

.settings-sections {
    max-width: 640px;
}

.settings-section {
    margin-bottom: 20px;
}

.section-title {
    font-size: 16px;
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
    font-size: 14px;
    color: var(--el-text-color-primary);
}

.label-hint {
    font-size: 12px;
    color: var(--el-text-color-placeholder);
}

.settings-footer {
    margin-top: 20px;
}
</style>
