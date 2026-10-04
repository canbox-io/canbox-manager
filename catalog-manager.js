/**
 * canbox-manager — Catalog 拉取与缓存模块
 *
 * 在主进程执行 Catalog 网络拉取、ETag 条件请求、分片文件缓存与降级。
 * 渲染进程通过 IPC 调用，不在渲染层做文件 I/O。
 *
 * 缓存结构（{userData}/cache/catalogs/<sourceId>/）：
 *   catalog.json        索引缓存
 *   shard-XXX.json      展示数据分片缓存
 *   cache-meta.json     缓存元信息（lastRefresh、各分片 ETag 等）
 *
 * 数据源配置持久化在 canbox-manager store 的 catalogSources 键中。
 */

const fs = require('fs');
const path = require('path');
const axios = require('axios');
// 平台解析复用 repo-probe（平台差异集中在 parseRepo / getRawUrl / getWebBaseUrl）
// GITHUB_MIRRORS 用于 raw.githubusercontent.com 被墙时的镜像兜底
const { parseRepo, getRawUrl, getRepoContext, GITHUB_MIRRORS } = require('./repo-probe');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0';
const REQUEST_TIMEOUT = 20000;
const CATALOG_SCHEMA_VERSION = 2;
const MAX_SHARDS_WARN = 20;

// 通过 canbox-core 注入的 logger（log4js），写入 {usersPath}/logs/canbox.log
// 若 logger 未初始化（如开发环境直接 require），降级为 console。
// 注意：不在模块加载时获取，而是每次使用时动态获取——logger.init() 在 app.whenReady() 后异步执行
function _getLogger() {
    try {
        const corePath = global.__CANBOX_CORE_PATH__;
        if (!corePath) return console;
        const loggerModule = require(path.join(corePath, 'lib', 'logger'));
        return loggerModule.get() || console;
    } catch (_) {
        return console;
    }
}
const logger = {
    info: (...args) => _getLogger().info(...args),
    warn: (...args) => _getLogger().warn(...args),
    error: (...args) => _getLogger().error(...args)
};

const BUILTIN_SOURCES = [
    {
        id: 'github-official',
        name: 'GitHub 官方',
        url: 'https://raw.githubusercontent.com/canbox-io/canbox-catalog-data/main',
        builtin: true,
        platform: 'github'
    }
];

let managerStore = null;

function bind(store) {
    managerStore = store;
}

// 由 main.js 注入 userData，避免直接依赖 electron app
let userDataPath = null;
function setUserData(p) {
    userDataPath = p;
}

function getCacheRoot() {
    return path.join(userDataPath, 'cache', 'catalogs');
}

function getCacheDir(sourceId) {
    return path.join(getCacheRoot(), sourceId);
}

function getCustomSources() {
    if (!managerStore) return [];
    const list = managerStore.get('catalogSources');
    return Array.isArray(list) ? list : [];
}

function saveCustomSources(list) {
    if (managerStore) managerStore.set('catalogSources', list);
}

function listSources() {
    const custom = getCustomSources().map(s => ({ ...s, builtin: false }));
    return [...BUILTIN_SOURCES, ...custom];
}

function getSource(sourceId) {
    return listSources().find(s => s.id === sourceId) || null;
}

function addCustomSource(name, url) {
    const trimmedName = (name || '').trim();
    let baseUrl = (url || '').trim();
    if (!trimmedName) return { success: false, error: '名称不能为空' };
    if (!baseUrl) return { success: false, error: '地址不能为空' };
    if (!/^https?:\/\//i.test(baseUrl)) return { success: false, error: '地址必须以 http(s):// 开头' };
    if (baseUrl.endsWith('/catalog.json')) baseUrl = baseUrl.slice(0, -'/catalog.json'.length);
    if (baseUrl.endsWith('/')) baseUrl = baseUrl.slice(0, -1);

    const all = listSources();
    if (all.some(s => s.url === baseUrl)) return { success: false, error: '该数据源地址已存在' };

    const id = `custom-${Date.now()}`;
    const source = { id, name: trimmedName, url: baseUrl };
    const custom = getCustomSources();
    custom.push(source);
    saveCustomSources(custom);
    return { success: true, source: { ...source, builtin: false } };
}

function removeSource(sourceId) {
    const custom = getCustomSources();
    const exists = custom.some(s => s.id === sourceId);
    if (!exists) return { success: false, error: '数据源不存在或为内置源' };
    saveCustomSources(custom.filter(s => s.id !== sourceId));
    // 不主动删除缓存目录，保留以便用户重新添加时复用
    return { success: true };
}

function ensureDir(dir) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}

function readJsonSafe(file) {
    try {
        if (!fs.existsSync(file)) return null;
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        return null;
    }
}

