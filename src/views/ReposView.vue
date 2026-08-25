<script setup>
import { onMounted, onUnmounted, ref, computed, nextTick, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { ElMessageBox } from 'element-plus';
import MarkdownIt from 'markdown-it';
import { useReposStore } from '@/stores/repos';
import { useCatalogStore } from '@/stores/catalog';
import notification from '@/utils/notification';

const { t } = useI18n();
const reposStore = useReposStore();
const catalogStore = useCatalogStore();

const showAddDialog = ref(false);
const addForm = ref({ url: '' });
const adding = ref(false);

const showAddSourceDialog = ref(false);
const sourceForm = ref({ name: '', url: '' });
const addingSource = ref(false);

// 平台 SVG 图标（与 AppsView 保持一致）
const PLATFORM_ICONS_SVG = {
    windows: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M0 3.449L9.75 2.1v9.451H0m10.949-9.602L24 0v11.4H10.949M0 12.6h9.75v9.451L0 20.699M10.949 12.6H24V24l-12.9-1.801"/></svg>',
    darwin: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.81-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/></svg>',
    linux: '<svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12.504 0c-.155 0-.315.008-.48.021-4.226.333-3.105 4.807-3.17 6.298-.076 1.092-.3 1.953-1.05 3.02-.885 1.051-2.127 2.75-2.716 4.521-.278.832-.41 1.684-.287 2.489a.424.424 0 00-.11.135c-.26.268-.45.6-.663.839-.199.199-.485.267-.797.4-.313.136-.658.269-.864.68-.09.189-.136.394-.132.602 0 .199.027.4.055.536.058.399.116.728.04.97-.249.68-.28 1.145-.106 1.484.174.334.535.47.94.601.81.2 1.91.135 2.774.6.926.466 1.866.67 2.616.47.526-.116.97-.464 1.208-.946.587-.003 1.23-.269 2.26-.334.699-.058 1.574.267 2.577.2.025.134.063.198.114.333l.003.003c.391.778 1.113 1.132 1.884 1.071.771-.06 1.592-.536 2.257-1.306.631-.765 1.683-1.084 2.378-1.503.348-.199.629-.469.649-.853.023-.4-.2-.811-.714-1.376v-.097l-.003-.003c-.17-.2-.25-.535-.338-.926-.085-.401-.182-.786-.492-1.046h-.003c-.059-.054-.123-.067-.188-.135a.357.357 0 00-.19-.064c.431-1.278.264-2.55-.173-3.694-.533-1.41-1.465-2.638-2.175-3.483-.796-1.005-1.576-1.957-1.56-3.368.026-2.152.236-6.133-3.544-6.139z"/></svg>'
};
const PLATFORM_NAMES = {
    windows: 'Windows',
    darwin: 'macOS',
    linux: 'Linux'
};

const readmeContent = ref('');
const readmeTitle = ref('');
const readmeLoading = ref(false);
const readmeError = ref(null);
const showReadmeDrawer = ref(false);
const readmeContext = ref(null);
const readmeHistory = ref([]);
const renderedReadme = computed(() => {
    if (!readmeContent.value) return '';
    try {
        return md.render(readmeContent.value);
    } catch (e) {
        return readmeContent.value;
    }
});

const md = new MarkdownIt({ html: false, linkify: true, breaks: true });
const defaultLinkOpen = md.renderer.rules.link_open || function(tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
};
md.renderer.rules.link_open = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const hrefIndex = token.attrIndex('href');
    if (hrefIndex >= 0) {
        token.attrSet('data-href', token.attrs[hrefIndex][1]);
        token.attrPush(['class', 'readme-link']);
    }
    return defaultLinkOpen(tokens, idx, options, env, self);
};

const defaultImage = md.renderer.rules.image || function(tokens, idx, options, _env, self) {
    return self.renderToken(tokens, idx, options);
};
md.renderer.rules.image = function(tokens, idx, options, env, self) {
    const token = tokens[idx];
    const srcIndex = token.attrIndex('src');
    if (srcIndex >= 0 && readmeContext.value) {
        const src = token.attrs[srcIndex][1];
        if (src && !/^(https?:)?\/\//i.test(src) && !/^[a-z][a-z0-9+.-]*:/i.test(src)) {
            const ctx = readmeContext.value;
            const resolved = resolveReadmePath(src, ctx.currentPath || 'README.md');
            token.attrs[srcIndex][1] = `https://raw.githubusercontent.com/${ctx.owner}/${ctx.repo}/${ctx.branch || 'main'}/${resolved || src}`;
        }
    }
    return defaultImage(tokens, idx, options, env, self);
};

function getReadmeDir(path) {
    if (!path) return '';
    const idx = path.lastIndexOf('/');
    return idx >= 0 ? path.substring(0, idx + 1) : '';
}

