import { defineStore } from 'pinia';
import { ref } from 'vue';

export const useReposStore = defineStore('repos', () => {
    const repos = ref([]);
    const loading = ref(false);
    const syncing = ref({});  // { [repoId]: boolean }
    const installing = ref({});  // { [repoUrl]: boolean }（三组统一以 repoUrl 为 key）
    const installProgress = ref({});  // { [repoUrl]: number 0~100 }
    // Developer 一键安装状态（全局，避免组件卸载后状态丢失）
    const installingDeveloper = ref(false);
    // 安装状态缓存：{ [repoUrl]: { installed, toUpdate, installedVersion? } }
    // 由 ReposView 在卡片渲染前批量刷新
    const installStates = ref({});

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

    async function syncAllRepos() {
        const ids = repos.value.map(r => r.id);
        ids.forEach(id => { syncing.value[id] = true; });
        try {
            for (const id of ids) {
                await window.api.manager.reposSync(id);
            }
            await fetchRepos();
            return { success: true };
        } catch (e) {
            return { success: false, error: e.message };
        } finally {
            ids.forEach(id => { syncing.value[id] = false; });
        }
    }

    // 统一下载入口：默认组传 repo.url + { firstDownloadFrom: 'default' }，
    // 仓库源组传 app.repo + { firstDownloadFrom: sourceId }
    async function installByRepoUrl(repoUrl, options = {}) {
        installing.value[repoUrl] = true;
        installProgress.value[repoUrl] = 0;
        try {
            const result = await window.api.manager.catalogInstall(repoUrl, options);
            if (result.success) {
                // 默认组下载完后刷新仓库列表（catalog 组无仓库列表，跳过）
                if (options.firstDownloadFrom === 'default') {
                    await fetchRepos();
                }
                // 刷新该 repoUrl 的安装状态缓存
                await refreshInstallStates([repoUrl]);
            }
            return result;
        } finally {
            installing.value[repoUrl] = false;
        }
    }

    // 批量刷新安装状态缓存（渲染前调用，避免 N 次 IPC）
    // queries: [{ repoUrl, latestVersion? }, ...]
    async function refreshInstallStates(queries) {
        if (!queries || queries.length === 0) return;
        const result = await window.api.manager.catalogGetInstallStates(queries);
        if (Array.isArray(result)) {
            const map = { ...installStates.value };
            result.forEach(item => {
                map[item.repoUrl] = {
                    installed: !!item.installed,
                    toUpdate: !!item.toUpdate,
                    installedVersion: item.installedVersion || null
                };
            });
            installStates.value = map;
        }
    }

    // 获取某 repoUrl 的安装状态（从缓存读，未缓存返回未安装）
    function getInstallState(repoUrl) {
        return installStates.value[repoUrl] || { installed: false };
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
        installStates,
        fetchRepos,
        addRepo,
        removeRepo,
        syncRepo,
        syncAllRepos,
        installByRepoUrl,
        refreshInstallStates,
        getInstallState,
        getReadme
    };
});
