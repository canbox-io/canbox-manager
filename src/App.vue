<script setup>
import { useRouter, useRoute } from 'vue-router';
import { computed, onMounted } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();

const navItems = [
    { path: '/', emoji: '⊞', label: 'nav.apps' },
    { path: '/repos', emoji: '📁', label: 'nav.repos' },
    { path: '/settings', emoji: '⚙', label: 'nav.settings' },
    { path: '/about', emoji: 'ℹ', label: 'nav.about' }
];

const activeNav = computed(() => route.path);

function navigate(item) {
    router.push(item.path);
}

onMounted(() => {
    window.api?.manager?.appReady?.();
});
</script>

<template>
    <el-container class="app-container">
        <el-aside width="64px" class="app-sidebar">
            <div class="sidebar-logo">
                <span class="sidebar-emoji sidebar-emoji--lg">📦</span>
            </div>
            <nav class="sidebar-nav">
                <div
                    v-for="item in navItems"
                    :key="item.path"
                    class="nav-item"
                    :class="{ active: activeNav === item.path }"
                    :title="$t(item.label)"
                    @click="navigate(item)"
                >
                    <span class="sidebar-emoji">{{ item.emoji }}</span>
                </div>
            </nav>
            <div class="sidebar-footer">
                <span class="sidebar-emoji sidebar-emoji--sm">👤</span>
            </div>
        </el-aside>

        <el-main class="app-main">
            <router-view />
        </el-main>
    </el-container>
</template>

<style scoped>
.app-container {
    height: 100vh;
    overflow: hidden;
}

.app-sidebar {
    display: flex;
    flex-direction: column;
    align-items: center;
    background-color: var(--el-bg-color);
    border-right: 1px solid var(--el-border-color-light);
    padding-top: 12px;
    padding-bottom: 12px;
    -webkit-app-region: drag;
}

.sidebar-logo {
    margin-bottom: 24px;
    color: var(--el-color-primary);
}

.sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.nav-item {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 12px;
    color: var(--el-text-color-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
    -webkit-app-region: no-drag;
}

.nav-item:hover {
    background-color: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
}

.nav-item.active {
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
}

.sidebar-footer {
    -webkit-app-region: no-drag;
    color: var(--el-text-color-placeholder);
}

.app-main {
    padding: 0;
    overflow-y: auto;
    background-color: var(--el-bg-color-page);
}
</style>