function writeJsonSafe(file, data) {
    ensureDir(path.dirname(file));
    fs.writeFileSync(file, JSON.stringify(data, null, 2), 'utf-8');
}

function readCacheMeta(sourceId) {
    return readJsonSafe(path.join(getCacheDir(sourceId), 'cache-meta.json'));
}

function writeCacheMeta(sourceId, meta) {
    writeJsonSafe(path.join(getCacheDir(sourceId), 'cache-meta.json'), meta);
}

/**
 * 构建某 URL 的候选线路：直连优先；若为 raw.githubusercontent.com 则追加镜像兜底。
 * raw.githubusercontent.com 在国内常被墙，github.com 又会被 302 回该域名，故只能用第三方镜像。
 * @param {string} url
 * @returns {Array<{name:string,url:string}>}
 */
function buildUrlCandidates(url) {
    const list = [{ name: 'direct', url }];
    try {
        const u = new URL(url);
        if (u.hostname === 'raw.githubusercontent.com') {
            for (const m of GITHUB_MIRRORS) {
                list.push({ name: m.name, url: `${m.url}/${url}` });
            }
        }
    } catch (_) { /* URL 非法，仅直连 */ }
    return list;
}

// 最近一次成功的线路名，用于后续请求优先复用，避免每次都先撞直连超时
let lastGoodRoute = null;

function orderCandidates(candidates, preferred) {
    if (!preferred) return candidates;
    const idx = candidates.findIndex(c => c.name === preferred);
    if (idx <= 0) return candidates;
    return [candidates[idx], ...candidates.slice(0, idx), ...candidates.slice(idx + 1)];
}

/**
 * 发起带 ETag/Last-Modified 的 GET JSON 请求，按候选线路依次重试
 * @returns {{status:number, data?:any, etag?:string, lastModified?:string, route:string}}
 */
async function httpGetJson(url, headers = {}) {
    const candidates = orderCandidates(buildUrlCandidates(url), lastGoodRoute);
    let lastErr = null;
    for (const cand of candidates) {
        try {
            const res = await axios.get(cand.url, {
                timeout: REQUEST_TIMEOUT,
                headers: { 'User-Agent': UA, ...headers },
                validateStatus: s => s >= 200 && s < 400,
                transformResponse: [d => d]
            });
            lastGoodRoute = cand.name;
            if (cand.name !== 'direct') {
                logger.info('[catalog] httpGetJson: 经镜像 %s 访问成功 url=%s', cand.name, url);
            }
            if (res.status === 304) {
                return { status: 304, etag: res.headers.etag, lastModified: res.headers['last-modified'], route: cand.name };
            }
            let data = null;
            try {
                data = JSON.parse(res.data);
            } catch (e) {
                throw new Error('返回内容不是合法的 JSON');
            }
            return {
                status: 200,
                data,
                etag: res.headers.etag,
                lastModified: res.headers['last-modified'],
                route: cand.name
            };
        } catch (e) {
            lastErr = e;
            logger.info('[catalog] httpGetJson: 线路 %s 失败 url=%s error=%s', cand.name, url, e.code || e.message || e);
        }
    }
    throw lastErr || new Error('所有线路均失败');
}

/**
 * 从缓存读取合并后的 APP 列表（无网络请求）
 */
function readCachedCatalog(sourceId) {
    const meta = readCacheMeta(sourceId);
    if (!meta) return { cached: false, apps: [], meta: null };
    const apps = [];
    let partialFailed = false;
    for (const shard of meta.shards || []) {
        const shardData = readJsonSafe(path.join(getCacheDir(sourceId), shard.file));
        if (shardData && Array.isArray(shardData.apps)) {
            apps.push(...shardData.apps);
        } else {
            partialFailed = true;
        }
    }
    return { cached: true, apps, meta, partialFailed };
}

/**
 * 拉取 Catalog（先索引，再并行拉取分片），带 ETag 与缓存降级。
 * @param {string} sourceId
 * @param {{force?:boolean}} options
 */
