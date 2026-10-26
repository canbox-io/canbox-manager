/**
 * canbox-manager — 仓库探测模块
 *
 * 通过 HTTP raw 方式探测 git 仓库内的 APP 元数据（package.json / logo / README），
 * 不 clone 整个仓库。支持 GitHub / Gitee / GitLab 及兼容平台。
 *
 * Release 下载通过平台 API 获取资产 URL，确保 GitHub / Gitee 都能正确下载。
 *
 * 国内网络兜底：凡 github.com / raw.githubusercontent.com / api.github.com 的请求，
 * 均「直连优先 + 第三方镜像兜底」，直连可达时不触发镜像，对用户与开发者透明。
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');
const { normalizeCategory } = require(path.join(global.__CANBOX_CORE_PATH__, 'lib', 'category'));

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

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0';
const TIMEOUT = 15000;

// GitHub 第三方镜像列表（国内直连 GitHub 被墙时的兜底线路，对用户透明）
const GITHUB_MIRRORS = [
    { name: 'ghfast', url: 'https://ghfast.top' },
    { name: 'ghproxy-net', url: 'https://ghproxy.net' },
    { name: 'gh-proxy', url: 'https://gh-proxy.com' }
];

// 需要镜像兜底的 GitHub 域名（raw / api 域名国内常被墙，github.com 又会被 302 回 raw 域名）
const GITHUB_MIRROR_HOSTS = new Set([
    'github.com',
    'www.github.com',
    'api.github.com',
    'raw.githubusercontent.com'
]);

/**
 * 构建某 URL 的候选线路：直连优先；GitHub 域名追加镜像兜底。
 * 直连可达时不会触发镜像，全程对用户透明。
 * @param {string} url
 * @returns {Array<{name:string,url:string}>}
 */
function buildUrlCandidates(url) {
    const list = [{ name: 'direct', url }];
    try {
        const u = new URL(url);
        if (GITHUB_MIRROR_HOSTS.has(u.hostname)) {
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
 * 归类网络错误：区分超时 / DNS / 连接失败，并回传 HTTP 状态码（若服务端有响应）
 * @returns {{statusCode:number|null, networkError:string|null}}
 */
function classifyNetworkError(e) {
    let networkError = 'network';
    if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
        networkError = 'timeout';
    } else if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
        networkError = 'dns';
    } else if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') {
        networkError = 'connection';
    }
    return {
        statusCode: (e.response && e.response.status) || null,
        networkError
    };
}

/**
 * 按候选线路依次请求（直连优先，GitHub 域名镜像兜底）。
 *
 * 策略：
 * - 首个成功响应即返回；成功后记住线路，后续请求优先复用（lastGoodRoute）
 * - 直连返回 HTTP 错误状态时视为权威结果（文件不存在 / 限流等），立即返回，不再试镜像
 * - 镜像返回 HTTP 错误状态时继续尝试其它线路（镜像可能不支持该路径）
 * - 传输层失败（被墙 / 超时 / DNS）时继续尝试下一线路
 * - 全部失败时：只要出现过传输层错误，就按网络错误上报（比镜像的 404 更贴近真实原因）
 *
 * @param {string} url 原始 URL
 * @param {Object} [opts] 透传给 axios 的配置（timeout / headers / responseType / transformResponse 等）
 * @returns {Promise<{resp:Object|null, statusCode:number|null, networkError:string|null}>}
 */
