/**
 * canbox-manager — 仓库探测模块
 *
 * 通过 HTTP raw 方式探测 git 仓库内的 APP 元数据（package.json / logo / README），
 * 不 clone 整个仓库。支持 GitHub / Gitee / GitLab 及兼容平台。
 *
 * Release 下载通过平台 API 获取资产 URL，确保 GitHub / Gitee 都能正确下载。
 */

const axios = require('axios');
const fs = require('fs');
const path = require('path');

const UA = 'Mozilla/5.0 (X11; Linux x86_64) Canbox/0.1.0';
const TIMEOUT = 15000;

// GitHub 代理列表（仅用于加速 github.com 下载，每次下载前并发测速选最优）
const GITHUB_MIRRORS = [
    { name: 'ghproxy', url: 'https://ghproxy.com' },
    { name: 'ghfast', url: 'https://ghfast.top' },
    { name: 'ghgo', url: 'https://ghgo.xyz' }
];

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
        console.log('[repo-probe] detectDefaultBranch: parseRepo failed, url=%s', repoUrl);
        return 'master';
    }
    const probeUrl = `${info.raw}/info/refs?service=git-upload-pack`;
    try {
        const resp = await axios.get(probeUrl, {
            timeout: 10000,
            headers: { 'User-Agent': UA },
            // info/refs 返回 git smart protocol 文本，必须禁用自动 JSON 解析
            transformResponse: [(data) => data]
        });
        const match = String(resp.data).match(/refs\/heads\/(\S+)/);
        if (match) {
            console.log('[repo-probe] detectDefaultBranch: detected=%s url=%s', match[1], repoUrl);
            return match[1];
        }
        console.log('[repo-probe] detectDefaultBranch: no branch match in info/refs, url=%s', probeUrl);
    } catch (e) {
        console.log('[repo-probe] detectDefaultBranch: info/refs failed: %s url=%s', e.message, probeUrl);
    }
    const fallback = info.platform === 'github' ? 'main' : 'master';
    console.log('[repo-probe] detectDefaultBranch: fallback=%s url=%s', fallback, repoUrl);
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
        console.log('[repo-probe] getReleaseDownloadUrl: no API url, fallback=%s', fallback);
        return fallback;
    }

    console.log('[repo-probe] getReleaseDownloadUrl: prefixes=%j, version=%s, apiUrls=%j', prefixCandidates, version, apiUrls);

    for (const apiUrl of apiUrls) {
        let data;
        try {
            const resp = await axios.get(apiUrl, {
                timeout: TIMEOUT,
                headers: { 'User-Agent': UA, 'Accept': 'application/vnd.github+json' }
            });
            data = resp.data;
        } catch (e) {
            console.log('[repo-probe] getReleaseDownloadUrl: api error: %s url=%s', e.message, apiUrl);
            continue;
        }

        // 容错：部分平台（如 gitee）tag 不存在时 API 返回字面量 null，axios 解析后为 JS null
        if (!data || typeof data !== 'object') {
            console.log('[repo-probe] getReleaseDownloadUrl: no release data url=%s', apiUrl);
            continue;
        }

        const assets = data.assets || [];
        const found = assets.find(a => matchAsset(a.name));
        if (found) {
            console.log('[repo-probe] getReleaseDownloadUrl: found asset=%s url=%s', found.browser_download_url, apiUrl);
            return found.browser_download_url;
        }
        console.log('[repo-probe] getReleaseDownloadUrl: asset not found, prefixes=%j, available=%j url=%s', prefixCandidates, assets.map(a => a.name), apiUrl);
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
    try {
        const resp = await axios.get(url, {
            timeout: TIMEOUT,
            headers: { 'User-Agent': UA },
            // 强制 axios 原样返回字符串，不做任何自动 JSON 解析
            transformResponse: [(data) => data]
        });
        if (resp.status !== 200) {
            console.log('[repo-probe] fetchText non-200: status=%s url=%s', resp.status, url);
            return { text: null, statusCode: resp.status, networkError: null };
        }
        const text = resp.data;
        if (typeof text !== 'string') {
            console.log('[repo-probe] fetchText unexpected data type=%s url=%s', typeof text, url);
            return { text: null, statusCode: resp.status, networkError: 'invalid_data_type' };
        }
        return { text, statusCode: 200, networkError: null };
    } catch (e) {
        let networkError = 'network';
        if (e.code === 'ECONNABORTED' || (e.message && e.message.includes('timeout'))) {
            networkError = 'timeout';
        } else if (e.code === 'ENOTFOUND' || e.code === 'EAI_AGAIN') {
            networkError = 'dns';
        } else if (e.code === 'ECONNREFUSED' || e.code === 'ECONNRESET') {
            networkError = 'connection';
        }
        console.log('[repo-probe] fetchText error: %s (code=%s, networkError=%s) url=%s', e.message, e.code, networkError, url);
        return { text: null, statusCode: null, networkError };
    }
}

/**
 * 下载二进制文件，返回 Buffer
 */
