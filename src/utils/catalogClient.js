/**
 * canbox-manager — Catalog 拉取客户端（渲染进程薄封装）
 *
 * 仅做 IPC 透传：真正的网络请求、ETag 缓存、分片并行与降级逻辑
 * 都在主进程 catalog-manager.js 中完成。
 */

const api = window.api.manager;

export function listSources() {
    return api.catalogListSources();
}

export function addSource(name, url) {
    return api.catalogAddSource(name, url);
}

export function removeSource(sourceId) {
    return api.catalogRemoveSource(sourceId);
}

/**
 * 拉取 Catalog（主进程内完成索引+分片拉取、ETag、降级）
 * @param {string} sourceId
 * @param {{force?:boolean}} [options]
 */
export function fetchCatalog(sourceId, options = {}) {
    return api.catalogFetch(sourceId, options);
}

export function getCache(sourceId) {
    return api.catalogGetCache(sourceId);
}

export function getReadme(repoUrl) {
    return api.catalogGetReadme(repoUrl);
}

export function getRepoMarkdown(repoUrl, filePath, branch) {
    return api.catalogGetRepoMarkdown(repoUrl, filePath, branch);
}

export default {
    listSources,
    addSource,
    removeSource,
    fetchCatalog,
    getCache,
    getReadme,
    getRepoMarkdown
};
