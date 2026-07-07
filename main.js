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

// 获取 canbox-core 注入的环境信息（injection.js 通过 -r 预加载时挂到 global）
const env = global.__CANBOX_ENV__;
const USERS_PATH = env.usersPath;
// canbox-core 根目录路径（用于 require store 等模块）
const CORE_PATH = global.__CANBOX_CORE_PATH__;

let mainWindow = null;

// ====== Manager 专用 IPC Handlers ======

// -- APP 管理 --

// 生成随机 appId（8 位字母数字）
function generateAppId() {
    const { customAlphabet } = require('nanoid');
    return customAlphabet('0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz', 8)();
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
    const appsDir = path.join(USERS_PATH, 'apps');
    const os = require('os');

    if (!zipPath.toLowerCase().endsWith('.zip')) {
        return { success: false, error: 'Only .zip packages are supported' };
    }

    let tempDir = null;
    const prevNoAsar = process.noAsar;
    process.noAsar = true;
    try {
        const AdmZip = require('adm-zip');
        const zip = new AdmZip(zipPath);
        tempDir = path.join(os.tmpdir(), `canbox-import-${Date.now()}`);
        zip.extractAllTo(tempDir, true);

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
});

ipcMain.handle('manager.apps.remove', async (_e, appId) => {
    const appPath = path.join(USERS_PATH, 'apps', appId);

    if (!fs.existsSync(appPath)) {
        return { success: false, error: 'APP not found' };
    }

    fs.rmSync(appPath, { recursive: true, force: true });
    return { success: true };
});

ipcMain.handle('manager.apps.launch', async (_e, appId) => {
    const appDir = path.join(USERS_PATH, 'apps', appId);

    if (!fs.existsSync(appDir)) {
        return { success: false, error: 'APP not found' };
    }

    try {
        const coreInjection = path.join(global.__CANBOX_CORE_PATH__, 'injection.js');

        // 优先启动 app.asar，兼容源码目录模式
        const asarPath = path.join(appDir, 'app.asar');
        const target = fs.existsSync(asarPath) ? asarPath : appDir;

        const child = spawn(process.execPath, [
            '-r', coreInjection,
            target,
            `--app-id=${appId}`,
            '--no-sandbox'
        ], {
            detached: true,
            stdio: 'ignore'
        });
        child.unref();

        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.apps.clearData', async (_e, appId) => {
    const dataDir = path.join(USERS_PATH, 'data', appId);

    try {
        if (fs.existsSync(dataDir)) {
            fs.rmSync(dataDir, { recursive: true, force: true });
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.apps.getRunning', async () => {
    // TODO: 进程管理待实现
    return [];
});

// -- 仓库管理 --
// 仓库元数据存储在 manager 自己的 store 中（data/canbox-manager/store/repos.json）
// 通过 core store IPC 访问（黑盒式，appId=canbox-manager 自动路由）

ipcMain.handle('manager.repos.list', async () => {
    try {
        // manager 作为普通 APP，用 canbox.store 访问自己的数据
        // 这里在主进程中直接用 core 的 store 模块
        const store = require(path.join(CORE_PATH, 'lib', 'store'));
        const reposStore = store.getStore('canbox-manager', 'repos', path.join(USERS_PATH, 'data'));
        const list = reposStore.get('list') || [];
        return list;
    } catch (e) {
        return [];
    }
});

ipcMain.handle('manager.repos.add', async (_e, url, options) => {
    try {
        const store = require(path.join(CORE_PATH, 'lib', 'store'));
        const reposStore = store.getStore('canbox-manager', 'repos', path.join(USERS_PATH, 'data'));
        const list = reposStore.get('list') || [];

        const doc = {
            id: `repo_${Date.now()}`,
            url,
            name: (options && options.name) || url,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        list.push(doc);
        reposStore.set('list', list);
        return { success: true, repo: doc };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.remove', async (_e, repoId) => {
    try {
        const store = require(path.join(CORE_PATH, 'lib', 'store'));
        const reposStore = store.getStore('canbox-manager', 'repos', path.join(USERS_PATH, 'data'));
        let list = reposStore.get('list') || [];
        list = list.filter(r => r.id !== repoId);
        reposStore.set('list', list);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.sync', async (_e, repoId) => {
    // TODO: 仓库同步待实现
    return { success: false, error: 'Not implemented yet' };
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

// ====== 窗口创建 ======

function createWindow() {
    console.time('[startup] BrowserWindow 创建');

    mainWindow = new BrowserWindow({
        width: 960,
        height: 680,
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
app.whenReady().then(() => {
    console.timeEnd('[startup] 等待 app.whenReady');
    Menu.setApplicationMenu(null);
    createWindow();
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
    const entries = fs.readdirSync(src, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) {
            copyDirSync(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}