async function fetchBuffer(url) {
    try {
        const resp = await axios.get(url, {
            timeout: TIMEOUT,
            responseType: 'arraybuffer',
            headers: { 'User-Agent': UA }
        });
        if (resp.status !== 200) {
            console.log('[repo-probe] fetchBuffer non-200: status=%s url=%s', resp.status, url);
            return null;
        }
        return Buffer.from(resp.data);
    } catch (e) {
        console.log('[repo-probe] fetchBuffer error: %s url=%s', e.message, url);
        return null;
    }
}

/**
 * 探测仓库元数据
 * @returns {Promise<Object>} { name, version, description, logo, keywords, platforms, branch, readme, author }
 */
async function probeRepo(repoUrl) {
    console.log('[repo-probe] probeRepo start: url=%s', repoUrl);
    const branch = await detectDefaultBranch(repoUrl);
    console.log('[repo-probe] probeRepo: branch=%s', branch);

    const pkgUrl = getRawUrl(repoUrl, branch, 'package.json');
    console.log('[repo-probe] probeRepo: fetching package.json: %s', pkgUrl);
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
    console.log('[repo-probe] probeRepo: package.json length=%d', pkgText.length);
    let pkg;
    try {
        pkg = JSON.parse(pkgText);
    } catch (e) {
        // 记录前 200 字符便于排查（可能是 HTML 错误页、BOM 等）
        const preview = pkgText.slice(0, 200).replace(/\s+/g, ' ');
        console.error('[repo-probe] probeRepo: JSON.parse failed: %s, preview=%s', e.message, preview);
        throw new Error(`package.json 解析失败: ${e.message}`);
    }
    if (!pkg.name) {
        throw new Error('package.json 缺少 name 字段，不是合法的 Canbox APP 仓库');
    }
    console.log('[repo-probe] probeRepo: pkg id=%s name=%s version=%s', pkg.id, pkg.name, pkg.version);

    // logo
    let logo = null;
    const logoFile = pkg.logo || 'logo.png';
    const logoUrl = getRawUrl(repoUrl, branch, logoFile);
    const logoBuf = await fetchBuffer(logoUrl);
    if (logoBuf) {
        const ext = path.extname(logoFile).slice(1).toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : (ext === 'png' ? 'image/png' : 'image/jpeg');
        logo = `data:${mime};base64,${logoBuf.toString('base64')}`;
        console.log('[repo-probe] probeRepo: logo loaded, size=%d', logoBuf.length);
    } else {
        console.log('[repo-probe] probeRepo: logo not found: %s', logoUrl);
    }

    // README
    const readmeUrl = getRawUrl(repoUrl, branch, 'README.md');
    const readme = await fetchText(readmeUrl);
    console.log('[repo-probe] probeRepo: readme length=%s', readme ? readme.length : 0);

    console.log('[repo-probe] probeRepo done: id=%s name=%s', pkg.id, pkg.name);
    return {
        id: pkg.id || pkg.name,
        name: pkg.name,
        version: pkg.version || '0.0.0',
        description: pkg.description || '',
        author: pkg.author || '',
        logo,
        keywords: pkg.keywords || [],
        platforms: pkg.platforms || [],
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
            writer.end();
            writer.on('finish', () => resolve(destPath));
        });
        resp.data.on('error', (err) => {
            writer.destroy();
            reject(err);
        });
        writer.on('error', (err) => reject(err));
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
    const dir = path.dirname(destPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

    const isGithub = /^https?:\/\/[^/]*github\.com\//i.test(url);

    // 构建候选线路：可用代理（按延迟升序）+ 直连兜底
    const candidates = [];
    if (isGithub) {
        console.log('[repo-probe] downloadFile: github url, probing mirrors: %s', url);
        const mirrors = await probeMirrors(url);
        for (const m of mirrors) {
            candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${url}` });
            console.log('[repo-probe] downloadFile: mirror available: %s (%dms)', m.mirror.name, m.latency);
        }
        if (mirrors.length === 0) {
            console.log('[repo-probe] downloadFile: all mirrors unavailable, fallback to direct');
        }
    }
    candidates.push({ name: 'direct', url });

    let lastErr;
    for (const candidate of candidates) {
        try {
            console.log('[repo-probe] downloadFile: trying %s: %s', candidate.name, candidate.url);
            await streamDownload(candidate.url, destPath, onProgress);
            console.log('[repo-probe] downloadFile: success via %s', candidate.name);
            return destPath;
        } catch (e) {
            lastErr = e;
            // 清理可能产生的不完整文件，避免下一次候选误判已存在
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
            console.log('[repo-probe] downloadFile: %s failed: %s', candidate.name, e.message);
        }
    }
    const reason = lastErr && lastErr.message ? lastErr.message : '未知错误';
    const isHttpStatus = /^HTTP \d+/.test(reason);
    const hint = isHttpStatus ? '' : '。可能网络不稳定或 GitHub 访问受限，请检查网络后重试';
    throw new Error(`下载失败：${reason}${hint}`);
}

module.exports = {
    normalizeRepoUrl,
    parseRepo,
    detectDefaultBranch,
    getRawUrl,
    getReleaseDownloadUrl,
    probeRepo,
    downloadFile
};
