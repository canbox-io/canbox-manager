import { defineStore } from 'pinia';
import { computed, ref } from 'vue';

export const useAppsStore = defineStore('apps', () => {
    const apps = ref([]);
    const loading = ref(false);
    // 分类筛选（'' 表示全部分类），提升到 store 以在路由切换后保持状态
    const categoryFilter = ref('');

    function setCategory(c) {
        categoryFilter.value = c;
    }

    // silent=true 时不进入 loading 状态，避免列表被卸载重建导致滚动位置丢失
    async function fetchApps({ silent = false } = {}) {
        if (!silent || apps.value.length === 0) {
            loading.value = true;
        }
        try {
            apps.value = await window.api.manager.appsList();
        } finally {
            loading.value = false;
        }
    }

    async function importApp(appPath) {
        const result = await window.api.manager.appsImport(appPath);
        if (result.success) {
            await fetchApps();
        }
        return result;
    }

    async function removeApp(appId) {
        const result = await window.api.manager.appsRemove(appId);
        if (result.success) {
            await fetchApps();
        }
        return result;
    }

    async function launchApp(appId) {
        const result = await window.api.manager.appsLaunch(appId);
        return result;
    }

    async function clearAppData(appId) {
        const result = await window.api.manager.appsClearData(appId);
        return result;
    }

    async function checkUpdates() {
        return await window.api.manager.appsCheckUpdates();
    }

    // 拉取指定版本的内容更新说明（release notes，取不到返回空串）
    async function getReleaseNotes(repoUrl, version) {
        try {
            const result = await window.api.manager.appsGetReleaseNotes(repoUrl, version);
            return result.notes || '';
        } catch (e) {
            return '';
        }
    }

    // 可升级外壳的网页应用数量
    const shellUpgradableCount = computed(() => apps.value.filter(a => a.shellUpgrade).length);

    // 网页应用管理
    async function fetchManifest(url) {
        return await window.api.manager.webappFetchManifest(url);
    }

    async function createWebApp(config) {
        const result = await window.api.manager.webappCreate(config);
        if (result.success) {
            await fetchApps({ silent: true });
        }
        return result;
    }

    async function editWebApp(appId, config) {
        const result = await window.api.manager.webappEdit(appId, config);
        if (result.success) {
            await fetchApps({ silent: true });
        }
        return result;
    }

    // 升级网页应用外壳：仅重生成运行外壳，配置与数据保持不变
    async function upgradeWebAppShell(appId) {
        const result = await window.api.manager.webappUpgradeShell(appId);
        if (result.success) {
            await fetchApps({ silent: true });
        }
        return result;
    }

    // 批量升级所有可升级的网页应用外壳
    async function upgradeAllWebAppShells() {
        const result = await window.api.manager.webappUpgradeAllShells();
        if (result.success) {
            await fetchApps({ silent: true });
        }
        return result;
    }

    return {
        apps,
        loading,
        categoryFilter,
        setCategory,
        fetchApps,
        importApp,
        removeApp,
        launchApp,
        clearAppData,
        checkUpdates,
        getReleaseNotes,
        shellUpgradableCount,
        fetchManifest,
        createWebApp,
        editWebApp,
        upgradeWebAppShell,
        upgradeAllWebAppShells
    };
});
