/**
 * canbox-manager — 自动更新模块
 *
 * 检测 GitHub Releases 新版本，下载对应平台安装包并启动安装。
 * 安装包自身负责提权（Linux .sh 内部 sudo / Windows NSIS 触发 UAC）。
 *
 * GitHub API 和下载链接均通过 repo-probe 的镜像测速机制加速。
 */

const { app } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs');
const os = require('os');
const axios = require('axios');
const pkg = require('./package.json');

// 通过 canbox-core 注入的 logger（log4js），写入 {usersPath}/logs/canbox.log
// 若 logger 未初始化（如开发环境直接 require），降级为 console
// 注意：不在模块加载时获取，而是每次使用时动态获取——
// 因为 injection.js 的 logger.init() 在 app.whenReady() 之后异步执行，
// 模块加载时 logger 尚未就绪
function _getLogger() {
    try {
        // 与 main.js 一致：通过 global.__CANBOX_CORE_PATH__ 获取 core 路径
        // 不用 require('canbox-core/injection')，因为打包后 asar 无法解析该模块名
        const corePath = global.__CANBOX_CORE_PATH__;
        if (!corePath) return console;
        const loggerModule = require(require('path').join(corePath, 'lib', 'logger'));
        return loggerModule.get() || console;
    } catch (_) {
        return console;
    }
}
const logger = {
    info: (...args) => _getLogger().info(...args),
    error: (...args) => _getLogger().error(...args)
};

// manager 自身的 GitHub 仓库（owner/repo）
const UPDATE_REPO = 'canbox-io/canbox-manager';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Canbox/' + pkg.version;
// 5s 超时：SourceForge / GitHub API / 镜像探测共用，慢源由并发竞速自然淘汰
const TIMEOUT = 5000;

// SourceForge 项目下载根（latest-{platform}.json 与版本子目录均位于其下）
const SOURCEFORGE_BASE_URL = 'https://downloads.sourceforge.net/project/canbox-manager';

// GitHub 代理列表（与 repo-probe.js 一致，用于加速 API 和下载）
const GITHUB_MIRRORS = [
    { name: 'ghproxy', url: 'https://ghproxy.com' },
    { name: 'ghfast', url: 'https://ghfast.top' },
    { name: 'ghgo', url: 'https://ghgo.xyz' }
];

/**
 * 比较两个语义化版本号
 * @returns {number} 1 表示 latest > current（有更新），0 相等，-1 latest < current
 */
function compareVersions(latest, current) {
    const a = latest.replace(/^v/, '').split('.').map(Number);
    const b = current.replace(/^v/, '').split('.').map(Number);
    for (let i = 0; i < Math.max(a.length, b.length); i++) {
        const va = a[i] || 0;
        const vb = b[i] || 0;
        if (va > vb) return 1;
        if (va < vb) return -1;
    }
    return 0;
}

/**
 * 测试单个代理对指定 URL 的连通性与延迟
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
 * 任一可用即返回，全部不可用则返回空列表（降级直连）
 */
async function probeMirrors(originalUrl, timeout = 3000) {
    logger.info('[updater] probeMirrors: testing %d mirrors for %s', GITHUB_MIRRORS.length, originalUrl);
    const results = [];
    let resolved = false;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            const available = results.filter(r => r.available).sort((a, b) => a.latency - b.latency);
            logger.info('[updater] probeMirrors: timeout reached, available=%d/%d', available.length, GITHUB_MIRRORS.length);
            resolve(available);
        }, timeout + 100);

        GITHUB_MIRRORS.forEach(m => {
            testMirrorLatency(m, originalUrl, timeout).then(r => {
                if (resolved) return;
                results.push(r);
                if (r.available) {
                    logger.info('[updater] probeMirrors: mirror=%s available latency=%dms', r.mirror.name, r.latency);
                    resolved = true;
                    clearTimeout(timer);
                    const available = results.filter(x => x.available).sort((a, b) => a.latency - b.latency);
                    logger.info('[updater] probeMirrors: selected %d available mirrors', available.length);
                    resolve(available);
                }
            });
        });
    });
}

/**
 * 获取当前平台的安装包资产名
 */
function getPlatformAssetName() {
    if (process.platform === 'win32') {
        return 'Canbox-Setup-x86_64.exe';
    }
    return 'Canbox-linux-x86_64.sh';
}

/**
 * 获取 SourceForge latest-{platform}.json 的 URL
 * 加 ?t=<timestamp> 防 sourceforge CDN 边缘缓存命中旧版本
 */
function getSourceforgeMetadataUrl() {
    const platform = process.platform === 'win32' ? 'win' : 'linux';
    return `${SOURCEFORGE_BASE_URL}/latest-${platform}.json?t=${Date.now()}`;
}

