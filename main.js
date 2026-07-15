/**
 * canbox-manager — App 主进程入口
 *
 * 标准 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js canbox-manager/ --app-id=canbox-manager
 *
 * 与普通 APP 无区别，不拥有特殊权限。
 * 注册 manager 专用 IPC handlers（APP 管理、仓库管理、设置）。
 *
 * 注意：canbox-core 的 injection.js 已完成环境初始化（userData、Users 路径、
 * store/db IPC 注册），本文件通过 global.__CANBOX_ENV__ 获取 env 信息。
 */

// 开发模式关闭 Electron 安全警告（CSP 提示等，打包后自动不显示）
if (process.env.NODE_ENV === 'development') {
    process.env.ELECTRON_DISABLE_SECURITY_WARNINGS = 'true';
}

console.time('[startup] main.js 模块加载到 window-ready 总耗时');

const { app, BrowserWindow, ipcMain, dialog, shell, Menu } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');
// 第三方依赖必须在顶部 require：importAppFromZip 中会设置 process.noAsar=true，
// 若在其后才 require（如 adm-zip/nanoid），会因 asar 补丁被禁用而无法从 app.asar 加载。
const AdmZip = require('adm-zip');
const { customAlphabet } = require('nanoid');

// 自动禁用 sandbox（某些 Linux 环境下 sandbox 无法工作）
app.commandLine.appendSwitch('no-sandbox');

// canbox-core 的 injection.js 通过 electron -r 参数预加载，
// 已完成环境初始化和 API 注册，通过 global 挂载 env 和 corePath。
const env = global.__CANBOX_ENV__;
const USERS_PATH = env.usersPath;
const CORE_PATH = global.__CANBOX_CORE_PATH__;

const repoProbe = require('./repo-probe');
const appLauncher = require('./app-launcher');
const updater = require('./updater');

let mainWindow = null;

// ====== Manager 专用 IPC Handlers ======

// -- APP 管理 --

// 生成随机 appId（8 位小写字母+数字）
function generateAppId() {
    return customAlphabet('0123456789abcdefghijklmnopqrstuvwxyz', 8)();
}

// 获取 manager 自己的 store（存 id → appId 映射等）
function getManagerStore() {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    return store.getStore('canbox-manager', 'apps', path.join(USERS_PATH, 'data'));
}

ipcMain.handle('manager.apps.list', async () => {
    const appsDir = path.join(USERS_PATH, 'apps');
    if (!fs.existsSync(appsDir)) return [];

    const entries = fs.readdirSync(appsDir, { withFileTypes: true });
    const apps = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const appDir = path.join(appsDir, entry.name);
            const pkgPath = path.join(appDir, 'package.json');
            if (fs.existsSync(pkgPath)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                    // 读 logo（base64 data URI）
                    let logo = '';
                    const logoCandidates = pkg.logo
                        ? [pkg.logo]
                        : ['logo.png', 'logo.svg', 'icon.png'];
                    for (const candidate of logoCandidates) {
                        const logoPath = path.join(appDir, candidate);
                        if (fs.existsSync(logoPath)) {
                            try {
                                const ext = path.extname(candidate).slice(1).toLowerCase();
                                const mime = ext === 'svg' ? 'image/svg+xml' : 'image/png';
                                logo = `data:${mime};base64,${fs.readFileSync(logoPath).toString('base64')}`;
                            } catch (e) {}
                            break;
                        }
                    }
                    apps.push({
                        appId: entry.name,
                        id: pkg.id || pkg.name || entry.name,
                        name: pkg.displayName || pkg.name || entry.name,
                        version: pkg.version || '0.0.0',
                        description: pkg.description || '',
                        author: pkg.author || '',
                        keywords: pkg.keywords || [],
                        platforms: pkg.platforms || [],
                        logo,
                        path: appDir
                    });
                } catch (e) {
                    // 解析失败的跳过
                }
            }
        }
    }
    return apps;
});