async function requestWithFallback(url, opts = {}) {
    const { timeout = TIMEOUT, headers: extraHeaders = {}, ...rest } = opts;
    const candidates = orderCandidates(buildUrlCandidates(url), lastGoodRoute);
    let firstHttp = null;   // 镜像返回的 HTTP 错误状态码（非权威，继续试其它线路）
    let firstNet = null;    // 传输层错误

    for (const cand of candidates) {
        try {
            const resp = await axios({
                method: 'get',
                ...rest,
                url: cand.url,
                timeout,
                headers: { 'User-Agent': UA, ...extraHeaders }
            });
            lastGoodRoute = cand.name;
            if (cand.name !== 'direct') {
                logger.info('[repo-probe] request: 经镜像 %s 访问成功 url=%s', cand.name, url);
            }
            return { resp, statusCode: resp.status, networkError: null };
        } catch (e) {
            if (e.response) {
                // 直连可达 → 返回的状态码是权威结果，直接返回，无需再试镜像
                if (cand.name === 'direct') {
                    logger.info('[repo-probe] request: direct HTTP %s url=%s', e.response.status, url);
                    return { resp: null, statusCode: e.response.status, networkError: null };
                }
                if (!firstHttp) firstHttp = { statusCode: e.response.status };
                logger.info('[repo-probe] request: mirror %s HTTP %s url=%s', cand.name, e.response.status, url);
                continue;
            }
            const info = classifyNetworkError(e);
            if (!firstNet) firstNet = info;
            logger.info('[repo-probe] request error via %s: %s (code=%s, networkError=%s) url=%s',
                cand.name, e.message, e.code, info.networkError, url);
        }
    }

    if (firstNet) {
        logger.warn('[repo-probe] request: all %d candidates failed (network) url=%s', candidates.length, url);
        return { resp: null, statusCode: firstNet.statusCode, networkError: firstNet.networkError };
    }
    logger.warn('[repo-probe] request: all %d candidates failed (http=%s) url=%s',
        candidates.length, firstHttp ? firstHttp.statusCode : '?', url);
    return { resp: null, statusCode: firstHttp ? firstHttp.statusCode : null, networkError: null };
}

/**
 * 规范化仓库 URL：去除末尾 .git 和多余斜杠
 */
function normalizeRepoUrl(repoUrl) {
    let url = repoUrl.trim();
    if (url.endsWith('.git')) url = url.slice(0, -4);
    if (url.endsWith('/')) url = url.slice(0, -1);
    return url;
}

/**
 * 从仓库 URL 提取 owner/repo 和平台信息
 * @returns {{host: string, owner: string, repo: string, platform: string}|null}
 */
function parseRepo(repoUrl) {
    try {
        const url = new URL(normalizeRepoUrl(repoUrl));
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts.length < 2) return null;
        const host = url.hostname;
        let platform = 'generic';
        if (host.includes('github.com')) platform = 'github';
        else if (host.includes('gitee.com')) platform = 'gitee';
        else if (host.includes('gitlab.com') || host.includes('gitlab.')) platform = 'gitlab';
        return { host, owner: parts[0], repo: parts[1], platform, raw: normalizeRepoUrl(repoUrl) };
    } catch (e) {
        return null;
    }
}

/**
 * 探测仓库默认分支
 * 优先用 git upload-pack info/refs，失败 fallback
 */
async function detectDefaultBranch(repoUrl) {
    const info = parseRepo(repoUrl);
    if (!info) {
        logger.info('[repo-probe] detectDefaultBranch: parseRepo failed, url=%s', repoUrl);
        return 'master';
    }
    const probeUrl = `${info.raw}/info/refs?service=git-upload-pack`;
    const { resp } = await requestWithFallback(probeUrl, {
        timeout: 10000,
        // info/refs 返回 git smart protocol 文本，必须禁用自动 JSON 解析
        transformResponse: [(data) => data]
    });
    if (resp) {
        const match = String(resp.data).match(/refs\/heads\/(\S+)/);
        if (match) {
            logger.info('[repo-probe] detectDefaultBranch: detected=%s url=%s', match[1], repoUrl);
            return match[1];
        }
        logger.info('[repo-probe] detectDefaultBranch: no branch match in info/refs, url=%s', probeUrl);
    } else {
        logger.info('[repo-probe] detectDefaultBranch: info/refs unavailable, url=%s', probeUrl);
    }
    const fallback = info.platform === 'github' ? 'main' : 'master';
    logger.info('[repo-probe] detectDefaultBranch: fallback=%s url=%s', fallback, repoUrl);
    return fallback;
}

/**
 * 构造 raw 文件 URL
 */
function getRawUrl(repoUrl, branch, file) {
    const info = parseRepo(repoUrl);
    if (!info) return `${normalizeRepoUrl(repoUrl)}/raw/${branch}/${file}`;
    switch (info.platform) {
        case 'github':
            return `https://raw.githubusercontent.com/${info.owner}/${info.repo}/${branch}/${file}`;
        case 'gitee':
            return `${info.raw}/raw/${branch}/${file}`;
        case 'gitlab':
            return `${info.raw}/-/raw/${branch}/${file}`;
        default:
            return `${info.raw}/raw/branch/${branch}/${file}`;
    }
}