/**
 * 通过 SourceForge 元数据检查更新
 * 返回结构与 checkUpdateViaGithub 完全一致，便于 Promise.any 竞速
 */
async function checkUpdateViaSourceforge() {
    const url = getSourceforgeMetadataUrl();
    logger.info('[updater] checkUpdateViaSourceforge: url=%s', url);
    const resp = await axios.get(url, {
        timeout: TIMEOUT,
        headers: { 'User-Agent': UA }
    });
    const data = resp.data;
    if (!data || !data.version || !data.asset || !data.asset.url) {
        throw new Error('SourceForge metadata invalid: missing version/asset.url');
    }
    const latestVersion = data.version.replace(/^v/, '');
    const currentVersion = pkg.version;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    logger.info('[updater] checkUpdateViaSourceforge: latestVersion=%s currentVersion=%s hasUpdate=%s',
        latestVersion, currentVersion, hasUpdate);
    return {
        hasUpdate,
        currentVersion,
        latestVersion,
        downloadUrl: data.asset.url,
        releaseNotes: data.releaseNotes || '',
        releaseUrl: data.releaseUrl || ''
    };
}

/**
 * 通过 GitHub API 检查更新（原 checkUpdate 逻辑抽离）
 * 直连 api.github.com，失败抛错由 Promise.any 兜底
 */
async function checkUpdateViaGithub() {
    const apiUrl = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
    const assetName = getPlatformAssetName();
    logger.info('[updater] checkUpdateViaGithub: url=%s assetName=%s', apiUrl, assetName);

    const resp = await axios.get(apiUrl, {
        timeout: TIMEOUT,
        headers: {
            'User-Agent': UA,
            'Accept': 'application/vnd.github+json'
        }
    });
    const data = resp.data;
    if (!data || !data.tag_name) {
        throw new Error('GitHub API response missing tag_name');
    }

    const latestVersion = data.tag_name.replace(/^v/, '');
    const currentVersion = pkg.version;
    const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
    logger.info('[updater] checkUpdateViaGithub: latestVersion=%s currentVersion=%s hasUpdate=%s',
        latestVersion, currentVersion, hasUpdate);

    // 查找当前平台的安装包资产
    const assets = data.assets || [];
    const asset = assets.find(a => a.name === assetName);
    if (!asset) {
        logger.info('[updater] checkUpdateViaGithub: asset not found, assetName=%s assets=%j', assetName, assets.map(a => a.name));
    }

    return {
        hasUpdate,
        currentVersion,
        latestVersion,
        downloadUrl: asset ? asset.browser_download_url : null,
        releaseNotes: data.body || '',
        releaseUrl: data.html_url || ''
    };
}

/**
 * 检查更新
 *
 * 并发竞速 SourceForge 与 GitHub API，谁先返回用谁：
 * - 国内用户：SourceForge 通常 200-500ms 返回，GitHub API 5s 超时 → SF 赢
 * - 国外用户：GitHub API 通常 100-300ms 返回，SourceForge 可能更慢 → GitHub 赢
 * 两者都失败时返回聚合错误。
 *
 * @returns {Promise<Object>}
 *   { hasUpdate: true, currentVersion, latestVersion, downloadUrl, releaseNotes, releaseUrl }
 *   { hasUpdate: false, currentVersion, latestVersion }
 *   { hasUpdate: false, error: string }
 */
async function checkUpdate() {
    logger.info('[updater] checkUpdate: start, currentVersion=%s platform=%s', pkg.version, process.platform);

    // 包装 Promise，让 winner 信息随结果一起返回
    const wrap = (name, fn) => fn().then(result => ({ name, result }));

    try {
        const winner = await Promise.any([
            wrap('sourceforge', checkUpdateViaSourceforge),
            wrap('github', checkUpdateViaGithub)
        ]);
        logger.info('[updater] checkUpdate: winner=%s hasUpdate=%s latestVersion=%s downloadUrl=%s',
            winner.name, winner.result.hasUpdate, winner.result.latestVersion, winner.result.downloadUrl);
        return winner.result;
    } catch (e) {
        // Promise.any 全部失败时 e 是 AggregateError
        const errors = e && e.errors ? e.errors.map(x => x.message).join('; ') : (e ? e.message : 'unknown');
        logger.error('[updater] checkUpdate: all sources failed, errors=%s', errors);
        return { hasUpdate: false, error: '检查更新失败: ' + errors };
    }
}

/**
 * 流式下载（带进度回调）
 */