ipcMain.handle('manager.apps.import', async (_e, zipPath) => {
    const result = await importAppFromZip(zipPath);
    // 生产模式下写 launcher
    if (result.success) {
        const appInfo = readAppInfo(result.appId);
        if (appInfo) appLauncher.generateLauncher(appInfo);
    }
    return result;
});

/**
 * 从 zip 导入 APP（提取为独立函数，供 apps.import 和 repos.install 共用）
 */
async function importAppFromZip(zipPath) {
    const appsDir = path.join(USERS_PATH, 'apps');
    const os = require('os');

    if (!zipPath.toLowerCase().endsWith('.zip')) {
        return { success: false, error: 'Only .zip packages are supported' };
    }

    let tempDir = null;
    const prevNoAsar = process.noAsar;
    process.noAsar = true;
    try {
        const zip = new AdmZip(zipPath);
        tempDir = path.join(os.tmpdir(), `canbox-import-${Date.now()}`);
        zip.extractAllTo(tempDir, true);

        // 修复 app.asar：Electron fs 补丁可能把 .asar 文件当目录处理，导致解压后变空目录
        const tempAsarPath = path.join(tempDir, 'app.asar');
        if (fs.existsSync(tempAsarPath) && fs.statSync(tempAsarPath).isDirectory()) {
            // asar 被当目录了，从 zip 中重新提取原始数据
            const asarEntry = zip.getEntry('app.asar');
            if (asarEntry) {
                fs.rmSync(tempAsarPath, { recursive: true, force: true });
                const originalFs = require('original-fs');
                originalFs.writeFileSync(tempAsarPath, asarEntry.getData());
            }
        }

        // 标准 zip 结构：根目录直接含 package.json
        const pkgPath = path.join(tempDir, 'package.json');
        if (!fs.existsSync(pkgPath)) {
            return { success: false, error: 'Invalid APP zip: no package.json found at root' };
        }

        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        const appIdentifier = pkg.id || pkg.name;
        if (!appIdentifier) {
            return { success: false, error: 'package.json must have "id" or "name" field' };
        }

        // 生成随机 appId
        const appId = generateAppId();
        const destPath = path.join(appsDir, appId);

        // 复制 APP 到 apps/{appId}/
        fs.mkdirSync(destPath, { recursive: true });
        copyDirSync(tempDir, destPath);

        // 记录 id → appId 映射
        const mgrStore = getManagerStore();
        let idMap = mgrStore.get('idMap') || {};
        idMap[appIdentifier] = appId;
        mgrStore.set('idMap', idMap);

        return { success: true, appId, id: appIdentifier };
    } catch (e) {
        return { success: false, error: e.message };
    } finally {
        process.noAsar = prevNoAsar;
        if (tempDir) fs.rmSync(tempDir, { recursive: true, force: true });
    }
}

/**
 * 读取已安装 APP 的信息（用于 launcher 生成）
 */