/**
 * 构造仓库站点（web）文件浏览基址，用于 README 中非 markdown 相对链接的“在仓库打开”
 * 与 getRawUrl 对称：github /blob、gitee /blob、gitlab /-/blob
 */
function getWebBaseUrl(repoUrl, branch) {
    const info = parseRepo(repoUrl);
    if (!info) return `${normalizeRepoUrl(repoUrl)}/blob/${branch}`;
    switch (info.platform) {
        case 'github':
            return `https://github.com/${info.owner}/${info.repo}/blob/${branch}`;
        case 'gitee':
            return `https://gitee.com/${info.owner}/${info.repo}/blob/${branch}`;
        case 'gitlab':
            return `${info.raw}/-/blob/${branch}`;
        default:
            return `${info.raw}/blob/${branch}`;
    }
}

/**
 * 构造 README 渲染所需的平台归一化上下文
 * rawBase 用于图片等相对资源，webBase 用于“在仓库打开”
 * @returns {{platform:string, owner:string, repo:string, branch:string, rawBase:string, webBase:string}|null}
 */
function getRepoContext(repoUrl, branch) {
    const info = parseRepo(repoUrl);
    if (!info) return null;
    return {
        platform: info.platform,
        owner: info.owner,
        repo: info.repo,
        branch,
        rawBase: getRawUrl(repoUrl, branch, '').replace(/\/$/, ''),
        webBase: getWebBaseUrl(repoUrl, branch)
    };
}

/**
 * 构造 release API URL
 */
function getReleaseApiUrl(repoUrl, tag) {
    const info = parseRepo(repoUrl);
    if (!info) return null;
    switch (info.platform) {
        case 'github':
            return `https://api.github.com/repos/${info.owner}/${info.repo}/releases/tags/${encodeURIComponent(tag)}`;
        case 'gitee':
            return `https://gitee.com/api/v5/repos/${info.owner}/${info.repo}/releases/tags/${encodeURIComponent(tag)}`;
        default:
            return null;
    }
}

/**
 * 获取 release 中指定资产的下载 URL
 *
 * tag 命名兼容：仓库 release tag 可能是 v1.0.0 或 1.0.0，按顺序尝试
 * [v{version}, {version}]，找到第一个含目标资产的 release 即返回。
 *
 * 资产名匹配兼容：canbox-developer 打包时用 pkg.id || pkg.name 作为 zip 前缀，
 * 仓库 package.json 中 id 与 name 可能不同（如 id=com.github.xxx.cb-jsonbox,
 * name=cb-jsonbox），因此这里同时用 id 和 name 作为候选前缀匹配。
 *
 * @param {string} repoUrl 仓库地址
 * @param {string} appIdentifier APP 标识（优先 pkg.id，兜底 pkg.name）
 * @param {string} name APP name（兜底匹配）
 * @param {string} version APP version
 * @returns {Promise<string|null>} 下载 URL，找不到返回 null
 */
