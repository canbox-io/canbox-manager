<script setup>
import { computed, onMounted, ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { useRouter } from 'vue-router';
import MarkdownIt from 'markdown-it';
import { useAppsStore } from '@/stores/apps';

// 升级后首次启动的"更新内容"弹窗。
// 数据来自 manager 打包的 CHANGELOG.md（唯一事实源），lastSeenVersion 由主进程维护。
// 若同时存在可升级外壳的网页应用，弹窗内直接给出前往升级的入口。

const { t, locale } = useI18n();
const router = useRouter();
const appsStore = useAppsStore();

const visible = ref(false);
const currentVersion = ref('');
const sections = ref([]);
const md = new MarkdownIt({ html: false, linkify: true, breaks: true });

// CHANGELOG 每个条目为"中文一行、英文一行"，用是否含 CJK 判定所属语言
const CJK = /[\u4e00-\u9fa5]/;
const isZh = computed(() => String(locale.value).toLowerCase().startsWith('zh'));

function localizeBody(body) {
    const out = [];
    for (const line of body.split('\n')) {
        if (!line.trim()) {
            out.push('');
            continue;
        }
        const hasCJK = CJK.test(line);
        if (hasCJK === isZh.value) {
            out.push(line);
        } else if (/^#{1,6}\s/.test(line)) {
            // 分类标题中英并存（如 "### feat | 新功能 / Features"），非中文时取斜杠后的英文
            out.push(isZh.value ? line : line.replace(/^(#{1,6}\s*)(.*?)\s*\/\s*(.+)$/, '$1$3'));
        }
    }
    return out.join('\n');
}

const renderedSections = computed(() => sections.value.map(s => ({
    ...s,
    html: md.render(localizeBody(s.body || ''))
})));

const shellCount = computed(() => appsStore.shellUpgradableCount);

onMounted(async () => {
    try {
        const result = await window.api.manager.whatsNewGet();
        if (!result.success || !result.show) return;
        currentVersion.value = result.currentVersion;
        sections.value = result.sections || [];
        if (!sections.value.length) return;
        // 顺带拉取应用列表，用于判断是否有网页应用可升级外壳
        appsStore.fetchApps({ silent: true }).catch(() => {});
        visible.value = true;
    } catch (e) {
        // 更新说明属于增强信息，失败时不打扰用户
    }
});

async function ack() {
    try {
        await window.api.manager.whatsNewAck(currentVersion.value);
    } catch (e) {
        // 忽略：下次启动会再提示一次
    }
}

async function close() {
    visible.value = false;
    await ack();
}

async function goShellUpgrade() {
    visible.value = false;
    await ack();
    router.push('/');
}
</script>

<template>
    <el-dialog
        v-model="visible"
        class="whats-new-dialog"
        :title="$t('whatsNew.title')"
        width="560px"
        @close="ack"
    >
        <p class="whats-new-subtitle">{{ $t('whatsNew.subtitle', { version: currentVersion }) }}</p>

        <div class="whats-new-sections">
            <section v-for="item in renderedSections" :key="item.version" class="whats-new-section">
                <h3 class="whats-new-version">
                    <span>v{{ item.version }}</span>
                    <span v-if="item.date" class="whats-new-date">{{ item.date }}</span>
                </h3>
                <div class="whats-new-body" v-html="item.html"></div>
            </section>
        </div>

        <div v-if="shellCount > 0" class="whats-new-shell">
            <div class="whats-new-shell-text">{{ $t('whatsNew.shellHint', { count: shellCount }) }}</div>
            <el-button type="primary" size="small" @click="goShellUpgrade">
                {{ $t('whatsNew.goShellUpgrade', { count: shellCount }) }}
            </el-button>
        </div>

        <template #footer>
            <el-button type="primary" @click="close">{{ $t('whatsNew.dismiss') }}</el-button>
        </template>
    </el-dialog>
</template>

<!-- el-dialog teleport 到 body，scoped 样式无法命中，使用类名前缀限定作用范围 -->
<style>
.whats-new-dialog .whats-new-subtitle {
    margin: 0 0 12px;
    font-size: 13px;
    color: var(--el-text-color-regular);
}
.whats-new-dialog .whats-new-sections {
    max-height: 420px;
    overflow-y: auto;
    padding-right: 4px;
}
.whats-new-dialog .whats-new-section + .whats-new-section {
    margin-top: 14px;
    padding-top: 12px;
    border-top: 1px solid var(--el-border-color-lighter);
}
.whats-new-dialog .whats-new-version {
    display: flex;
    align-items: baseline;
    gap: 8px;
    margin: 0 0 6px;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-color-primary-dark-2);
}
.whats-new-dialog .whats-new-date {
    font-size: 12px;
    font-weight: 400;
    color: var(--el-text-color-secondary);
}
.whats-new-dialog .whats-new-body {
    font-size: 13px;
    line-height: 1.7;
    color: var(--el-text-color-regular);
}
.whats-new-dialog .whats-new-body h3 {
    margin: 10px 0 4px;
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}
.whats-new-dialog .whats-new-body ul {
    margin: 4px 0;
    padding-left: 18px;
}
.whats-new-dialog .whats-new-body p {
    margin: 4px 0;
}
.whats-new-dialog .whats-new-shell {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    margin-top: 14px;
    padding: 10px 12px;
    background: var(--el-color-primary-light-9);
    border: 1px solid var(--el-color-primary-light-7);
    border-radius: 8px;
}
.whats-new-dialog .whats-new-shell-text {
    font-size: 13px;
    color: var(--el-text-color-regular);
}
</style>
