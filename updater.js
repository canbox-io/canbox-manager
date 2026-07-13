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

// manager 自身的 GitHub 仓库（owner/repo）
const UPDATE_REPO = 'canbox-io/canbox-manager';
const UA = 'Mozilla/5.0 (X11; Linux x86_64) Canbox/' + pkg.version;
const TIMEOUT = 15000;

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
    console.log('[updater] probeMirrors: testing %d mirrors for %s', GITHUB_MIRRORS.length, originalUrl);
    const results = [];
    let resolved = false;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            const available = results.filter(r => r.available).sort((a, b) => a.latency - b.latency);
            console.log('[updater] probeMirrors: timeout reached, available=%d/%d', available.length, GITHUB_MIRRORS.length);
            resolve(available);
        }, timeout + 100);

        GITHUB_MIRRORS.forEach(m => {
            testMirrorLatency(m, originalUrl, timeout).then(r => {
                if (resolved) return;
                results.push(r);
                if (r.available) {
                    console.log('[updater] probeMirrors: mirror=%s available latency=%dms', r.mirror.name, r.latency);
                    resolved = true;
                    clearTimeout(timer);
                    const available = results.filter(x => x.available).sort((a, b) => a.latency - b.latency);
                    console.log('[updater] probeMirrors: selected %d available mirrors', available.length);
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
 * 检查更新
 *
 * 调用 GitHub Releases API 获取最新 release，与本地版本对比。
 * API 请求通过 GitHub 代理加速（与下载逻辑一致）。
 *
 * @returns {Promise<Object>}
 *   { hasUpdate: true, currentVersion, latestVersion, downloadUrl, releaseNotes }
 *   { hasUpdate: false, currentVersion, latestVersion }
 *   { hasUpdate: false, error: string }
 */
async function checkUpdate() {
    console.log('[updater] checkUpdate: start, currentVersion=%s repo=%s', pkg.version, UPDATE_REPO);
    const apiUrl = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
    const assetName = getPlatformAssetName();
    console.log('[updater] checkUpdate: platform=%s assetName=%s', process.platform, assetName);

    // GitHub API 不走镜像代理（镜像站只代理 github.com 下载资源，不代理 api.github.com）
    // 直接直连 API，失败则返回错误
    const candidates = [{ name: 'direct', url: apiUrl }];
    console.log('[updater] checkUpdate: %d candidate lines (api direct only)', candidates.length);

    let lastErr;
    for (const candidate of candidates) {
        try {
            console.log('[updater] checkUpdate: trying line=%s', candidate.name);
            const resp = await axios.get(candidate.url, {
                timeout: TIMEOUT,
                headers: {
                    'User-Agent': UA,
                    'Accept': 'application/vnd.github+json'
                }
            });
            const data = resp.data;
            if (!data || !data.tag_name) {
                console.log('[updater] checkUpdate: line=%s response has no tag_name, skip', candidate.name);
                continue;
            }

            const latestVersion = data.tag_name.replace(/^v/, '');
            const currentVersion = pkg.version;
            const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;
            console.log('[updater] checkUpdate: line=%s latestVersion=%s currentVersion=%s hasUpdate=%s',
                candidate.name, latestVersion, currentVersion, hasUpdate);

            // 查找当前平台的安装包资产
            const assets = data.assets || [];
            const asset = assets.find(a => a.name === assetName);
            if (!asset) {
                console.log('[updater] checkUpdate: asset not found, assetName=%s assets=%j', assetName, assets.map(a => a.name));
            } else {
                console.log('[updater] checkUpdate: asset found, downloadUrl=%s size=%d', asset.browser_download_url, asset.size);
            }

            return {
                hasUpdate,
                currentVersion,
                latestVersion,
                downloadUrl: asset ? asset.browser_download_url : null,
                releaseNotes: data.body || '',
                releaseUrl: data.html_url || ''
            };
        } catch (e) {
            console.log('[updater] checkUpdate: line=%s failed: %s', candidate.name, e.message);
            lastErr = e;
        }
    }

    console.error('[updater] checkUpdate: all candidates failed, error=%s', lastErr ? lastErr.message : 'unknown');
    return { hasUpdate: false, error: lastErr ? lastErr.message : '检查更新失败' };
}

/**
 * 流式下载（带进度回调）
 */
async function streamDownload(url, destPath, onProgress) {
    console.log('[updater] streamDownload: url=%s dest=%s', url, destPath);
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
    console.log('[updater] streamDownload: status=200 total=%d bytes', total);
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
                console.log('[updater] streamDownload: done, received=%d bytes', received);
                resolve(destPath);
            });
        });
        resp.data.on('error', (err) => {
            console.error('[updater] streamDownload: stream error: %s', err.message);
            writer.destroy();
            reject(err);
        });
        writer.on('error', (err) => {
            console.error('[updater] streamDownload: writer error: %s', err.message);
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
    console.log('[updater] downloadInstaller: start, url=%s dest=%s', downloadUrl, destPath);

    // 清理可能存在的旧文件
    try {
        if (fs.existsSync(destPath)) {
            console.log('[updater] downloadInstaller: removing existing file %s', destPath);
            fs.unlinkSync(destPath);
        }
    } catch (e) { /* ignore */ }

    const isGithub = /^https?:\/\/[^/]*github\.com\//i.test(downloadUrl);

    // 构建候选线路：可用代理 + 直连兜底
    const candidates = [];
    if (isGithub) {
        const mirrors = await probeMirrors(downloadUrl);
        for (const m of mirrors) {
            candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${downloadUrl}` });
        }
    } else {
        console.log('[updater] downloadInstaller: non-github url, skip mirror probing');
    }
    candidates.push({ name: 'direct', url: downloadUrl });
    console.log('[updater] downloadInstaller: %d candidate lines', candidates.length);

    let lastErr;
    for (let i = 0; i < candidates.length; i++) {
        const candidate = candidates[i];
        console.log('[updater] downloadInstaller: trying line=%s (%d/%d)', candidate.name, i + 1, candidates.length);
        try {
            await streamDownload(candidate.url, destPath, onProgress);
            const stat = fs.statSync(destPath);
            console.log('[updater] downloadInstaller: success, line=%s size=%d bytes path=%s', candidate.name, stat.size, destPath);
            return destPath;
        } catch (e) {
            console.error('[updater] downloadInstaller: line=%s failed: %s', candidate.name, e.message);
            lastErr = e;
            // 清理不完整文件
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
        }
    }

    console.error('[updater] downloadInstaller: all candidates failed, error=%s', lastErr ? lastErr.message : 'unknown');
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
    console.log('[updater] runInstallerAndQuit: installerPath=%s platform=%s', installerPath, process.platform);
    if (!fs.existsSync(installerPath)) {
        console.error('[updater] runInstallerAndQuit: installer not found: %s', installerPath);
        throw new Error('安装包不存在: ' + installerPath);
    }

    let child;
    if (process.platform === 'win32') {
        // Windows: NSIS 安装包，启动时自动弹 UAC
        console.log('[updater] runInstallerAndQuit: spawning Windows installer (NSIS UAC)');
        child = spawn(installerPath, [], { detached: true, stdio: 'ignore' });
    } else {
        // Linux: .sh 自解压脚本需设置可执行权限
        console.log('[updater] runInstallerAndQuit: chmod +x and spawning bash installer');
        fs.chmodSync(installerPath, 0o755);
        child = spawn('bash', [installerPath], { detached: true, stdio: 'ignore' });
    }
    child.unref();
    console.log('[updater] runInstallerAndQuit: installer spawned, pid=%s, quitting manager', child.pid);

    // 退出 manager，让安装程序完成覆盖
    app.quit();
}

module.exports = {
    checkUpdate,
    downloadInstaller,
    runInstallerAndQuit
};