async function getReleaseDownloadUrl(repoUrl, appIdentifier, name, version) {
    // 候选资产名前缀（去重）：id 优先 + name 兜底
    const prefixCandidates = Array.from(new Set([appIdentifier, name].filter(Boolean)));
    // 匹配函数：资产名以 "{prefix}-{version}.zip" 结尾即视为命中
    const matchAsset = (assetName) => {
        for (const prefix of prefixCandidates) {
            if (assetName === `${prefix}-${version}.zip`) return true;
        }
        return false;
    };

    // tag 候选：v 前缀优先，无 v 前缀兜底
    const tagCandidates = [`v${version}`, version];
    const apiUrls = tagCandidates
        .map(tag => getReleaseApiUrl(repoUrl, tag))
        .filter(Boolean);

    if (apiUrls.length === 0) {
        // 非 github/gitee/gitlab 平台，无 API，直接拼接 GitHub 风格 URL（用第一个候选前缀）
        const fallback = `${normalizeRepoUrl(repoUrl)}/releases/download/${tagCandidates[0]}/${prefixCandidates[0]}-${version}.zip`;
        logger.info('[repo-probe] getReleaseDownloadUrl: no API url, fallback=%s', fallback);
        return fallback;
    }

    logger.info('[repo-probe] getReleaseDownloadUrl: prefixes=%j, version=%s, apiUrls=%j', prefixCandidates, version, apiUrls);

    for (const apiUrl of apiUrls) {
        // 直连优先，GitHub API 域名追加镜像兜底
        const { data, statusCode, networkError } = await fetchJson(apiUrl, { 'Accept': 'application/vnd.github+json' });
        logger.info('[repo-probe] getReleaseDownloadUrl: api result status=%s networkError=%s url=%s',
            statusCode, networkError || '(none)', apiUrl);

        // 容错：部分平台（如 gitee）tag 不存在时 API 返回字面量 null，axios 解析后为 JS null
        if (!data || typeof data !== 'object') {
            logger.info('[repo-probe] getReleaseDownloadUrl: no release data url=%s', apiUrl);
            continue;
        }

        const assets = data.assets || [];
        const found = assets.find(a => matchAsset(a.name));
        if (found) {
            logger.info('[repo-probe] getReleaseDownloadUrl: found asset=%s url=%s', found.browser_download_url, apiUrl);
            return found.browser_download_url;
        }
        logger.info('[repo-probe] getReleaseDownloadUrl: asset not found, prefixes=%j, available=%j url=%s', prefixCandidates, assets.map(a => a.name), apiUrl);
    }

    return null;
}

/**
 * 下载文本文件
 *
 * 注意：axios 默认会根据内容自动解析 JSON（即使 Content-Type 是 text/plain），
 * 把 resp.data 变成对象。这里必须禁用 transformResponse，强制返回原始字符串，
 * 否则后续 JSON.parse(对象) 会得到 "[object Object]" 导致解析失败。
 *
 * @returns {Promise<{text: string|null, statusCode: number|null, networkError: string|null}>}
 *   成功时 text 为文件内容；失败时 text 为 null，statusCode/networkError 标识失败原因
 */
async function fetchText(url) {
    // 直连优先，GitHub 域名（raw.githubusercontent.com 等）追加镜像兜底
    const { resp, statusCode, networkError } = await requestWithFallback(url, {
        // 强制 axios 原样返回字符串，不做任何自动 JSON 解析（详见上方说明）
        transformResponse: [(data) => data]
    });
    if (!resp) {
        logger.info('[repo-probe] fetchText failed: status=%s networkError=%s url=%s', statusCode, networkError, url);
        return { text: null, statusCode, networkError };
    }
    if (resp.status !== 200) {
        logger.info('[repo-probe] fetchText non-200: status=%s url=%s', resp.status, url);
        return { text: null, statusCode: resp.status, networkError: null };
    }
    const text = resp.data;
    if (typeof text !== 'string') {
        logger.info('[repo-probe] fetchText unexpected data type=%s url=%s', typeof text, url);
        return { text: null, statusCode: resp.status, networkError: 'invalid_data_type' };
    }
    return { text, statusCode: 200, networkError: null };
}

/**
 * 下载二进制文件，返回 Buffer
 */
async function fetchBuffer(url) {
    // 直连优先，GitHub 域名追加镜像兜底
    const { resp } = await requestWithFallback(url, { responseType: 'arraybuffer' });
    if (!resp || resp.status !== 200) {
        logger.info('[repo-probe] fetchBuffer failed: status=%s url=%s', resp ? resp.status : 'no-response', url);
        return null;
    }
    return Buffer.from(resp.data);
}

/**
 * 下载 JSON 文件（用于 GitHub / Gitee Release API）
 * 直连优先，GitHub 域名追加镜像兜底。
 * @returns {Promise<{data:any, statusCode:number|null, networkError:string|null}>}
 */
async function fetchJson(url, headers = {}) {
    const { resp, statusCode, networkError } = await requestWithFallback(url, { headers });
    if (!resp) {
        logger.info('[repo-probe] fetchJson failed: status=%s networkError=%s url=%s', statusCode, networkError, url);
        return { data: null, statusCode, networkError };
    }
    return { data: resp.data, statusCode: resp.status, networkError: null };
}

