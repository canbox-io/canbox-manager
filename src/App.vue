<script setup>
import { useRouter, useRoute } from 'vue-router';
import { computed, onMounted, ref } from 'vue';
import { useSettingsStore } from '@/stores/settings';

const router = useRouter();
const route = useRoute();
const settingsStore = useSettingsStore();
const sidebarExpanded = ref(false);

const navItems = [
    { path: '/', emoji: '⊞', label: 'nav.apps' },
    { path: '/repos', emoji: '📁', label: 'nav.repos' },
    { path: '/settings', emoji: '⚙', label: 'nav.settings' },
    { path: '/about', emoji: 'ℹ', label: 'nav.about' }
];

const activeNav = computed(() => route.path);
const sidebarWidth = computed(() => sidebarExpanded.value ? '172px' : '64px');

function navigate(item) {
    router.push(item.path);
}

onMounted(() => {
    window.api?.manager?.appReady?.();
});
</script>

<template>
    <el-container class="app-container">
        <el-aside :width="sidebarWidth" class="app-sidebar" :class="{ expanded: sidebarExpanded }">
            <div class="sidebar-logo" @click="sidebarExpanded = !sidebarExpanded">
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
                    <span v-show="sidebarExpanded" class="nav-label">{{ $t(item.label) }}</span>
                </div>
            </nav>
            <div class="sidebar-footer">
                <div
                    class="sidebar-toggle"
                    :title="sidebarExpanded ? '收起菜单' : '展开菜单'"
                    @click="sidebarExpanded = !sidebarExpanded"
                >
                    <span class="sidebar-emoji sidebar-emoji--sm">{{ sidebarExpanded ? '◀' : '▶' }}</span>
                </div>
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
    transition: width 0.2s ease;
    -webkit-app-region: drag;
    overflow: hidden;
}

.app-sidebar.expanded {
    align-items: stretch;
}

.sidebar-logo {
    display: flex;
    justify-content: center;
    align-items: center;
    margin-bottom: 24px;
    color: var(--el-color-primary);
    cursor: pointer;
    -webkit-app-region: no-drag;
}

.sidebar-nav {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
}

.app-sidebar.expanded .sidebar-nav {
    align-items: stretch;
    padding: 0 8px;
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

.app-sidebar.expanded .nav-item {
    width: 100%;
    justify-content: flex-start;
    padding-left: 10px;
    gap: 10px;
}

/* 展开时 emoji 占固定宽度，保证文字对齐 */
.app-sidebar.expanded .sidebar-emoji {
    width: 22px;
    text-align: center;
    flex-shrink: 0;
}

.nav-item:hover {
    background-color: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
}

.nav-item.active {
    background-color: var(--el-color-primary-light-9);
    color: var(--el-color-primary);
}

.nav-label {
    font-size: 14px;
    white-space: nowrap;
}

.sidebar-footer {
    display: flex;
    justify-content: center;
    align-items: center;
    -webkit-app-region: no-drag;
}

.sidebar-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 36px;
    height: 36px;
    border-radius: 8px;
    cursor: pointer;
    color: var(--el-text-color-placeholder);
    transition: all 0.2s ease;
}

.sidebar-toggle:hover {
    background-color: var(--el-fill-color-light);
    color: var(--el-text-color-primary);
}

.app-main {
    padding: 0;
    overflow-y: auto;
    background-color: var(--el-bg-color-page);
}
</style>
