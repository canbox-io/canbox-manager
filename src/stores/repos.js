import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useReposStore = defineStore('repos', () => {
    const repos = ref([]);
    const loading = ref(false);

    async function fetchRepos() {
        loading.value = true;
        try {
            repos.value = await window.api.manager.reposList();
        } finally {
            loading.value = false;
        }
    }

    async function addRepo(url, options) {
        const result = await window.api.manager.reposAdd(url, options);
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

    return {
        repos,
        loading,
        fetchRepos,
        addRepo,
        removeRepo
    };
});