/**
 * 探测仓库元数据
 *
 * @param {string} repoUrl - 仓库 URL
 * @param {Object} [options]
 * @param {boolean} [options.withAssets=false] - 是否拉取 logo（二进制）与 README 文本。
 *        addRepo/syncRepo 等需要展示元数据的场景传 true；update-check/installByRepoUrl
 *        内部 probe 仅用于取 version/id，传 false 可省掉两次无谓的 HTTP 请求。
 * @returns {Promise<Object>} { name, version, description, logoBuf, logoExt, keywords, platforms, branch, readme, author }
 *          - logoBuf: Buffer | null（仅 withAssets=true 时拉取）
 *          - logoExt: 'png'|'svg'|'jpg'|... | null
 *          - readme: string | null（仅 withAssets=true 时拉取）
 */
async function probeRepo(repoUrl, options = {}) {
    const withAssets = !!options.withAssets;
    logger.info('[repo-probe] probeRepo start: url=%s withAssets=%s', repoUrl, withAssets);
    const branch = await detectDefaultBranch(repoUrl);
    logger.info('[repo-probe] probeRepo: branch=%s', branch);

    const pkgUrl = getRawUrl(repoUrl, branch, 'package.json');
    logger.info('[repo-probe] probeRepo: fetching package.json: %s', pkgUrl);
    const pkgResult = await fetchText(pkgUrl);
    if (!pkgResult.text) {
        if (pkgResult.networkError === 'timeout') {
            throw new Error('网络请求超时，无法访问仓库。可能网络不稳定或 GitHub 访问受限，请检查网络后重试');
        }
        if (pkgResult.networkError === 'dns' || pkgResult.networkError === 'connection' || pkgResult.networkError === 'network') {
            throw new Error('网络连接失败，无法访问仓库。可能原因：网络不稳定或 GitHub 访问受限，请检查网络后重试');
        }
        if (pkgResult.statusCode === 404) {
            throw new Error('仓库中找不到 package.json，请确认仓库地址正确且为公开的 Canbox APP 仓库');
        }
        if (pkgResult.statusCode === 403) {
            throw new Error('仓库访问被拒绝（HTTP 403），可能是私有仓库或 GitHub API 限流，请稍后重试');
        }
        throw new Error(`无法访问仓库文件（HTTP ${pkgResult.statusCode}），请确认仓库地址正确且为公开仓库`);
    }
    const pkgText = pkgResult.text;
    logger.info('[repo-probe] probeRepo: package.json length=%d', pkgText.length);
    let pkg;
    try {
        pkg = JSON.parse(pkgText);
    } catch (e) {
        // 记录前 200 字符便于排查（可能是 HTML 错误页、BOM 等）
        const preview = pkgText.slice(0, 200).replace(/\s+/g, ' ');
        logger.error('[repo-probe] probeRepo: JSON.parse failed: %s, preview=%s', e.message, preview);
        throw new Error(`package.json 解析失败: ${e.message}`);
    }
    if (!pkg.name) {
        throw new Error('package.json 缺少 name 字段，不是合法的 Canbox APP 仓库');
    }
    logger.info('[repo-probe] probeRepo: pkg id=%s name=%s version=%s', pkg.id, pkg.name, pkg.version);

    // 拉取 .canbox-app 读取 category（分类来源唯一字段）
    let category = 'other';
    try {
        const canboxAppUrl = getRawUrl(repoUrl, branch, '.canbox-app');
        const canboxResult = await fetchText(canboxAppUrl);
        if (canboxResult.text) {
            const canboxApp = JSON.parse(canboxResult.text);
            category = normalizeCategory(canboxApp.category);
        }
    } catch (e) {
        // .canbox-app 不存在或解析失败时 category 保持 'other'，不阻断探测
        logger.info('[repo-probe] probeRepo: .canbox-app category read skipped: %s', e.message);
    }

    // logo / readme 仅在需要展示元数据时拉取，避免 update-check 等场景无谓的网络请求
    let logoBuf = null;
    let logoExt = null;
    let readme = null;
    if (withAssets) {
        const logoFile = pkg.logo || 'logo.png';
        const logoUrl = getRawUrl(repoUrl, branch, logoFile);
        logoBuf = await fetchBuffer(logoUrl);
        if (logoBuf) {
            logoExt = path.extname(logoFile).slice(1).toLowerCase() || 'png';
            logger.info('[repo-probe] probeRepo: logo loaded, size=%d ext=%s', logoBuf.length, logoExt);
        } else {
            logger.info('[repo-probe] probeRepo: logo not found: %s', logoUrl);
        }

        const readmeUrl = getRawUrl(repoUrl, branch, 'README.md');
        const readmeResult = await fetchText(readmeUrl);
        // fetchText 返回 { text, statusCode, networkError }；只取 text 字符串，
        // 避免把整个对象塞进 repos.json（旧版 bug 曾导致 readme 节点变成 object）
        readme = (readmeResult && typeof readmeResult.text === 'string') ? readmeResult.text : null;
        logger.info('[repo-probe] probeRepo: readme length=%s', readme ? readme.length : 0);
    }

    logger.info('[repo-probe] probeRepo done: id=%s name=%s', pkg.id, pkg.name);
    return {
        id: pkg.id || pkg.name,
        name: pkg.name,
        // 展示名：package.json 的 displayName 优先，name 兜底
        displayName: pkg.displayName || pkg.name,
        version: pkg.version || '0.0.0',
        description: pkg.description || '',
        author: pkg.author || '',
        logoBuf,
        logoExt,
        keywords: pkg.keywords || [],
        platforms: pkg.platforms || [],
        category,
        branch,
        readme
    };
}

