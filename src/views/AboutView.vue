<script setup>
import { onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';

const { t } = useI18n();

const platformInfo = ref(null);
const coreVersion = ref('');

onMounted(async () => {
    try {
        platformInfo.value = await window.api.misc.getPlatformInfo();
        coreVersion.value = await window.api.misc.getCoreVersion();
    } catch (e) {
        // 降级
    }
});

const infoItems = [
    { key: 'coreVersion', value: coreVersion, i18n: 'about.coreVersion' },
    { key: 'platform', value: () => platformInfo.value ? `${platformInfo.value.platform} (${platformInfo.value.arch})` : '-', i18n: 'about.platform' },
    { key: 'electronVersion', value: () => platformInfo.value ? `Electron ${platformInfo.value.electronVersion}` : '-', i18n: 'about.electronVersion' },
    { key: 'chromeVersion', value: () => platformInfo.value ? `Chromium ${platformInfo.value.chromeVersion}` : '-', i18n: 'about.chromeVersion' },
    { key: 'nodeVersion', value: () => platformInfo.value ? `Node.js ${platformInfo.value.nodeVersion}` : '-', i18n: 'about.nodeVersion' }
];
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
                    <span class="hero-emoji">📦</span>
                </div>
                <h1 class="hero-name">{{ $t('app.name') }}</h1>
                <p class="hero-version">v{{ $t('app.version') }}</p>
            </div>

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
                        <span class="info-value">lizl6</span>
                    </div>
                </div>
            </el-card>

            <!-- 链接 -->
            <div class="about-links">
                <el-button @click="window.api.misc.openUrl('https://github.com/lizl6/canbox')">
                    🔗 {{ $t('about.homepage') }}
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

.about-content {
    max-width: 480px;
}

.about-hero {
    text-align: center;
    padding: 32px 0;
}

.hero-icon {
    color: var(--el-color-primary);
    margin-bottom: 16px;
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
</style>
