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
    const results = [];
    let resolved = false;

    return new Promise((resolve) => {
        const timer = setTimeout(() => {
            if (resolved) return;
            resolved = true;
            resolve(results.filter(r => r.available).sort((a, b) => a.latency - b.latency));
        }, timeout + 100);

        GITHUB_MIRRORS.forEach(m => {
            testMirrorLatency(m, originalUrl, timeout).then(r => {
                if (resolved) return;
                results.push(r);
                if (r.available) {
                    resolved = true;
                    clearTimeout(timer);
                    resolve(results.filter(x => x.available).sort((a, b) => a.latency - b.latency));
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
    const apiUrl = `https://api.github.com/repos/${UPDATE_REPO}/releases/latest`;
    const assetName = getPlatformAssetName();

    // 构建候选线路：可用代理（按延迟升序）+ 直连兜底
    const candidates = [];
    const mirrors = await probeMirrors(apiUrl);
    for (const m of mirrors) {
        candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${apiUrl}` });
    }
    candidates.push({ name: 'direct', url: apiUrl });

    let lastErr;
    for (const candidate of candidates) {
        try {
            const resp = await axios.get(candidate.url, {
                timeout: TIMEOUT,
                headers: {
                    'User-Agent': UA,
                    'Accept': 'application/vnd.github+json'
                }
            });
            const data = resp.data;
            if (!data || !data.tag_name) {
                continue;
            }

            const latestVersion = data.tag_name.replace(/^v/, '');
            const currentVersion = pkg.version;
            const hasUpdate = compareVersions(latestVersion, currentVersion) > 0;

            // 查找当前平台的安装包资产
            const assets = data.assets || [];
            const asset = assets.find(a => a.name === assetName);

            return {
                hasUpdate,
                currentVersion,
                latestVersion,
                downloadUrl: asset ? asset.browser_download_url : null,
                releaseNotes: data.body || '',
                releaseUrl: data.html_url || ''
            };
        } catch (e) {
            lastErr = e;
        }
    }

    return { hasUpdate: false, error: lastErr ? lastErr.message : '检查更新失败' };
}

/**
 * 流式下载（带进度回调）
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

    // 清理可能存在的旧文件
    try {
        if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
    } catch (e) { /* ignore */ }

    const isGithub = /^https?:\/\/[^/]*github\.com\//i.test(downloadUrl);

    // 构建候选线路：可用代理 + 直连兜底
    const candidates = [];
    if (isGithub) {
        const mirrors = await probeMirrors(downloadUrl);
        for (const m of mirrors) {
            candidates.push({ name: m.mirror.name, url: `${m.mirror.url}/${downloadUrl}` });
        }
    }
    candidates.push({ name: 'direct', url: downloadUrl });

    let lastErr;
    for (const candidate of candidates) {
        try {
            await streamDownload(candidate.url, destPath, onProgress);
            return destPath;
        } catch (e) {
            lastErr = e;
            // 清理不完整文件
            try { if (fs.existsSync(destPath)) fs.unlinkSync(destPath); } catch (_) { /* ignore */ }
        }
    }

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
    if (!fs.existsSync(installerPath)) {
        throw new Error('安装包不存在: ' + installerPath);
    }

    if (process.platform === 'win32') {
        // Windows: NSIS 安装包，启动时自动弹 UAC
        spawn(installerPath, [], { detached: true, stdio: 'ignore' }).unref();
    } else {
        // Linux: .sh 自解压脚本需设置可执行权限
        fs.chmodSync(installerPath, 0o755);
        spawn('bash', [installerPath], { detached: true, stdio: 'ignore' }).unref();
    }

    // 退出 manager，让安装程序完成覆盖
    app.quit();
}

module.exports = {
    checkUpdate,
    downloadInstaller,
    runInstallerAndQuit
};