/**
 * 测试单个代理对指定 URL 的连通性与延迟
 * @param {{name:string,url:string}} mirror 代理
 * @param {string} originalUrl 原始下载 URL
 * @param {number} [timeout=3000] 超时
 * @returns {Promise<{mirror, available:boolean, latency:number}>}
 */
async function testMirrorLatency(mirror, originalUrl, timeout = 3000) {
    const start = Date.now();
    try {
        await axios.head(`${mirror.url}/${originalUrl}`, {
            timeout,
            maxRedirects: 5,
            headers: { 'User-Agent': UA }
        });
        return { mirror, available: true, latency: Date.now() - start };
    } catch (e) {
        return { mirror, available: false, latency: Date.now() - start };
    }
}

/**
 * 并发测速所有 GitHub 代理，返回按延迟升序的可用代理列表
 *
 * 竞速策略：任一代理可用即返回，不等其他代理超时。
 * 若全部代理在超时窗口内不可用，返回空列表（由调用方降级直连）。
 * 最坏耗时 = timeout（默认 3 秒），最好耗时 = 最快代理的响应时间。
 */
async function probeMirrors(originalUrl, timeout = 3000) {
    // 跟踪已返回的结果，确保 resolve 只触发一次
    const results = [];
    let resolved = false;

    return new Promise((resolve) => {
        // 兜底：超时窗口结束后，返回已收集的可用代理（可能为空）
        const timer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            resolve(results.filter(r => r.available).sort((a, b) => a.latency - b.latency));
        }, timeout + 100);

        GITHUB_MIRRORS.forEach(m => {
            testMirrorLatency(m, originalUrl, timeout).then(r => {
                if (resolved) return;
                results.push(r);
                // 任一代理可用，立即返回（竞速）
                if (r.available) {
                    resolved = true;
                    clearTimeout(timer);
                    // 返回当前已知的可用代理（通常只有这一个，后续的会被忽略）
                    resolve(results.filter(x => x.available).sort((a, b) => a.latency - b.latency));
                }
            });
        });
    });
}

/**
 * 流式下载单条线路（带进度回调）
 */