function resolveReadmePath(href, currentPath) {
    if (!href) return null;
    if (/^(https?:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) return null;
    if (href.startsWith('#')) return null;
    const baseDir = getReadmeDir(currentPath || 'README.md');
    let resolved = baseDir + href;
    const parts = resolved.split('/');
    const stack = [];
    for (const p of parts) {
        if (p === '' || p === '.') continue;
        if (p === '..') stack.pop();
        else stack.push(p);
    }
    return stack.join('/');
}

function isMarkdownPath(p) {
    if (!p) return false;
    const clean = p.split('#')[0].split('?')[0];
    return /\.(md|markdown|mdx)$/i.test(clean);
}

async function loadReadmePath(filePath) {
    if (!readmeContext.value) return;
    const ctx = readmeContext.value;
    const prevPath = ctx.currentPath || 'README.md';
    readmeHistory.value.push({
        content: readmeContent.value,
        title: readmeTitle.value,
        path: prevPath
    });
    readmeLoading.value = true;
    readmeError.value = null;
    readmeContent.value = '';
    const result = await catalogStore.fetchRepoMarkdown(ctx.repoUrl, filePath, ctx.branch);
    readmeLoading.value = false;
    if (result && result.success) {
        readmeContent.value = result.readme || '';
        readmeContext.value = { ...ctx, branch: result.branch || ctx.branch, currentPath: filePath };
        readmeTitle.value = `${ctx.appName} · ${filePath}`;
    } else {
        readmeHistory.value.pop();
        readmeError.value = (result && result.error) || t('catalog.readmeFailed');
    }
}

function readmeBack() {
    const prev = readmeHistory.value.pop();
    if (!prev) return;
    readmeContent.value = prev.content;
    readmeTitle.value = prev.title;
    readmeError.value = null;
    if (readmeContext.value) {
        readmeContext.value = { ...readmeContext.value, currentPath: prev.path };
    }
}

function onReadmeClick(e) {
    const link = e.target.closest('a');
    if (!link) return;
    const href = link.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    if (href.startsWith('#')) {
        const id = decodeURIComponent(href.slice(1));
        const container = link.closest('.readme-container');
        const target = container && container.querySelector(`[id="${CSS.escape(id)}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
    }
    if (/^(https?:)?\/\//i.test(href) || /^[a-z][a-z0-9+.-]*:/i.test(href)) {
        openExternal(href);
        return;
    }
    if (!readmeContext.value) {
        openExternal(href);
        return;
    }
    const resolved = resolveReadmePath(href, readmeContext.value.currentPath || 'README.md');
    if (resolved && isMarkdownPath(resolved)) {
        loadReadmePath(resolved);
    } else {
        const url = `https://github.com/${readmeContext.value.owner}/${readmeContext.value.repo}/blob/${readmeContext.value.branch || 'main'}/${resolved || href}`;
        openExternal(url);
    }
}

function getPlatforms(repo) {
    return repo.platforms && repo.platforms.length > 0 ? repo.platforms : ['windows', 'darwin', 'linux'];
}

// 默认组（reposStore.repos）的 logo 已外置为二进制文件（store/repos-logos/{repoId}.{ext}），
// 通过自定义协议 canbox-repo-logo 读取；catalog 组仍用 app.logo（data URI/URL），不变。
function repoLogoSrc(repo) {
    return repo && repo.logoExt && repo.id
        ? `canbox-repo-logo://local/${repo.id}.${repo.logoExt}`
        : '';
}

let removeProgressListener = null;

onMounted(async () => {
    reposStore.fetchRepos();
    removeProgressListener = window.api.manager.onInstallProgress((data) => {
        // 三组统一以 repoUrl 为进度 key
        if (data && data.repoUrl) {
            reposStore.installProgress[data.repoUrl] = data.progress;
        }
    });
    await catalogStore.fetchSources();
    // 恢复上次选中的源（非 default 时加载其缓存）
    if (catalogStore.currentSourceId !== 'default') {
        catalogStore.loadSource(catalogStore.currentSourceId, { silent: true });
    }
    // 后台预热所有源缓存，供全局搜索使用
    catalogStore.primeAllCaches();
    window.addEventListener('keydown', onGlobalKey);
});

// 默认组仓库列表变化时，批量刷新追踪表安装状态（徽标用）
watch(() => reposStore.repos, (repos) => {
    const queries = repos.map(r => ({ repoUrl: r.url, latestVersion: r.version }));
    if (queries.length) reposStore.refreshInstallStates(queries);
}, { deep: false });

// 仓库源组（catalog）当前应用列表变化时，同样批量刷新
watch(() => catalogStore.currentApps, (apps) => {
    const queries = apps.map(a => ({ repoUrl: a.repo, latestVersion: a.appVersion }));
    if (queries.length) reposStore.refreshInstallStates(queries);
}, { deep: false });

// 全局搜索结果变化时，刷新其安装状态（跨组统一）
watch(() => catalogStore.filteredApps, (apps) => {
    const queries = apps.map(a => ({ repoUrl: a.repo, latestVersion: a.appVersion }));
    if (queries.length) reposStore.refreshInstallStates(queries);
}, { deep: false });

onUnmounted(() => {
    if (removeProgressListener) removeProgressListener();
    window.removeEventListener('keydown', onGlobalKey);
});

function onGlobalKey(e) {
    if ((e.ctrlKey || e.metaKey) && (e.key === 'f' || e.key === 'F')) {
        e.preventDefault();
        openSearch();
    } else if (e.key === 'Escape' && searchActive.value) {
        closeSearch();
    }
}

const isDefault = computed(() => catalogStore.currentSourceId === 'default');
const currentSourceName = computed(() => {
    if (isDefault.value) return t('catalog.sourceDefault');
    return catalogStore.currentSource?.name || '';
});

const syncingAll = ref(false);
const anyRepoSyncing = computed(() =>
    Object.values(reposStore.syncing).some(Boolean) || syncingAll.value
);

async function handleAdd() {
    if (!addForm.value.url.trim()) return;
    adding.value = true;
    try {
        const result = await reposStore.addRepo(addForm.value.url.trim());
        if (result.success) {
            notification.success(t('repos.addSuccess'));
            showAddDialog.value = false;
            addForm.value = { url: '' };
        } else if (result.error === 'duplicate_url') {
            notification.warning(t('repos.addDuplicate'));
        } else {
            notification.error(result.error || t('repos.addFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('repos.addFailed'));
    } finally {
        adding.value = false;
    }
}

async function handleRemove(repo) {
    try {
        await ElMessageBox.confirm(
            t('repos.removeConfirm'),
            t('repos.remove'),
            { type: 'warning' }
        );
        const result = await reposStore.removeRepo(repo.id);
        if (result.success) {
            notification.success(t('repos.removeSuccess'));
        } else {
            notification.error(result.error);
        }
    } catch (e) {
        // 用户取消
    }
}

async function handleSync(repo) {
    const result = await reposStore.syncRepo(repo.id);
    if (result.success) {
        notification.success(t('repos.syncSuccess'));
    } else {
        notification.error(result.error || t('repos.syncFailed'));
    }
}

async function handleSyncAll() {
    if (syncingAll.value) return;
    syncingAll.value = true;
    try {
        const result = await reposStore.syncAllRepos();
        if (result.success) {
            notification.success(t('repos.syncAllSuccess'));
        } else {
            notification.error(result.error || t('repos.syncFailed'));
        }
    } finally {
        syncingAll.value = false;
    }
}

async function handleInstall(repo) {
    // 默认组：与仓库源组完全对等，统一调 installByRepoUrl(repo.url, ...)
    const result = await reposStore.installByRepoUrl(repo.url, { firstDownloadFrom: 'default' });
    if (result.success) {
        notification.success(t('repos.installSuccess'));
    } else {
        notification.error(result.error || t('repos.installFailed'));
    }
}

function parseRepoUrl(repoUrl) {
    try {
        const u = new URL(repoUrl);
        if (u.hostname !== 'github.com') return null;
        const parts = u.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        return { owner: parts[0], repo: parts[1].replace(/\.git$/, '') };
    } catch {
        return null;
    }
}

async function openRepoReadme(repo) {
    showReadmeDrawer.value = true;
    readmeLoading.value = true;
    readmeError.value = null;
    readmeContent.value = '';
    readmeHistory.value = [];
    readmeTitle.value = repo.name;
    const parsed = parseRepoUrl(repo.url);
    readmeContext.value = parsed ? {
        kind: 'repo',
        appName: repo.name,
        repoUrl: repo.url,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: repo.branch || 'main',
        currentPath: 'README.md'
    } : null;
    const result = await reposStore.getReadme(repo.id);
    readmeLoading.value = false;
    if (result.success) {
        readmeContent.value = result.readme || '';
    } else {
        readmeError.value = result.error;
    }
}

async function selectSource(sourceId) {
    if (searchActive.value) closeSearch();
    await catalogStore.setActiveSource(sourceId);
}

async function handleRefreshCatalog() {
    if (catalogStore.isManualRefreshLocked()) {
        notification.info(t('catalog.refreshRateLimited'));
        return;
    }
    const result = await catalogStore.refreshSource();
    if (result && result.success === false && result.error !== 'rate_limited') {
        notification.error(result.error || t('catalog.fetchFailed'));
    } else if (result && result.success !== false) {
        notification.success(t('catalog.fetchSuccess'));
    }
}

async function handleAddSource() {
    if (!sourceForm.value.name.trim() || !sourceForm.value.url.trim()) return;
    addingSource.value = true;
    try {
        const result = await catalogStore.addSource(sourceForm.value.name.trim(), sourceForm.value.url.trim());
        if (result && result.success) {
            notification.success(t('catalog.addSourceSuccess'));
            showAddSourceDialog.value = false;
            sourceForm.value = { name: '', url: '' };
        } else {
            notification.error((result && result.error) || t('catalog.addSourceFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('catalog.addSourceFailed'));
    } finally {
        addingSource.value = false;
    }
}

async function handleRemoveSource(source) {
    try {
        await ElMessageBox.confirm(
            t('catalog.removeSourceConfirm', { name: source.name }),
            t('common.confirm'),
            { type: 'warning' }
        );
        const result = await catalogStore.removeSource(source.id);
        if (result && result.success) {
            notification.success(t('catalog.removeSourceSuccess'));
        } else {
            notification.error(result.error);
        }
    } catch (e) {
        // 用户取消
    }
}

async function openCatalogAppReadme(app) {
    showReadmeDrawer.value = true;
    readmeLoading.value = true;
    readmeError.value = null;
    readmeContent.value = '';
    readmeHistory.value = [];
    readmeTitle.value = app.name;
    const parsed = parseRepoUrl(app.repo);
    readmeContext.value = parsed ? {
        kind: 'catalog',
        appName: app.name,
        repoUrl: app.repo,
        owner: parsed.owner,
        repo: parsed.repo,
        branch: 'main',
        currentPath: 'README.md'
    } : null;
    const result = await catalogStore.fetchReadme(app.repo);
    readmeLoading.value = false;
    if (result && result.success) {
        readmeContent.value = result.readme || '';
        if (readmeContext.value && result.branch) {
            readmeContext.value = { ...readmeContext.value, branch: result.branch };
        }
    } else {
        readmeError.value = (result && result.error) || t('catalog.readmeFailed');
    }
}

async function handleInstallFromCatalog(app) {
    // 仓库源组：与默认组完全对等，统一调 installByRepoUrl(app.repo, ...)
    // 不再调 addRepo 污染默认组 repos 表
    const sourceId = catalogStore.currentSourceId;
    try {
        const result = await reposStore.installByRepoUrl(app.repo, { firstDownloadFrom: sourceId });
        if (result && result.success) {
            notification.success(t('repos.installSuccess'));
        } else if (result) {
            notification.error(result.error || t('repos.installFailed'));
        }
    } catch (e) {
        notification.error(e.message || t('repos.installFailed'));
    }
}

function openExternal(url) {
    window.api.manager.openUrl(url);
}

function closeReadme() {
    showReadmeDrawer.value = false;
    readmeHistory.value = [];
    readmeContext.value = null;
}

function formatNumber(n) {
    if (!n) return '0';
    if (n >= 1000) return (n / 1000).toFixed(1) + 'k';
    return String(n);
}

function formatDate(iso) {
    if (!iso) return '';
    try {
        return new Date(iso).toLocaleDateString();
    } catch {
        return '';
    }
}

function statusType(status) {
    const map = {
        active: 'success',
        warning: 'warning',
        critical: 'danger',
        stale: 'info',
        unknown: 'info',
        removed: 'danger'
    };
    return map[status] || 'info';
}

function statusLabel(status) {
    return t(`catalog.status_${status || 'unknown'}`);
}

// ====== Ctrl+F 全局搜索 ======
const searchActive = ref(false);
const searchInput = ref('');
const searchCategory = ref('');
const searchStatus = ref('');
const searchSubmitted = ref('');
const searchInputRef = ref(null);

const allSearchCategories = computed(() => {
    const cats = new Set();
    Object.values(catalogStore.appsBySource).forEach(apps => {
        (apps || []).forEach(a => { if (a.category) cats.add(a.category); });
    });
    return Array.from(cats).sort();
});

function openSearch() {
    searchActive.value = true;
    searchSubmitted.value = '';
    nextTick(() => searchInputRef.value?.focus?.());
    // 确保所有源都已缓存
    catalogStore.primeAllCaches();
}

function closeSearch() {
    searchActive.value = false;
    searchInput.value = '';
    searchCategory.value = '';
    searchStatus.value = '';
    searchSubmitted.value = '';
}

function submitSearch() {
    searchSubmitted.value = searchInput.value.trim();
}

function matchRepo(repo, q) {
    if (!q) return true;
    const needle = q.toLowerCase();
    return (
        (repo.name || '').toLowerCase().includes(needle) ||
        (repo.displayName || '').toLowerCase().includes(needle) ||
        (repo.url || '').toLowerCase().includes(needle)
    );
}

const searchGroups = computed(() => {
    const q = searchSubmitted.value.toLowerCase();
    if (!searchActive.value || !q) return [];
    const groups = [];

    // 默认源：用户自己的仓库
    const repos = reposStore.repos.filter(r => matchRepo(r, q));
    if (repos.length) {
        groups.push({
            key: 'default',
            name: t('catalog.sourceDefault'),
            type: 'repos',
            items: repos
        });
    }

    // 各 catalog 源
    catalogStore.sources.forEach(source => {
        const apps = (catalogStore.appsBySource[source.id] || []).filter(a => {
            const desc = a.description || a.description_en || '';
            const hay = [a.name, desc, a.author, ...(a.tags || [])].join(' ').toLowerCase();
            if (!hay.includes(q)) return false;
            if (searchCategory.value && a.category !== searchCategory.value) return false;
            if (searchStatus.value && a.status !== searchStatus.value) return false;
            return true;
        });
        if (apps.length) {
            groups.push({
                key: source.id,
                name: source.name,
                type: 'catalog',
                items: apps
            });
        }
    });

    return groups;
});

const searchTotal = computed(() =>
    searchGroups.value.reduce((sum, g) => sum + g.items.length, 0)
);
</script>

<template>
    <div class="view-container">
        <!-- Ctrl+F 搜索浮层 -->
        <div v-if="searchActive" class="search-overlay" @mousedown.self="closeSearch">
            <div class="search-bar">
                <el-input
                    ref="searchInputRef"
                    v-model="searchInput"
                    :placeholder="$t('catalog.searchPlaceholder')"
                    clearable
                    @keyup.enter="submitSearch"
                    @clear="searchSubmitted = ''"
                />
                <el-select v-model="searchCategory" :placeholder="$t('catalog.allCategories')" clearable>
                    <el-option
                        v-for="c in allSearchCategories"
                        :key="c"
                        :label="c"
                        :value="c"
                    />
                </el-select>
                <el-select v-model="searchStatus" :placeholder="$t('catalog.allStatuses')" clearable>
                    <el-option :label="$t('catalog.status_active')" value="active" />
                    <el-option :label="$t('catalog.status_warning')" value="warning" />
                    <el-option :label="$t('catalog.status_critical')" value="critical" />
                    <el-option :label="$t('catalog.status_stale')" value="stale" />
                    <el-option :label="$t('catalog.status_unknown')" value="unknown" />
                </el-select>
            </div>
            <div v-if="searchSubmitted" class="search-results">
                <div v-if="searchTotal === 0" class="search-empty">
                    <el-empty :description="$t('catalog.searchNoResult')" />
                </div>
                <div v-for="g in searchGroups" :key="g.key" class="search-group">
                    <div class="search-group-title">{{ g.name }}</div>
                    <div class="repo-list search-grid">
                        <div v-for="item in g.items" :key="g.key + '-' + (item.id || item.repo)" class="repo-card">
                            <!-- 默认源仓库卡片 -->
                            <template v-if="g.type === 'repos'">
                                <img v-if="item.logoExt" :src="repoLogoSrc(item)" class="repo-logo" alt="logo" />
                                <div v-else class="repo-logo-placeholder">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="26" height="26"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" /></svg>
                                </div>
                                <div class="repo-info">
                                    <div class="repo-name">
                                        <span>{{ item.displayName || item.name }}</span>
                                        <el-tag v-if="reposStore.getInstallState(item.url).installed && reposStore.getInstallState(item.url).toUpdate" type="warning" size="small" effect="light">{{ $t('repos.hasUpdate') }}</el-tag>
                                        <el-tag v-else-if="reposStore.getInstallState(item.url).installed" type="success" size="small" effect="light">{{ $t('repos.installed') }}</el-tag>
                                    </div>
                                    <div class="repo-url">{{ item.url }}</div>
                                    <div class="repo-meta-row">
                                        <div class="platform-badges">
                                            <span v-for="p in getPlatforms(item)" :key="p" class="platform-badge" v-html="PLATFORM_ICONS_SVG[p]" :title="PLATFORM_NAMES[p]" />
                                        </div>
                                        <span v-if="item.version" class="meta-chip">v{{ item.version }}</span>
                                    </div>
                                </div>
                            </template>
                            <!-- Catalog APP 卡片 -->
                            <template v-else>
                                <img v-if="item.logo" :src="item.logo" class="repo-logo" alt="logo" />
                                <div v-else class="repo-logo-placeholder">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="26" height="26"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 9h6v6H9z" /></svg>
                                </div>
                                <div class="repo-info">
                                    <div class="repo-name">
                                        <span class="catalog-app-name" @click="openCatalogAppReadme(item)">{{ item.name }}</span>
                                        <el-tag v-if="reposStore.getInstallState(item.repo).installed && reposStore.getInstallState(item.repo).toUpdate" type="warning" size="small" effect="light">{{ $t('repos.hasUpdate') }}</el-tag>
                                        <el-tag v-else-if="reposStore.getInstallState(item.repo).installed" type="success" size="small" effect="light">{{ $t('repos.installed') }}</el-tag>
                                        <el-tag v-else size="small" :type="statusType(item.status)" effect="light" round>{{ statusLabel(item.status) }}</el-tag>
                                    </div>
                                    <div class="catalog-desc">{{ catalogStore.matchLang(item) }}</div>
                                    <div class="repo-meta-row">
                                        <span v-if="item.appVersion" class="meta-chip">v{{ item.appVersion }}</span>
                                        <span v-if="item.category" class="meta-chip">{{ item.category }}</span>
                                        <span v-if="item.stars" class="meta-chip">★ {{ formatNumber(item.stars) }}</span>
                                    </div>
                                </div>
                            </template>
                        </div>
                    </div>
                </div>
            </div>
        </div>

        <div class="view-header">
            <h2 class="view-title">{{ $t('repos.title') }}</h2>
            <div class="header-actions">
                <el-select
                    v-if="!isDefault && !searchActive"
                    :model-value="catalogStore.sortBy"
                    size="small"
                    class="sort-select"
                    @update:model-value="catalogStore.setSortBy"
                >
                    <el-option :label="$t('catalog.sortStars')" value="stars" />
                    <el-option :label="$t('catalog.sortUpdated')" value="updated" />
                    <el-option :label="$t('catalog.sortName')" value="name" />
                </el-select>

                <template v-if="isDefault">
                    <el-button type="primary" @click="showAddDialog = true">
                        ＋ {{ $t('repos.add') }}
                    </el-button>
                    <el-button :loading="syncingAll" :disabled="anyRepoSyncing" @click="handleSyncAll">
                        ↻ {{ $t('repos.syncAll') }}
                    </el-button>
                </template>
                <template v-else>
                    <el-button :loading="catalogStore.loading" @click="handleRefreshCatalog">
                        ↻ {{ $t('catalog.manualRefresh') }}
                    </el-button>
                </template>

                <el-select
                    :model-value="catalogStore.currentSourceId"
                    class="source-select"
                    @update:model-value="selectSource"
                >
                    <el-option :label="$t('catalog.sourceDefault')" value="default">
                        <span>{{ $t('catalog.sourceDefault') }}</span>
                    </el-option>
                    <el-option
                        v-for="source in catalogStore.sources"
                        :key="source.id"
                        :label="source.name"
                        :value="source.id"
                    >
                        <span class="source-option">
                            <span>{{ source.name }}</span>
                            <span v-if="source.builtin" class="source-badge">{{ $t('catalog.builtin') }}</span>
                            <button
                                v-if="!source.builtin"
                                class="source-delete"
                                :title="$t('catalog.removeSource')"
                                @click.stop="handleRemoveSource(source)"
                            >×</button>
                        </span>
                    </el-option>
                </el-select>
            </div>
        </div>

        <div class="repo-list">
            <!-- 空状态：还没有任何仓库 + 默认源 -->
            <el-empty v-if="isDefault && !reposStore.loading && reposStore.repos.length === 0" :description="$t('repos.empty')">
                <el-button type="primary" @click="showAddDialog = true">
                    ＋ {{ $t('repos.addFirst') }}
                </el-button>
                <el-button class="add-source-btn" @click="showAddSourceDialog = true">
                    ＋ {{ $t('catalog.addSource') }}
                </el-button>
            </el-empty>

            <!-- 默认源：用户仓库列表 -->
            <template v-if="isDefault">
                <div v-for="repo in reposStore.repos" :key="repo.id" class="repo-card">
                    <img v-if="repo.logoExt" :src="repoLogoSrc(repo)" class="repo-logo" alt="logo" />
                    <div v-else class="repo-logo-placeholder">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="26" height="26"><path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 00-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0020 4.77 5.07 5.07 0 0019.91 1S18.73.65 16 2.48a13.38 13.38 0 00-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 005 4.77a5.44 5.44 0 00-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 009 18.13V22" /></svg>
                    </div>
                    <div class="repo-info">
                        <div class="repo-header-row">
                            <span class="repo-name">{{ repo.displayName || repo.name }}</span>
                            <el-tag v-if="repo.lastError" type="danger" size="small" effect="light">{{ $t('repos.probeFailed') }}</el-tag>
                            <el-tag v-else-if="reposStore.getInstallState(repo.url).installed && reposStore.getInstallState(repo.url).toUpdate" type="warning" size="small" effect="light">{{ $t('repos.hasUpdate') }}</el-tag>
                            <el-tag v-else-if="reposStore.getInstallState(repo.url).installed" type="success" size="small" effect="light">{{ $t('repos.installed') }}</el-tag>
                        </div>
                        <div class="repo-url">{{ repo.url }}</div>
                        <div class="repo-meta-row">
                            <div class="platform-badges">
                                <span v-for="p in getPlatforms(repo)" :key="p" class="platform-badge" v-html="PLATFORM_ICONS_SVG[p]" :title="PLATFORM_NAMES[p]" />
                            </div>
                            <span v-if="repo.version" class="meta-chip">v{{ repo.version }}</span>
                            <span v-if="repo.lastSyncAt" class="meta-chip">
                                {{ $t('repos.lastSync') }}: {{ new Date(repo.lastSyncAt).toLocaleString() }}
                            </span>
                            <span v-if="reposStore.getInstallState(repo.url).installed && reposStore.getInstallState(repo.url).installedVersion" class="meta-chip">
                                {{ $t('repos.installedVersion') }}: v{{ reposStore.getInstallState(repo.url).installedVersion }}
                            </span>
                        </div>
                        <div v-if="repo.lastError" class="repo-error">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="14" height="14"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                            <span>{{ repo.lastError }}</span>
                        </div>
                        <div v-if="reposStore.installProgress[repo.url] !== undefined && reposStore.installing[repo.url]" class="install-progress-mini">
                            <el-progress :percentage="reposStore.installProgress[repo.url]" :stroke-width="6" :show-text="false" />
                            <span class="install-progress-label">{{ reposStore.installProgress[repo.url] }}%</span>
                        </div>
                        <div class="repo-actions">
                            <el-tooltip v-if="!reposStore.getInstallState(repo.url).installed || reposStore.getInstallState(repo.url).toUpdate" :content="reposStore.getInstallState(repo.url).toUpdate ? $t('apps.update') : $t('repos.install')" placement="top">
                                <button class="icon-btn install-btn" :disabled="reposStore.installing[repo.url]" @click="handleInstall(repo)">
                                    <span v-if="reposStore.installing[repo.url]" class="mini-spinner"></span>
                                    <span v-else-if="reposStore.getInstallState(repo.url).toUpdate">🔄</span>
                                    <span v-else>⬇️</span>
                                </button>
                            </el-tooltip>
                            <el-tooltip :content="$t('repos.sync')" placement="top">
                                <button class="icon-btn sync-btn" :disabled="reposStore.syncing[repo.id]" @click="handleSync(repo)">
                                    <span v-if="reposStore.syncing[repo.id]" class="mini-spinner"></span>
                                    <span v-else>🔄</span>
                                </button>
                            </el-tooltip>
                            <el-tooltip :content="$t('repos.viewReadme')" placement="top">
                                <button class="icon-btn readme-btn" @click="openRepoReadme(repo)">📄</button>
                            </el-tooltip>
                            <el-tooltip content="GitHub" placement="top">
                                <button class="icon-btn github-btn" @click="openExternal(repo.url)" aria-label="GitHub">
                                    <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                                </button>
                            </el-tooltip>
                            <el-tooltip :content="$t('repos.remove')" placement="top">
                                <button class="icon-btn delete-btn" @click="handleRemove(repo)">🗑️</button>
                            </el-tooltip>
                        </div>
                    </div>
                </div>
            </template>

            <!-- 非默认源：Catalog APP 列表 -->
            <template v-else>
                <div v-if="catalogStore.error && !catalogStore.fromCache" class="catalog-error">
                    <el-result icon="error" :title="$t('catalog.fetchFailed')" :sub-title="catalogStore.error">
                        <template #extra>
                            <el-button type="primary" @click="catalogStore.setActiveSource(catalogStore.currentSourceId)">
                                {{ $t('catalog.retry') }}
                            </el-button>
                        </template>
                    </el-result>
                </div>

                <div v-else-if="!catalogStore.loading && catalogStore.filteredApps.length === 0" class="catalog-empty">
                    <el-empty :description="$t('catalog.empty')" />
                </div>

                <div v-else class="catalog-grid">
                    <div v-for="app in catalogStore.filteredApps" :key="app.repo" class="repo-card catalog-card">
                        <img v-if="app.logo" :src="app.logo" class="repo-logo" alt="logo" />
                        <div v-else class="repo-logo-placeholder">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" width="26" height="26"><rect x="3" y="3" width="18" height="18" rx="4" /><path d="M9 9h6v6H9z" /></svg>
                        </div>
                        <div class="repo-info">
                            <div class="repo-header-row">
                                <span class="catalog-app-name" @click="openCatalogAppReadme(app)" :title="$t('catalog.viewReadme')">{{ app.name }}</span>
                                <el-tag v-if="reposStore.getInstallState(app.repo).installed && reposStore.getInstallState(app.repo).toUpdate" type="warning" size="small" effect="light">{{ $t('repos.hasUpdate') }}</el-tag>
                                <el-tag v-else-if="reposStore.getInstallState(app.repo).installed" type="success" size="small" effect="light">{{ $t('repos.installed') }}</el-tag>
                                <el-tag v-else size="small" :type="statusType(app.status)" effect="light" round>{{ statusLabel(app.status) }}</el-tag>
                            </div>
                            <div class="catalog-desc">{{ catalogStore.matchLang(app) }}</div>
                            <div class="repo-meta-row catalog-meta">
                                <span v-if="app.appVersion" class="meta-chip">v{{ app.appVersion }}</span>
                                <span v-if="app.category" class="meta-chip">{{ app.category }}</span>
                                <span class="meta-chip" v-if="app.stars != null">★ {{ formatNumber(app.stars) }}</span>
                                <span class="meta-chip" v-if="app.forks != null">⑂ {{ formatNumber(app.forks) }}</span>
                                <span v-if="app.license" class="meta-chip">{{ app.license }}</span>
                                <span v-if="app.lastCommitAt" class="meta-chip" :title="$t('catalog.lastCommit')">
                                    {{ formatDate(app.lastCommitAt) }}
                                </span>
                                <span v-if="reposStore.getInstallState(app.repo).installed && reposStore.getInstallState(app.repo).installedVersion" class="meta-chip">
                                    {{ $t('repos.installedVersion') }}: v{{ reposStore.getInstallState(app.repo).installedVersion }}
                                </span>
                            </div>
                            <div v-if="app.tags && app.tags.length" class="catalog-tags-row">
                                <el-tag v-for="tag in app.tags.slice(0, 4)" :key="tag" size="small" type="info" effect="plain" round>{{ tag }}</el-tag>
                            </div>
                            <div v-if="reposStore.installProgress[app.repo] !== undefined && reposStore.installing[app.repo]" class="install-progress-mini">
                                <el-progress :percentage="reposStore.installProgress[app.repo]" :stroke-width="6" :show-text="false" />
                                <span class="install-progress-label">{{ reposStore.installProgress[app.repo] }}%</span>
                            </div>
                            <div class="repo-actions">
                                <el-tooltip v-if="!reposStore.getInstallState(app.repo).installed || reposStore.getInstallState(app.repo).toUpdate" :content="reposStore.getInstallState(app.repo).toUpdate ? $t('apps.update') : $t('repos.install')" placement="top">
                                    <button
                                        class="icon-btn install-btn"
                                        :disabled="reposStore.installing[app.repo]"
                                        @click="handleInstallFromCatalog(app)"
                                    >
                                        <span v-if="reposStore.installing[app.repo]" class="mini-spinner"></span>
                                        <span v-else-if="reposStore.getInstallState(app.repo).toUpdate">🔄</span>
                                        <span v-else>⬇️</span>
                                    </button>
                                </el-tooltip>
                                <el-tooltip :content="$t('catalog.viewReadme')" placement="top">
                                    <button class="icon-btn readme-btn" @click="openCatalogAppReadme(app)">📄</button>
                                </el-tooltip>
                                <el-tooltip content="GitHub" placement="top">
                                    <button class="icon-btn github-btn" @click="openExternal(app.repo)" aria-label="GitHub">
                                        <svg viewBox="0 0 24 24" fill="currentColor" width="16" height="16"><path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z"/></svg>
                                    </button>
                                </el-tooltip>
                            </div>
                        </div>
                    </div>
                </div>

                <div v-if="catalogStore.currentMeta || catalogStore.fromCache || catalogStore.partialFailed" class="catalog-footer">
                    <span v-if="catalogStore.fromCache" class="cache-hint-text">{{ $t('catalog.usingCache') }}</span>
                    <span v-if="catalogStore.partialFailed" class="cache-hint-text">{{ $t('catalog.partialFailed') }}</span>
                    <span v-if="catalogStore.currentMeta">{{ $t('catalog.totalApps', { count: catalogStore.currentMeta.totalApps || catalogStore.currentApps.length }) }}</span>
                    <span v-if="catalogStore.currentMeta && catalogStore.currentMeta.lastRefresh">
                        {{ $t('catalog.lastRefresh') }}: {{ new Date(catalogStore.currentMeta.lastRefresh).toLocaleString() }}
                    </span>
                </div>
            </template>
        </div>

        <!-- 添加仓库对话框 -->
        <el-dialog v-model="showAddDialog" :title="$t('repos.add')" width="520px">
            <el-form @submit.prevent="handleAdd">
                <el-form-item>
                    <el-input
                        v-model="addForm.url"
                        :placeholder="$t('repos.addUrlHint')"
                        @keyup.enter="handleAdd"
                    />
                </el-form-item>
                <div class="dialog-hint">
                    {{ $t('repos.addHint') }}
                </div>
            </el-form>
            <template #footer>
                <el-button @click="showAddDialog = false">{{ $t('common.cancel') }}</el-button>
                <el-button type="primary" :loading="adding" @click="handleAdd">{{ $t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <!-- 添加数据源对话框 -->
        <el-dialog v-model="showAddSourceDialog" :title="$t('catalog.addSource')" width="520px">
            <el-form @submit.prevent="handleAddSource">
                <el-form-item :label="$t('catalog.sourceName')">
                    <el-input v-model="sourceForm.name" :placeholder="$t('catalog.sourceNamePlaceholder')" />
                </el-form-item>
                <el-form-item :label="$t('catalog.sourceUrl')">
                    <el-input v-model="sourceForm.url" :placeholder="$t('catalog.sourceUrlPlaceholder')" />
                </el-form-item>
            </el-form>
            <template #footer>
                <el-button @click="showAddSourceDialog = false">{{ $t('common.cancel') }}</el-button>
                <el-button type="primary" :loading="addingSource" @click="handleAddSource">{{ $t('common.confirm') }}</el-button>
            </template>
        </el-dialog>

        <!-- README 抽屉（仓库与 Catalog APP 共用） -->
        <el-drawer
            v-model="showReadmeDrawer"
            direction="rtl"
            size="600px"
            :with-header="false"
            class="readme-drawer"
        >
            <div class="readme-header">
                <el-button
                    v-if="readmeHistory.length > 0"
                    text
                    size="small"
                    class="readme-back-btn"
                    @click="readmeBack"
                >
                    ← {{ $t('common.back') }}
                </el-button>
                <span class="readme-header-title" :title="readmeTitle">{{ readmeTitle }}</span>
                <el-button text size="small" class="readme-close-btn" @click="closeReadme">✕</el-button>
            </div>
            <div class="readme-container" @click="onReadmeClick">
                <div v-if="readmeLoading" class="readme-loading">
                    <span>{{ $t('repos.readmeLoading') }}</span>
                </div>
                <div v-else-if="readmeError" class="readme-error">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="20" height="20"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    <span>{{ readmeError }}</span>
                </div>
                <div v-else-if="readmeContent" class="readme-content markdown-body" v-html="renderedReadme" />
                <div v-else class="readme-empty">
                    <el-empty :description="$t('repos.readmeEmpty')" />
                </div>
            </div>
        </el-drawer>
    </div>
</template>

<style scoped>
.view-container {
    display: flex;
    flex-direction: column;
    height: 100%;
    background: var(--el-bg-color-page);
}

.view-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 16px 24px;
    background: var(--el-bg-color);
    border-bottom: 1px solid var(--el-border-color-lighter);
}

.view-title {
    margin: 0;
    font-size: 18px;
    font-weight: 600;
    color: var(--el-text-color-primary);
}

.header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
}

.source-select {
    width: 180px;
}

.sort-select {
    width: 150px;
}

.source-option {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 8px;
}

.source-badge {
    font-size: 11px;
    color: var(--el-color-info);
    background: var(--el-fill-color);
    padding: 0 6px;
    border-radius: 8px;
}

.source-delete {
    border: none;
    background: transparent;
    color: var(--el-text-color-secondary);
    font-size: 18px;
    line-height: 1;
    cursor: pointer;
    padding: 0 4px;
    border-radius: 4px;
}
.source-delete:hover {
    color: var(--el-color-danger);
    background: var(--el-fill-color);
}

.repo-list {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 12px;
    align-content: start;
}

.catalog-grid {
    grid-column: 1 / -1;
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
    gap: 12px;
    align-content: start;
}

.repo-card {
    display: flex;
    gap: 14px;
    padding: 16px;
    background: var(--el-fill-color-light);
    border-radius: 12px;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
    transition: box-shadow 0.2s;
}

.repo-card:hover {
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
}

.repo-logo {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    object-fit: contain;
    background: var(--el-bg-color);
    flex-shrink: 0;
}

.repo-logo-placeholder {
    width: 56px;
    height: 56px;
    border-radius: 12px;
    background: var(--el-color-primary-light-9);
    display: flex;
    align-items: center;
    justify-content: center;
    color: var(--el-color-primary);
    flex-shrink: 0;
}

.repo-info {
    flex: 1;
    min-width: 0;
}

.repo-header-row {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-bottom: 4px;
}

.repo-name {
    font-size: 15px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.repo-url {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.repo-meta-row {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 8px;
    margin-bottom: 8px;
}

.platform-badges {
    display: flex;
    gap: 6px;
}

.platform-badge {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: var(--el-text-color-secondary);
}

.meta-chip {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    background: var(--el-fill-color);
    padding: 2px 8px;
    border-radius: 10px;
}

.repo-error {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    color: var(--el-color-danger);
    margin-bottom: 8px;
    padding: 6px 10px;
    background: var(--el-color-danger-light-9);
    border-radius: 6px;
}

.install-progress-mini {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
}

.install-progress-mini :deep(.el-progress) {
    flex: 1;
}

.install-progress-label {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    min-width: 36px;
    text-align: right;
}

.repo-actions {
    display: flex;
    gap: 8px;
    flex-wrap: wrap;
}

/* 图标按钮（与 AppsView 保持一致，避免多语言下文字按钮拉宽） */
.icon-btn {
    width: 32px;
    height: 32px;
    border: none;
    background: var(--el-fill-color);
    border-radius: 6px;
    cursor: pointer;
    font-size: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.2s;
    padding: 0;
    line-height: 1;
}

.icon-btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.1);
}

.icon-btn:active {
    transform: translateY(0);
}

.icon-btn:disabled {
    cursor: not-allowed;
    opacity: 0.7;
    transform: none;
    box-shadow: none;
}

.install-btn:hover { background: var(--el-color-success-light-9); }
.sync-btn:hover { background: var(--el-color-primary-light-9); }
.launch-btn:hover { background: var(--el-color-success-light-9); }
.readme-btn:hover { background: var(--el-color-primary-light-9); }
.github-btn:hover { background: var(--el-color-primary-light-9); }
.delete-btn:hover { background: var(--el-color-danger-light-9); }

/* 小型旋转 spinner（安装/同步中） */
.mini-spinner {
    display: inline-block;
    width: 14px;
    height: 14px;
    border: 2px solid var(--el-color-primary-light-5);
    border-top-color: var(--el-color-primary);
    border-radius: 50%;
    animation: repo-mini-spin 0.8s linear infinite;
}

@keyframes repo-mini-spin {
    to { transform: rotate(360deg); }
}

.catalog-desc {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-bottom: 8px;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    line-height: 1.5;
}

.catalog-meta {
    margin-bottom: 6px;
}

.catalog-tags-row {
    display: flex;
    gap: 4px;
    flex-wrap: wrap;
    margin-bottom: 8px;
}

.catalog-app-name {
    cursor: pointer;
    color: var(--el-text-color-primary);
    font-weight: 600;
}
.catalog-app-name:hover {
    color: var(--el-color-primary);
    text-decoration: underline;
}

.catalog-footer {
    grid-column: 1 / -1;
    display: flex;
    justify-content: space-between;
    padding: 8px 4px;
    font-size: 12px;
    color: var(--el-text-color-secondary);
}

.cache-hint-text {
    color: var(--el-text-color-secondary);
    font-size: 12px;
}

.catalog-error,
.catalog-empty {
    grid-column: 1 / -1;
}

.add-source-btn {
    margin-left: 8px;
}

.dialog-hint {
    font-size: 12px;
    color: var(--el-text-color-secondary);
    margin-top: -8px;
    line-height: 1.6;
}

.readme-header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 12px 12px 12px 16px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    flex-shrink: 0;
}

:deep(.readme-drawer .el-drawer__body) {
    padding: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
}

.readme-header-title {
    flex: 1;
    font-size: 14px;
    font-weight: 600;
    color: var(--el-text-color-primary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
}

.readme-back-btn {
    flex-shrink: 0;
}

.readme-close-btn {
    flex-shrink: 0;
}

.readme-container {
    padding: 0 20px 20px;
    flex: 1;
    overflow-y: auto;
}

.readme-loading,
.readme-error,
.readme-empty {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    padding: 40px;
    color: var(--el-text-color-secondary);
}

.readme-error {
    color: var(--el-color-danger);
}

.readme-content {
    font-size: 14px;
    line-height: 1.7;
    color: var(--el-text-color-primary);
}

.readme-content :deep(h1),
.readme-content :deep(h2),
.readme-content :deep(h3) {
    margin-top: 24px;
    margin-bottom: 12px;
}

.readme-content :deep(code) {
    background: var(--el-fill-color);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 13px;
}

.readme-content :deep(pre) {
    background: var(--el-fill-color);
    padding: 12px;
    border-radius: 8px;
    overflow-x: auto;
}

.readme-content :deep(img) {
    max-width: 100%;
}

.readme-content :deep(a) {
    color: var(--el-color-primary);
    cursor: pointer;
    text-decoration: none;
}

.readme-content :deep(a:hover) {
    text-decoration: underline;
}

/* ====== Ctrl+F 搜索浮层 ====== */
.search-overlay {
    position: absolute;
    inset: 0;
    z-index: 100;
    background: rgba(0, 0, 0, 0.35);
    display: flex;
    flex-direction: column;
    align-items: center;
    padding-top: 48px;
}

.search-bar {
    display: flex;
    gap: 8px;
    width: 720px;
    max-width: 90%;
    background: var(--el-bg-color);
    padding: 12px;
    border-radius: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.search-bar .el-input {
    flex: 1;
}

.search-bar .el-select {
    width: 150px;
}

.search-results {
    width: 720px;
    max-width: 90%;
    margin-top: 16px;
    max-height: calc(100% - 120px);
    overflow-y: auto;
    background: var(--el-bg-color);
    border-radius: 12px;
    padding: 12px;
    box-shadow: 0 8px 32px rgba(0, 0, 0, 0.2);
}

.search-empty {
    padding: 24px;
}

.search-group + .search-group {
    margin-top: 16px;
}

.search-group-title {
    font-size: 13px;
    font-weight: 600;
    color: var(--el-text-color-secondary);
    padding: 4px 8px 8px;
    border-bottom: 1px solid var(--el-border-color-lighter);
    margin-bottom: 8px;
}

.search-grid {
    display: grid;
    grid-template-columns: 1fr;
    padding: 0;
    gap: 8px;
}

.search-grid .repo-card {
    padding: 12px;
    box-shadow: none;
    background: var(--el-fill-color-blank);
    border: 1px solid var(--el-border-color-lighter);
}
</style>
