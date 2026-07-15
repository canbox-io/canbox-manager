import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useReposStore = defineStore('repos', () => {
    const repos = ref([]);
    const loading = ref(false);
    const syncing = ref({});  // { [repoId]: boolean }
    const installing = ref({});  // { [repoId]: boolean }
    const installProgress = ref({});  // { [repoId]: number 0~100 }
    // Developer 一键安装状态（全局，避免组件卸载后状态丢失）
    const installingDeveloper = ref(false);

    async function fetchRepos() {
        loading.value = true;
        try {
            repos.value = await window.api.manager.reposList();
        } finally {
            loading.value = false;
        }
    }

    async function addRepo(url) {
        const result = await window.api.manager.reposAdd(url);
        if (result.success) {
            await fetchRepos();
        }
        return result;
    }

    async function removeRepo(repoId) {
        const result = await window.api.manager.reposRemove(repoId);
        if (result.success) {
            await fetchRepos();
        }
        return result;
    }

    async function syncRepo(repoId) {
        syncing.value[repoId] = true;
        try {
            const result = await window.api.manager.reposSync(repoId);
            if (result.success) {
                await fetchRepos();
            }
            return result;
        } finally {
            syncing.value[repoId] = false;
        }
    }

    async function installRepo(repoId) {
        installing.value[repoId] = true;
        installProgress.value[repoId] = 0;
        try {
            const result = await window.api.manager.reposInstall(repoId);
            if (result.success) {
                await fetchRepos();
            }
            return result;
        } finally {
            installing.value[repoId] = false;
        }
    }

    async function getReadme(repoId) {
        return await window.api.manager.reposGetReadme(repoId);
    }

    return {
        repos,
        loading,
        syncing,
        installing,
        installProgress,
        installingDeveloper,
        fetchRepos,
        addRepo,
        removeRepo,
        syncRepo,
        installRepo,
        getReadme
    };
});