async function streamDownload(url, destPath, onProgress) {
    logger.info('[repo-probe] streamDownload: start, url=%s', url);
    const resp = await axios({
        method: 'get',
        url,
        responseType: 'stream',
        timeout: 60000,
        headers: { 'User-Agent': UA },
        maxRedirects: 5
    });

    if (resp.status !== 200) {
        throw new Error(`下载失败，HTTP ${resp.status}`);
    }

    const total = parseInt(resp.headers['content-length'] || '0', 10);
    logger.info('[repo-probe] streamDownload: connected, total=%d bytes', total);
    let received = 0;
    const writer = fs.createWriteStream(destPath);

    return new Promise((resolve, reject) => {
        resp.data.on('data', (chunk) => {
            received += chunk.length;
            if (onProgress && total > 0) {
                onProgress(Math.round((received / total) * 100));
            }
        });
        resp.data.on('end', () => {
            logger.info('[repo-probe] streamDownload: body end, received=%d/%d bytes', received, total);
            if (total > 0 && received !== total) {
                logger.warn('[repo-probe] streamDownload: size mismatch, received=%d expected=%d', received, total);
            }
            writer.end();
            writer.on('finish', () => resolve(destPath));
        });
        resp.data.on('error', (err) => {
            logger.error('[repo-probe] streamDownload: stream error: %s', err.message);
            writer.destroy();
            reject(err);
        });
        writer.on('error', (err) => {
            logger.error('[repo-probe] streamDownload: writer error: %s', err.message);
            reject(err);
        });
        resp.data.pipe(writer);
    });
}

/**
 * 下载文件（带进度回调）
 *
 * 线路策略（对开发者和用户透明）：
 * - 仅对 github.com 下载链接启用代理加速
 * - 每次下载前并发测速所有代理，按延迟升序逐一尝试
 * - 全部代理不可用或均下载失败时，降级为直连
 * - 非 GitHub 链接直接下载
 *
 * @param {string} url 下载 URL
 * @param {string} destPath 保存路径
 * @param {(progress:number)=>void} [onProgress] 进度回调 0~100
 */
async function downloadFile(url, destPath, onProgress) {
    const startedAt = Date.now();
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const isGithub = /^https?:\/\/[^/]*github\.com\//i.test(url);
    logger.info('[repo-probe] downloadFile: start, url=%s dest=%s isGithub=%s', url, destPath, isGithub);

    // 构建候选线路：可用代理（按延迟升序）+ 直连兜底
    const candidates = [];
    if (isGithub) {
        logger.info('[repo-probe] downloadFile: github url, probing mirrors: %s', url);
        const mirrors = await probeMirrors(url);
        for (const m of mirrors) {
            candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${url}` });
            logger.info('[repo-probe] downloadFile: mirror available: %s (%dms)', m.mirror.name, m.latency);
        }
        if (mirrors.length === 0) {
            logger.info('[repo-probe] downloadFile: all mirrors unavailable, fallback to direct');
        }
    }
    candidates.push({ name: 'direct', url });
    logger.info('[repo-probe] downloadFile: candidates=%j', candidates.map(c => c.name));

    let lastErr;
    for (const candidate of candidates) {
        const lineStart = Date.now();
        try {
            logger.info('[repo-probe] downloadFile: trying %s: %s', candidate.name, candidate.url);
            await streamDownload(candidate.url, destPath, onProgress);
            const size = fs.existsSync(destPath) ? fs.statSync(destPath).size : 0;
            logger.info('[repo-probe] downloadFile: success via %s, size=%d bytes, elapsed=%dms',
                candidate.name, size, Date.now() - lineStart);
            return destPath;
        } catch (e) {
            lastErr = e;
            // 清理可能产生的不完整文件，避免下一次候选误判已存在
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
            logger.warn('[repo-probe] downloadFile: %s failed: %s (elapsed=%dms)',
                candidate.name, e.message, Date.now() - lineStart);
        }
    }
    const reason = lastErr && lastErr.message ? lastErr.message : '未知错误';
    const isHttpStatus = /^HTTP \d+/.test(reason);
    const hint = isHttpStatus ? '' : '。可能网络不稳定或 GitHub 访问受限，请检查网络后重试';
    logger.error('[repo-probe] downloadFile: all %d candidates failed, url=%s reason=%s elapsed=%dms',
        candidates.length, url, reason, Date.now() - startedAt);
    throw new Error(`下载失败：${reason}${hint}`);
}

module.exports = {
    normalizeRepoUrl,
    parseRepo,
    detectDefaultBranch,
    getRawUrl,
    getWebBaseUrl,
    getRepoContext,
    getReleaseDownloadUrl,
    probeRepo,
    downloadFile,
    GITHUB_MIRRORS
};