async function streamDownload(url, destPath, onProgress) {
    logger.info('[updater] streamDownload: url=%s dest=%s', url, destPath);
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
    logger.info('[updater] streamDownload: status=200 total=%d bytes', total);
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
            writer.on('finish', () => {
                logger.info('[updater] streamDownload: done, received=%d bytes', received);
                resolve(destPath);
            });
        });
        resp.data.on('error', (err) => {
            logger.error('[updater] streamDownload: stream error: %s', err.message);
            writer.destroy();
            reject(err);
        });
        writer.on('error', (err) => {
            logger.error('[updater] streamDownload: writer error: %s', err.message);
            reject(err);
        });
        resp.data.pipe(writer);
    });
}

/**
 * 下载安装包
 *
 * 通过 GitHub 代理测速选最优线路下载，全部失败则降级直连。
 * 安装包保存到 os.tmpdir()，使用原资产名，已存在则覆盖。
 *
 * @param {string} downloadUrl release 资产的 browser_download_url
 * @param {(progress:number)=>void} [onProgress] 0~100
 * @returns {Promise<string>} 下载后的安装包本地路径
 */
async function downloadInstaller(downloadUrl, onProgress) {
    const assetName = getPlatformAssetName();
    const destPath = path.join(os.tmpdir(), assetName);
    logger.info('[updater] downloadInstaller: start, url=%s dest=%s', downloadUrl, destPath);

    // 清理可能存在的旧文件
    try {
        if (fs.existsSync(destPath)) {
            logger.info('[updater] downloadInstaller: removing existing file %s', destPath);
            fs.unlinkSync(destPath);
        }
    } catch (e) { /* ignore */ }

    const isGithub = /^https?:\/\/[^/]*github\.com\//i.test(downloadUrl);
    const isSourceforge = /sourceforge\.net/i.test(downloadUrl);

    // 构建候选线路：可用代理 + 直连兜底
    const candidates = [];
    if (isGithub) {
        const mirrors = await probeMirrors(downloadUrl);
        for (const m of mirrors) {
            candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${downloadUrl}` });
        }
    } else if (isSourceforge) {
        logger.info('[updater] downloadInstaller: sourceforge url, direct download');
    } else {
        logger.info('[updater] downloadInstaller: non-github url, skip mirror probing');
    }
    candidates.push({ name: isSourceforge ? 'sourceforge' : 'direct', url: downloadUrl });
    logger.info('[updater] downloadInstaller: %d candidate lines', candidates.length);

    let lastErr;
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        logger.info('[updater] downloadInstaller: trying line=%s (%d/%d)', candidate.name, i + 1, candidates.length);
        try {
            await streamDownload(candidate.url, destPath, onProgress);
            const stat = fs.statSync(destPath);
            logger.info('[updater] downloadInstaller: success, line=%s size=%d bytes path=%s', candidate.name, stat.size, destPath);
            return destPath;
        } catch (e) {
            logger.error('[updater] downloadInstaller: line=%s failed: %s', candidate.name, e.message);
            lastErr = e;
            // 清理不完整文件
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
        }
    }

    logger.error('[updater] downloadInstaller: all candidates failed, error=%s', lastErr ? lastErr.message : 'unknown');
    throw lastErr;
}

/**
 * 启动安装包并退出 manager
 *
 * Linux: bash 执行 .sh 自解压脚本，内部 sudo 提权
 * Windows: 直接执行 .exe，NSIS 触发 UAC
 *
 * @param {string} installerPath 安装包本地路径
 */
function runInstallerAndQuit(installerPath) {
    logger.info('[updater] runInstallerAndQuit: installerPath=%s platform=%s', installerPath, process.platform);
    if (!fs.existsSync(installerPath)) {
        logger.error('[updater] runInstallerAndQuit: installer not found: %s', installerPath);
        throw new Error('安装包不存在: ' + installerPath);
    }

    let child;
    if (process.platform === 'win32') {
        // Windows: NSIS 安装包，启动时自动弹 UAC
        logger.info('[updater] runInstallerAndQuit: spawning Windows installer (NSIS UAC)');
        child = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
    } else {
        // Linux: .sh 自解压脚本需设置可执行权限
        // 传 --update 参数：非交互更新模式，自动探测已安装路径
        logger.info('[updater] runInstallerAndQuit: chmod +x and spawning bash installer with --update');
        fs.chmodSync(installerPath, 0o755);
        child = spawn('bash', [installerPath, '--update'], { detached: true, stdio: 'ignore' });
    }
    child.unref();
    logger.info('[updater] runInstallerAndQuit: installer spawned, pid=%s, quitting manager', child.pid);

    // 退出 manager，让安装程序完成覆盖
    app.quit();
}

module.exports = {
    checkUpdate,
    downloadInstaller,
    runInstallerAndQuit
};
