import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useAppsStore = defineStore('apps', () => {
    const apps = ref([]);
    const loading = ref(false);
    const runningApps = ref(new Set());

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
        if (result.success) {
            runningApps.value.add(appId);
        }
        return result;
    }

    async function clearAppData(appId) {
        const result = await window.api.manager.appsClearData(appId);
        return result;
    }

    return {
        apps,
        loading,
        runningApps,
        fetchApps,
        importApp,
        removeApp,
        launchApp,
        clearAppData
    };
});
