import { defineStore } from 'pinia';
import { ref, computed } from 'vue';
import {
    listSources, addSource as addSourceApi, removeSource as removeSourceApi,
    fetchCatalog, getCache, getReadme, getRepoMarkdown
} from '../utils/catalogClient';
import i18n from '../i18n';

const LS_CURRENT_SOURCE = 'canbox.repos.currentSource';

export const useCatalogStore = defineStore('catalog', () => {
    const sources = ref([]);
    const appsBySource = ref({});
    const metaBySource = ref({});
    const fromCache = ref(false);
    const partialFailed = ref(false);
    const tooManyShards = ref(false);
    const loading = ref(false);
    const error = ref(null);
    const currentSourceId = ref(localStorage.getItem(LS_CURRENT_SOURCE) || 'default');

    let lastManualRefreshAt = 0;
    const MANUAL_REFRESH_COOLDOWN = 60 * 60 * 1000;

    const currentSource = computed(() =>
        sources.value.find(s => s.id === currentSourceId.value) || null
    );
    const currentApps = computed(() => appsBySource.value[currentSourceId.value] || []);
    const currentMeta = computed(() => metaBySource.value[currentSourceId.value] || null);
    const isBuiltinCurrent = computed(() => !!currentSource.value?.builtin);

    const searchQuery = ref('');
    const categoryFilter = ref('');
    const sortBy = ref('stars');

    const allCategories = computed(() => {
        const apps = currentApps.value;
        const cats = new Set();
        apps.forEach(a => { if (a.category) cats.add(a.category); });
        return Array.from(cats).sort();
    });

    function isZh() {
        return (i18n.global.locale?.value || i18n.global.locale || '').startsWith('zh');
    }

    function matchLang(app) {
        if (isZh()) {
            return app.description || app.description_en || '';
        }
        return app.description_en || app.description || '';
    }

    function matchSearch(app, query) {
        if (!query) return true;
        const q = query.toLowerCase();
        const desc = isZh()
            ? (app.description || app.description_en || '')
            : (app.description_en || app.description || '');
        return (
            (app.name || '').toLowerCase().includes(q) ||
            desc.toLowerCase().includes(q) ||
            (app.author || '').toLowerCase().includes(q) ||
            (app.tags || []).some(t => (t || '').toLowerCase().includes(q))
        );
    }

    const filteredApps = computed(() => {
        let apps = [...currentApps.value];
        const q = searchQuery.value.trim().toLowerCase();
        if (q) {
            apps = apps.filter(a => matchSearch(a, q));
        }
        if (categoryFilter.value) {
            apps = apps.filter(a => a.category === categoryFilter.value);
        }
        if (sortBy.value === 'stars') {
            apps.sort((a, b) => (b.stars || 0) - (a.stars || 0));
        } else if (sortBy.value === 'updated') {
            apps.sort((a, b) => new Date(b.lastCommitAt || 0) - new Date(a.lastCommitAt || 0));
        } else if (sortBy.value === 'name') {
            apps.sort((a, b) => (a.name || '').localeCompare(b.name || ''));
        }
        return apps;
    });

    function persistCurrent() {
        try {
            if (currentSourceId.value && currentSourceId.value !== 'default') {
                localStorage.setItem(LS_CURRENT_SOURCE, currentSourceId.value);
            } else {
                localStorage.removeItem(LS_CURRENT_SOURCE);
            }
        } catch { /* ignore */ }
    }

    async function fetchSources() {
        sources.value = await listSources();
        // 当前源已被删除则回到默认
        if (currentSourceId.value !== 'default' &&
            !sources.value.find(s => s.id === currentSourceId.value)) {
            currentSourceId.value = 'default';
            persistCurrent();
        }
        return sources.value;
    }

    function applyResult(sourceId, result) {
        appsBySource.value[sourceId] = result.apps || [];
        metaBySource.value[sourceId] = result.meta || null;
        if (sourceId === currentSourceId.value) {
            fromCache.value = !!result.fromCache;
            partialFailed.value = !!result.partialFailed;
            tooManyShards.value = !!result.tooManyShards;
        }
    }

    async function loadSource(sourceId, { force = false, silent = false } = {}) {
        if (sourceId === 'default') return;
        if (!silent) {
            loading.value = true;
            error.value = null;
        }
        try {
            if (!force) {
                const cached = await getCache(sourceId);
                if (cached && cached.cached && cached.apps && cached.apps.length) {
                    applyResult(sourceId, cached);
                    const result = await fetchCatalog(sourceId, { force: false });
                    if (result && result.success !== false) {
                        applyResult(sourceId, result);
                    }
                    return result;
                }
            }
            const result = await fetchCatalog(sourceId, { force });
            if (result && result.success === false) {
                throw new Error(result.error || '拉取失败');
            }
            applyResult(sourceId, result || { apps: [] });
            return result;
        } catch (e) {
            if (!silent) error.value = e.message;
            const cached = await getCache(sourceId);
            if (cached && cached.cached && cached.apps) {
                applyResult(sourceId, cached);
            }
            return { success: false, error: e.message };
        } finally {
            if (!silent) loading.value = false;
        }
    }

    async function primeAllCaches() {
        const ids = sources.value.map(s => s.id);
        await Promise.all(ids.map(id => loadSource(id, { force: false, silent: true }).catch(() => {})));
    }

    async function setActiveSource(sourceId) {
        currentSourceId.value = sourceId;
        persistCurrent();
        if (sourceId === 'default') {
            fromCache.value = false;
            partialFailed.value = false;
            tooManyShards.value = false;
            error.value = null;
            return;
        }
        searchQuery.value = '';
        categoryFilter.value = '';
        await loadSource(sourceId);
    }

    async function refreshSource() {
        if (currentSourceId.value === 'default') return;
        const now = Date.now();
        if (now - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN) {
            return { success: false, error: 'rate_limited' };
        }
        lastManualRefreshAt = now;
        loading.value = true;
        error.value = null;
        try {
            const result = await fetchCatalog(currentSourceId.value, { force: true });
            if (result && result.success === false) {
                throw new Error(result.error || '拉取失败');
            }
            applyResult(currentSourceId.value, result || { apps: [] });
            return result;
        } catch (e) {
            error.value = e.message;
            return { success: false, error: e.message };
        } finally {
            loading.value = false;
        }
    }

    function isManualRefreshLocked() {
        return Date.now() - lastManualRefreshAt < MANUAL_REFRESH_COOLDOWN;
    }

    function setSearch(q) { searchQuery.value = q; }
    function setCategory(c) { categoryFilter.value = c; }
    function setSortBy(s) { sortBy.value = s; }

    function isInstalled(repo, installedRepos) {
        if (!installedRepos || !repo) return false;
        return installedRepos.some(r => r.url === repo);
    }

    async function addSource(name, url) {
        const result = await addSourceApi(name, url);
        if (result && result.success) {
            await fetchSources();
            // 添加成功后立即拉取一次并切换到该源
            const newId = result.source?.id;
            if (newId) {
                await loadSource(newId, { force: false });
                await setActiveSource(newId);
            }
        }
        return result;
    }

    async function removeSource(sourceId) {
        const result = await removeSourceApi(sourceId);
        if (result && result.success) {
            delete appsBySource.value[sourceId];
            delete metaBySource.value[sourceId];
            if (currentSourceId.value === sourceId) {
                await setActiveSource('default');
            }
            await fetchSources();
        }
        return result;
    }

    async function fetchReadme(repoUrl) {
        try {
            return await getReadme(repoUrl);
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    async function fetchRepoMarkdown(repoUrl, filePath, branch) {
        try {
            return await getRepoMarkdown(repoUrl, filePath, branch);
        } catch (e) {
            return { success: false, error: e.message };
        }
    }

    return {
        sources, currentSourceId, currentSource, currentApps, currentMeta,
        isBuiltinCurrent, loading, error, fromCache, partialFailed, tooManyShards,
        searchQuery, categoryFilter, sortBy, allCategories, filteredApps,
        fetchSources, loadSource, primeAllCaches, setActiveSource, refreshSource, isManualRefreshLocked,
        setSearch, setCategory, setSortBy, isInstalled, fetchReadme, fetchRepoMarkdown, matchLang,
        addSource, removeSource,
        appsBySource
    };
});