function readAppInfo(appId) {
    const appDir = path.join(USERS_PATH, 'apps', appId);
    const pkgPath = path.join(appDir, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;
    try {
        const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
        let logo = '';
        const logoCandidates = pkg.logo ? [pkg.logo] : ['logo.png', 'logo.svg', 'icon.png'];
        for (const candidate of logoCandidates) {
            const logoPath = path.join(appDir, candidate);
            if (fs.existsSync(logoPath)) {
                try {
                    const ext = path.extname(candidate).slice(1).toLowerCase();
                    const mime = ext === 'svg' ? 'image/svg+xml' : 'image/png';
                    logo = `data:${mime};base64,${fs.readFileSync(logoPath).toString('base64')}`;
                } catch (e) {}
                break;
            }
        }
        return {
            appId,
            name: pkg.displayName || pkg.name || appId,
            wmClass: pkg.name || appId,
            description: pkg.description || '',
            logo
        };
    } catch (e) {
        return null;
    }
}

ipcMain.handle('manager.apps.remove', async (_e, appId) => {
    const appPath = path.join(USERS_PATH, 'apps', appId);
    console.log('[manager] remove app, appId=%s, path=%s', appId, appPath);

    if (!fs.existsSync(appPath)) {
        console.log('[manager] remove: path not found');
        return { success: false, error: 'APP not found' };
    }

    // 先读 APP 信息用于删除 launcher
    const appInfo = readAppInfo(appId);

    try {
        const originalFs = require('original-fs');
        originalFs.rmSync(appPath, { recursive: true, force: true });
        console.log('[manager] remove: done, exists=%s', fs.existsSync(appPath));

        // 删除 APP 数据目录 data/{appId}/（删除应用 = 连同数据一起清除）
        const dataPath = path.join(USERS_PATH, 'data', appId);
        if (fs.existsSync(dataPath)) {
            originalFs.rmSync(dataPath, { recursive: true, force: true });
            console.log('[manager] remove: data dir removed, path=%s', dataPath);
        }

        // 删除 launcher
        if (appInfo) appLauncher.deleteLauncher(appInfo.name);

        // 清理 idMap：反查 appIdentifier 并删除对应映射
        const mgrStore = getManagerStore();
        const idMap = mgrStore.get('idMap') || {};
        let removedIdentifier = null;
        for (const [identifier, mappedAppId] of Object.entries(idMap)) {
            if (mappedAppId === appId) {
                removedIdentifier = identifier;
                delete idMap[identifier];
                break;
            }
        }
        if (removedIdentifier) {
            mgrStore.set('idMap', idMap);
            console.log('[manager] remove: cleared idMap[%s]=%s', removedIdentifier, appId);
        }

        // 同步更新仓库列表：清除匹配仓库的 installedAppId / toUpdate
        const repos = getAllRepos();
        let reposChanged = false;
        for (const repo of Object.values(repos)) {
            const repoIdentifier = repo.appId || repo.name;
            if (repoIdentifier === removedIdentifier || repo.installedAppId === appId) {
                if (repo.installedAppId || repo.toUpdate) {
                    repo.installedAppId = null;
                    repo.toUpdate = false;
                    repo.updatedAt = Date.now();
                    reposChanged = true;
                }
            }
        }
        if (reposChanged) {
            saveAllRepos(repos);
            console.log('[manager] remove: synced repos installedAppId');
        }

        return { success: true };
    } catch (e) {
        console.error('[manager] remove failed:', e);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.apps.launch', async (_e, appId) => {
    const appDir = path.join(USERS_PATH, 'apps', appId);

    if (!fs.existsSync(appDir)) {
        console.error('[manager] 启动 APP 失败: 目录不存在', appId);
        return { success: false, error: 'APP not found' };
    }

    try {
        // 优先启动 app.asar，兼容源码目录模式
        const asarPath = path.join(appDir, 'app.asar');
        const target = fs.existsSync(asarPath) ? asarPath : appDir;

        // 统一启动方式：electron -r core/injection.js <target> --app-id=<id> --no-sandbox
        // 开发和生产行为一致，每个 APP 是独立 electron 进程，加载自己的 package.json，
        // WM_CLASS 由 APP 的 package.json name 决定，窗口正确分离。
        const coreInjection = path.join(CORE_PATH, 'injection.js');
        const child = spawn(process.execPath, [
            '-r', coreInjection,
            target,
            `--app-id=${appId}`,
            '--no-sandbox'
        ], {
            detached: true,
            stdio: 'ignore',
            env: { ...process.env, NODE_ENV: 'production' }
        });
        child.unref();

        console.log('[manager] 启动 APP:', appId, 'pid=', child.pid, 'electron=', process.execPath);
        return { success: true };
    } catch (e) {
        console.error('[manager] 启动 APP 异常:', appId, e.message);
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.apps.clearData', async (_e, appId) => {
    const dataDir = path.join(USERS_PATH, 'data', appId);

    try {
        if (fs.existsSync(dataDir)) {
            const originalFs = require('original-fs');
            // 清理数据：删除目录内所有内容，但保留目录本身
            // （store/db 等子目录会被清空，APP 重启后自动重建）
            const entries = originalFs.readdirSync(dataDir);
            for (const entry of entries) {
                originalFs.rmSync(path.join(dataDir, entry), { recursive: true, force: true });
            }
            console.log('[manager] clearData: cleared contents of %s', dataDir);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// 修复 APP 快捷方式（强制重新生成 launcher）
ipcMain.handle('manager.apps.repairLauncher', async (_e, appId) => {
    const appInfo = readAppInfo(appId);
    if (!appInfo) {
        return { success: false, error: 'App not found or package.json invalid' };
    }
    const result = appLauncher.generateLauncher(appInfo, { force: true });
    if (result.skipped) {
        // 生产模式下才会真正生成，开发模式返回 skipped
        return { success: true, skipped: true };
    }
    return result;
});

// -- 仓库管理 --
// 仓库元数据存储在 manager 自己的 store 中（data/canbox-manager/store/repos.json）
// 数据结构：{ repos: { [repoId]: { ...repoInfo } } }

function getReposStore() {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    return store.getStore('canbox-manager', 'repos', path.join(USERS_PATH, 'data'));
}

function getAllRepos() {
    return getReposStore().get('repos') || {};
}

function saveAllRepos(repos) {
    getReposStore().set('repos', repos);
}

/**
 * 检查仓库 APP 是否已安装，返回 installedAppId
 * @param {string} appIdentifier APP 标识（pkg.id || pkg.name，与 idMap 的 key 一致）
 */
function checkInstalled(appIdentifier) {
    const mgrStore = getManagerStore();
    const idMap = mgrStore.get('idMap') || {};
    if (idMap[appIdentifier]) return idMap[appIdentifier];
    return null;
}

ipcMain.handle('manager.repos.list', async () => {
    try {
        const repos = getAllRepos();
        // 实时检查安装状态（appId 即 pkg.id || pkg.name，与 idMap key 一致）
        const list = Object.values(repos).map(repo => ({
            ...repo,
            installedAppId: checkInstalled(repo.appId || repo.name)
        }));
        return list;
    } catch (e) {
        return [];
    }
});

ipcMain.handle('manager.repos.add', async (_e, url) => {
    try {
        // 探测仓库元数据
        const probed = await repoProbe.probeRepo(url);

        const repoId = `repo_${Date.now()}`;
        const repo = {
            id: repoId,
            url,
            appId: probed.id,
            name: probed.name,
            displayName: probed.description || probed.name,
            version: probed.version,
            description: probed.description,
            author: probed.author,
            logo: probed.logo,
            keywords: probed.keywords,
            platforms: probed.platforms,
            branch: probed.branch,
            readme: probed.readme,
            installedAppId: checkInstalled(probed.id),
            lastError: null,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };

        const repos = getAllRepos();
        repos[repoId] = repo;
        saveAllRepos(repos);

        return { success: true, repo };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.remove', async (_e, repoId) => {
    try {
        const repos = getAllRepos();
        delete repos[repoId];
        saveAllRepos(repos);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.sync', async (_e, repoId) => {
    try {
        const repos = getAllRepos();
        const repo = repos[repoId];
        if (!repo) {
            return { success: false, error: '仓库不存在' };
        }

        const probed = await repoProbe.probeRepo(repo.url);

        // 检查是否有新版本
        const toUpdate = probed.version !== repo.version && repo.installedAppId;

        repos[repoId] = {
            ...repo,
            appId: probed.id,
            name: probed.name,
            displayName: probed.description || probed.name,
            version: probed.version,
            description: probed.description,
            author: probed.author,
            logo: probed.logo,
            keywords: probed.keywords,
            platforms: probed.platforms,
            branch: probed.branch,
            readme: probed.readme,
            installedAppId: checkInstalled(probed.id),
            toUpdate,
            lastError: null,
            updatedAt: Date.now()
        };
        saveAllRepos(repos);

        return { success: true, repo: repos[repoId] };
    } catch (e) {
        // 记录错误但不删除仓库
        const repos = getAllRepos();
        if (repos[repoId]) {
            repos[repoId].lastError = e.message;
            repos[repoId].updatedAt = Date.now();
            saveAllRepos(repos);
        }
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.install', async (_e, repoId) => {
    try {
        const repos = getAllRepos();
        const repo = repos[repoId];
        if (!repo) {
            return { success: false, error: '仓库不存在' };
        }

        // 兼容旧记录：appId 字段是后加的，旧仓库记录可能缺失，此时重新 probe 补全
        if (!repo.appId) {
            console.log('[repos.install] repo.appId missing, re-probing to backfill: repoId=%s', repoId);
            try {
                const probed = await repoProbe.probeRepo(repo.url);
                repo.appId = probed.id;
                repo.logo = repo.logo || probed.logo;
                repo.keywords = probed.keywords;
                repo.platforms = probed.platforms;
                repo.branch = probed.branch;
                repo.readme = probed.readme;
                saveAllRepos(repos);
                console.log('[repos.install] backfilled appId=%s for repoId=%s', repo.appId, repoId);
            } catch (e) {
                console.log('[repos.install] backfill probe failed: %s', e.message);
            }
        }

        // 获取 release 下载 URL（优先用 appId 匹配资产名，name 兜底）
        const downloadUrl = await repoProbe.getReleaseDownloadUrl(repo.url, repo.appId || repo.name, repo.name, repo.version);
        if (!downloadUrl) {
            return { success: false, error: `未找到 ${repo.name} v${repo.version} 的 release 下载资产，请确认仓库已发布对应版本` };
        }

        // 下载 zip 到临时目录
        const os = require('os');
        const zipPath = path.join(os.tmpdir(), `canbox-repo-install-${repoId}-${Date.now()}.zip`);
        let lastProgress = 0;
        await repoProbe.downloadFile(downloadUrl, zipPath, (progress) => {
            // 节流发送进度
            if (progress - lastProgress >= 10) {
                lastProgress = progress;
                if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('manager.repos.installProgress', { repoId, progress });
                }
            }
        });

        // 复用 importAppFromZip
        const importResult = await importAppFromZip(zipPath);
        // 清理临时文件
        try { fs.unlinkSync(zipPath); } catch (e) {}

        if (!importResult.success) {
            return { success: false, error: importResult.error };
        }

        // 更新仓库元数据
        repo.installedAppId = importResult.appId;
        repo.toUpdate = false;
        repo.updatedAt = Date.now();
        repos[repoId] = repo;
        saveAllRepos(repos);

        // 生产模式下写 launcher
        const appInfo = readAppInfo(importResult.appId);
        if (appInfo) appLauncher.generateLauncher(appInfo);

        return { success: true, appId: importResult.appId };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.getReadme', async (_e, repoId) => {
    try {
        const repos = getAllRepos();
        const repo = repos[repoId];
        if (!repo) return { success: false, error: '仓库不存在' };
        return { success: true, readme: repo.readme || '', version: repo.version };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// -- 设置（通过 canbox-core store，黑盒式，appId=canbox-manager 自动路由） --
// manager 设置存到 data/canbox-manager/store/settings.json

ipcMain.handle('manager.settings.get', async (_e, key) => {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    return settingsStore.get(key);
});

ipcMain.handle('manager.settings.set', async (_e, key, value) => {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    settingsStore.set(key, value);
    return { success: true };
});

ipcMain.handle('manager.settings.getAll', async () => {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    // electron-store 的 store 没有直接 getAll，用 size + 遍历
    return settingsStore.store || {};
});

// -- 数据目录管理（读取/迁移 Users 目录，由 canbox-core env.js 读取 config.json 生效）--

// config.json 直接读写（不依赖 electron-store，避免引入额外依赖）
const CONFIG_FILE = path.join(env.userData, 'config.json');

function readConfig() {
    try {
        if (fs.existsSync(CONFIG_FILE)) {
            return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
        }
    } catch (e) {
        console.error('[manager.data] readConfig failed: {}', e.message);
    }
    return {};
}

function writeConfig(config) {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 4), 'utf-8');
}

// 递归统计目录文件数（用于迁移前后校验）
function countFiles(dir) {
    if (!fs.existsSync(dir)) return 0;
    let count = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            count += countFiles(fullPath);
        } else if (entry.isFile()) {
            count++;
        }
    }
    return count;
}

// 获取当前数据目录信息
ipcMain.handle('manager.data.getPath', async () => {
    const config = readConfig();
    const customDataRoot = config.customDataRoot || null;
    return {
        userData: env.userData,
        usersPath: env.usersPath,
        customDataRoot: customDataRoot,
        isDefault: !customDataRoot
    };
});

// 迁移数据目录（targetPath 为 null 表示重置为默认 userData/Users）
// 流程：校验 → 复制 Users/ → 验证 → 更新 config.json → 删除旧数据
// 任一步骤失败 → 回滚（删新、留旧、不动 config.json）
ipcMain.handle('manager.data.migrate', async (_e, targetPath) => {
    const currentUsersPath = env.usersPath;
    const newUsersBase = targetPath || env.userData;
    const newUsersPath = path.join(newUsersBase, 'Users');

    // 校验：目标与当前相同
    if (path.resolve(currentUsersPath) === path.resolve(newUsersPath)) {
        return { success: false, error: 'Target directory is the same as current' };
    }

    // 校验：目标目录若已存在且非空
    if (fs.existsSync(newUsersPath)) {
        const files = fs.readdirSync(newUsersPath);
        if (files.length > 0) {
            return { success: false, error: 'Target directory exists and is not empty' };
        }
    }

    // 确保目标父目录存在
    fs.mkdirSync(newUsersBase, { recursive: true });

    // 复制前文件数（用于验证）
    const sourceCount = countFiles(currentUsersPath);

    // 复制 Users/ 到新位置
    try {
        fs.cpSync(currentUsersPath, newUsersPath, { recursive: true });
    } catch (e) {
        // 复制失败：清理已复制的部分，保持 config.json 不变
        try { fs.rmSync(newUsersPath, { recursive: true, force: true }); } catch (_) {}
        return { success: false, error: `Copy failed: ${e.message}` };
    }

    // 验证：文件数对比
    const targetCount = countFiles(newUsersPath);
    if (sourceCount !== targetCount) {
        // 验证失败：清理新位置，保留旧数据
        try { fs.rmSync(newUsersPath, { recursive: true, force: true }); } catch (_) {}
        return {
            success: false,
            error: `Verification failed: source ${sourceCount} files, target ${targetCount} files`
        };
    }

    // 验证通过：更新 config.json
    const config = readConfig();
    if (targetPath) {
        config.customDataRoot = targetPath;
    } else {
        delete config.customDataRoot;
    }
    try {
        writeConfig(config);
    } catch (e) {
        // 写 config.json 失败：回滚（删新位置）
        try { fs.rmSync(newUsersPath, { recursive: true, force: true }); } catch (_) {}
        return { success: false, error: `Failed to update config: ${e.message}` };
    }

    // config.json 已更新：删除旧位置 Users/ 目录
    // 失败不影响功能（下次启动已指向新位置），仅记录日志
    try {
        fs.rmSync(currentUsersPath, { recursive: true, force: true });
    } catch (e) {
        console.error('[manager.data] Failed to cleanup old directory: {}', e.message);
    }

    return { success: true, newUsersPath };
});

// -- 文件任务 --
const fileTasks = new Map();

ipcMain.handle('manager.fileTask.create', async (_e, task) => {
    const taskId = `task_${Date.now()}`;
    fileTasks.set(taskId, { id: taskId, ...task, progress: 0, status: 'pending' });
    return { success: true, taskId };
});

ipcMain.handle('manager.fileTask.cancel', async (_e, taskId) => {
    const task = fileTasks.get(taskId);
    if (task) {
        task.status = 'cancelled';
        fileTasks.set(taskId, task);
    }
    return { success: true };
});

ipcMain.handle('manager.fileTask.list', async () => {
    const tasks = [];
    for (const [id, task] of fileTasks) {
        tasks.push({ id, ...task });
    }
    return tasks;
});

// -- 缩放 --
ipcMain.handle('manager.zoom.get', async () => {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    return { success: true, factor: settingsStore.get('zoomFactor') || 1.0 };
});

ipcMain.handle('manager.zoom.set', async (_e, factor) => {
    const clamped = Math.max(0.5, Math.min(2.0, Math.round(factor * 10) / 10));
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    settingsStore.set('zoomFactor', clamped);

    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.setZoomFactor(clamped);
            win.webContents.send('manager:zoomChanged', clamped);
        }
    });
    return { success: true, factor: clamped };
});

ipcMain.handle('manager.zoom.reset', async () => {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
    settingsStore.set('zoomFactor', 1.0);

    BrowserWindow.getAllWindows().forEach(win => {
        if (!win.isDestroyed()) {
            win.webContents.setZoomFactor(1.0);
            win.webContents.send('manager:zoomChanged', 1.0);
        }
    });
    return { success: true, factor: 1.0 };
});

// ====== 自动更新 ======

ipcMain.handle('manager.update.check', async () => {
    try {
        return await updater.checkUpdate();
    } catch (e) {
        return { hasUpdate: false, error: e.message };
    }
});

ipcMain.handle('manager.update.download', async (_e, downloadUrl) => {
    try {
        const installerPath = await updater.downloadInstaller(downloadUrl, (progress) => {
            if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('manager.update.downloadProgress', { progress });
            }
        });
        return { success: true, installerPath };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.update.install', async (_e, installerPath) => {
    try {
        updater.runInstallerAndQuit(installerPath);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.dialog.showOpenDialog', async (_e, options) => {
    return dialog.showOpenDialog(BrowserWindow.getFocusedWindow(), options);
});

ipcMain.handle('manager.shell.openUrl', async (_e, url) => {
    return shell.openExternal(url);
});

// ====== 窗口创建 ======

// 获取窗口状态 store（按 appId 物理隔离，黑盒式）
function getWinStateStore() {
    const store = require(path.join(CORE_PATH, 'lib', 'store'));
    return store.getStore('canbox-manager', 'winState', path.join(USERS_PATH, 'data'));
}

// 保存窗口状态（含位置、大小、最大化、全屏）
// 节流 300ms，避免 resize/move 高频写盘
let winStateSaveTimer = null;
function saveWindowState() {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    if (winStateSaveTimer) clearTimeout(winStateSaveTimer);
    winStateSaveTimer = setTimeout(() => {
        try {
            if (!mainWindow || mainWindow.isDestroyed()) return;
            const store = getWinStateStore();
            // 最大化或全屏时只存状态，不存 bounds（否则会把巨大化的尺寸当默认值）
            const isMaximized = mainWindow.isMaximized();
            const isFullScreen = mainWindow.isFullScreen();
            const bounds = (isMaximized || isFullScreen) ? null : mainWindow.getBounds();
            store.set('state', {
                bounds,
                isMaximized,
                isFullScreen
            });
        } catch (e) {
            // 忽略保存失败
        }
    }, 300);
}

// 读取并校验上次窗口状态（多显示器边界校验，窗口在屏幕外则丢弃 x/y）
function loadWindowState() {
    const { screen } = require('electron');
    const store = getWinStateStore();
    const state = store.get('state');
    if (!state) return null;

    if (state.isMaximized || state.isFullScreen || !state.bounds) {
        return { isMaximized: !!state.isMaximized, isFullScreen: !!state.isFullScreen };
    }

    // 校验 bounds 是否在某个显示器可视范围内
    const bounds = state.bounds;
    const display = screen.getDisplayMatching(bounds);
    const visibleArea = display.workArea;
    const isVisible =
        bounds.x + bounds.width > visibleArea.x &&
        bounds.x < visibleArea.x + visibleArea.width &&
        bounds.y + bounds.height > visibleArea.y &&
        bounds.y < visibleArea.y + visibleArea.height;

    if (!isVisible) {
        // 窗口在屏幕外（如副屏已拔除），丢弃位置只保留尺寸
        return { width: bounds.width, height: bounds.height };
    }

    return {
        x: bounds.x,
        y: bounds.y,
        width: bounds.width,
        height: bounds.height,
        isMaximized: false,
        isFullScreen: false
    };
}

function createWindow() {
    console.time('[startup] BrowserWindow 创建');

    // 恢复上次窗口状态
    const saved = loadWindowState();
    const defaultWidth = 960;
    const defaultHeight = 680;

    mainWindow = new BrowserWindow({
        width: (saved && saved.width) || defaultWidth,
        height: (saved && saved.height) || defaultHeight,
        x: (saved && saved.x !== undefined) ? saved.x : undefined,
        y: (saved && saved.y !== undefined) ? saved.y : undefined,
        minWidth: 800,
        minHeight: 600,
        title: 'Canbox Manager',
        show: false,
        icon: path.join(__dirname, 'logo.png'),
        backgroundColor: '#f7f8fa',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    console.timeEnd('[startup] BrowserWindow 创建');

    const isDev = process.env.NODE_ENV === 'development';
    console.log(`[startup] 模式: ${isDev ? '开发 (loadURL)' : '生产 (loadFile)'}`);

    if (isDev) {
        mainWindow.loadURL('http://localhost:5101');
        mainWindow.webContents.openDevTools({ mode: 'detach' });
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }

    // 恢复最大化 / 全屏状态（需在窗口 show 之后才生效）
    if (saved && saved.isMaximized) {
        mainWindow.maximize();
    } else if (saved && saved.isFullScreen) {
        mainWindow.setFullScreen(true);
    }

    // 监听窗口状态变化，节流持久化（resize/move/close 都会触发）
    mainWindow.on('resize', saveWindowState);
    mainWindow.on('move', saveWindowState);
    mainWindow.on('maximize', saveWindowState);
    mainWindow.on('unmaximize', saveWindowState);
    mainWindow.on('enter-full-screen', saveWindowState);
    mainWindow.on('leave-full-screen', saveWindowState);
    mainWindow.on('close', saveWindowState);

    // 应用保存的缩放比例（dom-ready 后设置，避免闪烁）
    mainWindow.webContents.on('dom-ready', () => {
        try {
            const store = require(path.join(CORE_PATH, 'lib', 'store'));
            const settingsStore = store.getStore('canbox-manager', 'settings', path.join(USERS_PATH, 'data'));
            const zoomFactor = settingsStore.get('zoomFactor') || 1.0;
            if (zoomFactor !== 1.0) {
                mainWindow.webContents.setZoomFactor(zoomFactor);
                console.log(`[startup] Applied zoom factor: ${zoomFactor}`);
            }
        } catch (e) {
            // 忽略
        }
    });
}

/**
 * Vue 挂载完成后通过 IPC 通知主进程显示窗口
 */
ipcMain.handle('manager.appReady', () => {
    if (mainWindow && !mainWindow.isVisible()) {
        console.timeEnd('[startup] ready-to-show (Vue 挂载后首次渲染)');
        console.timeEnd('[startup] main.js 模块加载到 window-ready 总耗时');
        mainWindow.show();
    }
});

console.time('[startup] 等待 app.whenReady');

// 正常启动 manager 窗口
app.whenReady().then(() => {
    console.timeEnd('[startup] 等待 app.whenReady');
    Menu.setApplicationMenu(null);
    // 生产模式下生成 manager 自身 launcher（已存在则跳过）
    appLauncher.generateManagerLauncher();
    createWindow();
    // 启动 10s 后后台检查更新（不阻塞启动）
    setTimeout(() => {
        updater.checkUpdate().then(result => {
            if (result.hasUpdate && mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('manager.update.available', result);
            }
        }).catch(() => {});
    }, 10000);
});

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});

// ====== 辅助函数 ======

function copyDirSync(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    const originalFs = require('original-fs');
    const entries = originalFs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            // 用 original-fs 复制，避免 Electron asar 补丁干扰 .asar 文件
            originalFs.copyFileSync(srcPath, destPath);
        }
    }
}


