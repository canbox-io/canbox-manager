import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useSettingsStore = defineStore('settings', () => {
    const settings = ref({
        language: 'zh-CN',
        autoStart: false,
        fontSize: 14,
        zoomFactor: 1.0,
        dataPath: '',
        logRetention: 30
    });
    const loading = ref(false);

    async function fetchSettings() {
        loading.value = true;
        try {
            const data = await window.api.manager.settingsGetAll();
            settings.value = { ...settings.value, ...data };
        } finally {
            loading.value = false;
        }
    }

    async function setSetting(key, value) {
        await window.api.manager.settingsSet(key, value);
        settings.value[key] = value;
    }

    return {
        settings,
        loading,
        fetchSettings,
        setSetting
    };
});