async function fetchCatalog(sourceId, options = {}) {
    const force = !!options.force;
    const source = getSource(sourceId);
    if (!source) throw new Error('数据源不存在');

    logger.info('[catalog] fetchCatalog: start sourceId=%s force=%s url=%s', sourceId, force, source.url);

    const baseUrl = source.url;
    const cacheDir = getCacheDir(sourceId);
    ensureDir(cacheDir);
    const prevMeta = readCacheMeta(sourceId);

    let catalog;
    let catalogEtag;
    let catalogLastModified;
    let usedCachedCatalog = false;

    try {
        const catalogHeaders = {};
        if (!force && prevMeta && prevMeta.catalogEtag) {
            catalogHeaders['If-None-Match'] = prevMeta.catalogEtag;
        } else if (!force && prevMeta && prevMeta.catalogLastModified) {
            catalogHeaders['If-Modified-Since'] = prevMeta.catalogLastModified;
        }
        const res = await httpGetJson(`${baseUrl}/catalog.json`, catalogHeaders);
        if (res.status === 304) {
            catalog = readJsonSafe(path.join(cacheDir, 'catalog.json'));
            if (!catalog) {
                // 缓存文件意外丢失，退化为强制拉取
                const fresh = await httpGetJson(`${baseUrl}/catalog.json`);
                if (fresh.status !== 200) throw new Error('catalog.json 拉取失败');
                catalog = fresh.data;
                catalogEtag = fresh.etag;
                catalogLastModified = fresh.lastModified;
                writeJsonSafe(path.join(cacheDir, 'catalog.json'), catalog);
            } else {
                usedCachedCatalog = true;
                catalogEtag = prevMeta.catalogEtag;
                catalogLastModified = prevMeta.catalogLastModified;
            }
        } else {
            catalog = res.data;
            catalogEtag = res.etag;
            catalogLastModified = res.lastModified;
            writeJsonSafe(path.join(cacheDir, 'catalog.json'), catalog);
        }
    } catch (e) {
        // 索引拉取失败：降级到本地缓存
        const cached = readCachedCatalog(sourceId);
        const errText = e.code || e.message || String(e);
        if (!cached.cached) {
            logger.error('[catalog] fetchCatalog: 索引拉取失败且无本地缓存 sourceId=%s error=%s', sourceId, errText);
            throw new Error(`拉取失败且无本地缓存：${errText}`);
        }
        logger.error('[catalog] fetchCatalog: 索引拉取失败，降级本地缓存 sourceId=%s lastRefresh=%s error=%s',
            sourceId, (cached.meta && cached.meta.lastRefresh) || 'unknown', errText);
        return {
            success: true,
            fromCache: true,
            stale: true,
            partialFailed: cached.partialFailed,
            apps: cached.apps,
            meta: cached.meta,
            source,
            error: errText
        };
    }

    if (!catalog || typeof catalog !== 'object' || !Array.isArray(catalog.shards)) {
        throw new Error('catalog.json 格式无效');
    }
    if (catalog.schemaVersion !== CATALOG_SCHEMA_VERSION) {
        throw new Error(`数据格式版本不兼容（需要 v${CATALOG_SCHEMA_VERSION}，得到 v${catalog.schemaVersion}）`);
    }

    const tooManyShards = catalog.totalShards > MAX_SHARDS_WARN;

    // 并行拉取各分片（带 ETag 条件请求）
    const prevShardMap = {};
    for (const s of (prevMeta && prevMeta.shards) || []) prevShardMap[s.id] = s;

    const shardResults = await Promise.all((catalog.shards || []).map(async (shard) => {
        const shardUrl = `${baseUrl}/${shard.file}`;
        const shardFile = path.join(cacheDir, shard.file);
        const prevShard = prevShardMap[shard.id];
        try {
            const headers = {};
            if (!force && prevShard && prevShard.etag) {
                headers['If-None-Match'] = prevShard.etag;
            } else if (!force && prevShard && prevShard.lastModified) {
                headers['If-Modified-Since'] = prevShard.lastModified;
            }
            const res = await httpGetJson(shardUrl, headers);
            if (res.status === 304) {
                const cached = readJsonSafe(shardFile);
                if (cached) {
                    return {
                        id: shard.id,
                        file: shard.file,
                        appCount: cached.apps ? cached.apps.length : 0,
                        etag: prevShard && prevShard.etag,
                        lastModified: prevShard && prevShard.lastModified,
                        apps: cached.apps || [],
                        unchanged: true
                    };
                }
                // 缓存丢失，强制重新拉
                const fresh = await httpGetJson(shardUrl);
                if (fresh.status !== 200) throw new Error('分片拉取失败');
                writeJsonSafe(shardFile, fresh.data);
                return {
                    id: shard.id,
                    file: shard.file,
                    appCount: fresh.data.apps ? fresh.data.apps.length : 0,
                    etag: fresh.etag,
                    lastModified: fresh.lastModified,
                    apps: fresh.data.apps || []
                };
            }
            writeJsonSafe(shardFile, res.data);
            return {
                id: shard.id,
                file: shard.file,
                appCount: res.data.apps ? res.data.apps.length : 0,
                etag: res.etag,
                lastModified: res.lastModified,
                apps: res.data.apps || []
            };
        } catch (e) {
            // 分片失败：尝试用本地缓存，仅标记部分失败
            const cached = readJsonSafe(shardFile);
            logger.error('[catalog] fetchCatalog: 分片 %s 拉取失败 sourceId=%s error=%s hasCache=%s',
                shard.file, sourceId, e.message, !!cached);
            if (cached) {
                return {
                    id: shard.id,
                    file: shard.file,
                    appCount: cached.apps ? cached.apps.length : 0,
                    etag: prevShard && prevShard.etag,
                    lastModified: prevShard && prevShard.lastModified,
                    apps: cached.apps || [],
                    failed: true
                };
            }
            return { id: shard.id, file: shard.file, appCount: 0, apps: [], failed: true };
        }
    }));

    const apps = [];
    let partialFailed = false;
    const shardMetas = shardResults.map(s => {
        if (s.failed) partialFailed = true;
        apps.push(...s.apps);
        return {
            id: s.id,
            file: s.file,
            appCount: s.appCount,
            etag: s.etag || null,
            lastModified: s.lastModified || null
        };
    });

    const now = new Date().toISOString();
    const nextRefresh = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const meta = {
        version: 1,
        sourceId,
        lastRefresh: now,
        nextRefresh,
        catalogSchemaVersion: catalog.schemaVersion,
        totalApps: catalog.totalApps,
        totalShards: catalog.totalShards,
        sourceName: catalog.sourceName || source.name,
        source: catalog.source || null,
        catalogEtag,
        catalogLastModified,
        shards: shardMetas
    };
    writeCacheMeta(sourceId, meta);

    logger.info('[catalog] fetchCatalog: done sourceId=%s apps=%d shards=%d partialFailed=%s catalogUnchanged=%s route=%s',
        sourceId, apps.length, shardMetas.length, partialFailed, usedCachedCatalog, lastGoodRoute);

    return {
        success: true,
        fromCache: false,
        catalogUnchanged: usedCachedCatalog,
        partialFailed,
        tooManyShards,
        apps,
        meta,
        source
    };
}

