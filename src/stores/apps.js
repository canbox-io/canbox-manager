import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppsStore = defineStore('apps', () => {
    const apps = ref([]);
    const loading = ref(false);

    async function fetchApps() {
        loading.value = true;
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

    // 网页应用管理
    async function fetchManifest(url) {
        return await window.api.manager.webappFetchManifest(url);
    }

    async function createWebApp(config) {
        const result = await window.api.manager.webappCreate(config);
        if (result.success) {
            await fetchApps();
        }
        return result;
    }

    async function editWebApp(appId, config) {
        const result = await window.api.manager.webappEdit(appId, config);
        if (result.success) {
            await fetchApps();
        }
        return result;
    }

    return {
        apps,
        loading,
        fetchApps,
        importApp,
        removeApp,
        launchApp,
        clearAppData,
        checkUpdates,
        fetchManifest,
        createWebApp,
        editWebApp
    };
});