/**
 * 按平台构造 raw URL 拉取文本文件（平台差异由 repo-probe.getRawUrl 承担）
 * @returns {Promise<string|null>} 200 时返回文本，其余返回 null
 */
async function fetchRawText(repoUrl, branch, filePath) {
    const url = getRawUrl(repoUrl, branch, filePath);
    const candidates = orderCandidates(buildUrlCandidates(url), lastGoodRoute);
    let lastErr = null;
    for (const cand of candidates) {
        try {
            const res = await axios.get(cand.url, {
                timeout: REQUEST_TIMEOUT,
                headers: { 'User-Agent': UA },
                responseType: 'text',
                transformResponse: [d => d],
                validateStatus: s => s >= 200 && s < 400
            });
            lastGoodRoute = cand.name;
            return res.status === 200 ? res.data : null;
        } catch (e) {
            lastErr = e;
        }
    }
    throw lastErr || new Error('请求失败');
}

/**
 * 获取仓库 README.md（main → master 回退），返回 markdown 原文。
 * 返回体带平台归一化字段：platform / owner / repo / branch / rawBase / webBase
 */
async function getReadme(repoUrl) {
    const info = parseRepo(repoUrl);
    if (!info) throw new Error('仓库地址无效');
    const branches = ['main', 'master'];
    let lastError = null;
    for (const branch of branches) {
        try {
            const text = await fetchRawText(repoUrl, branch, 'README.md');
            if (text !== null) {
                const ctx = getRepoContext(repoUrl, branch);
                return {
                    success: true,
                    readme: text,
                    repoName: `${info.owner}/${info.repo}`,
                    ...ctx
                };
            }
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(lastError ? `README 获取失败：${lastError.message}` : 'README 获取失败');
}

/**
 * 获取仓库内指定分支/路径的 markdown 文件（用于 README 中的相对链接跳转）。
 * 若未指定 branch，则依次尝试 main、master。
 * 返回体同 getReadme，带 platform / rawBase / webBase。
 */
async function getRepoMarkdown(repoUrl, filePath, branch) {
    const info = parseRepo(repoUrl);
    if (!info) throw new Error('仓库地址无效');
    const cleanPath = String(filePath || '').replace(/^\/+/, '');
    if (!cleanPath) throw new Error('文件路径无效');
    const branches = [];
    if (branch) branches.push(branch);
    for (const b of ['main', 'master']) {
        if (!branches.includes(b)) branches.push(b);
    }
    let lastError = null;
    for (const b of branches) {
        try {
            const text = await fetchRawText(repoUrl, b, cleanPath);
            if (text !== null) {
                const ctx = getRepoContext(repoUrl, b);
                return {
                    success: true,
                    readme: text,
                    repoName: `${info.owner}/${info.repo}`,
                    path: cleanPath,
                    ...ctx
                };
            }
        } catch (e) {
            lastError = e;
        }
    }
    throw new Error(lastError ? `文档获取失败：${lastError.message}` : '文档获取失败');
}

module.exports = {
    bind,
    setUserData,
    listSources,
    getSource,
    addCustomSource,
    removeSource,
    readCachedCatalog,
    readCacheMeta,
    fetchCatalog,
    getReadme,
    getRepoMarkdown
};