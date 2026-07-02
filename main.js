/**
 * canbox-manager — App 主进程入口
 *
 * 标准 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js canbox-manager/
 *
 * 与普通 APP 无区别，不拥有特殊权限。
 * 注册 manager 专用 IPC handlers（APP 管理、仓库管理、设置）。
 */

console.time('[startup] main.js 模块加载到 window-ready 总耗时');

const { app, BrowserWindow, ipcMain, dialog, shell } = require('electron');
const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

let mainWindow = null;

// ====== Manager 专用 IPC Handlers ======

// -- APP 管理 --
ipcMain.handle('manager.apps.list', async () => {
    const userData = app.getPath('userData');
    const appsDir = path.join(userData, 'apps');
    if (!fs.existsSync(appsDir)) return [];

    const entries = fs.readdirSync(appsDir, { withFileTypes: true });
    const apps = [];
    for (const entry of entries) {
        if (entry.isDirectory()) {
            const appPath = path.join(appsDir, entry.name);
            const pkgPath = path.join(appPath, 'package.json');
            if (fs.existsSync(pkgPath)) {
                try {
                    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
                    apps.push({
                        id: entry.name,
                        name: pkg.displayName || pkg.name || entry.name,
                        version: pkg.version || '0.0.0',
                        description: pkg.description || '',
                        author: pkg.author || '',
                        path: appPath
                    });
                } catch (e) {
                    // 解析失败的跳过
                }
            }
        }
    }
    return apps;
});

ipcMain.handle('manager.apps.import', async (_e, appPath) => {
    const userData = app.getPath('userData');
    const appsDir = path.join(userData, 'apps');

    // 验证 APP 目录
    const pkgPath = path.join(appPath, 'package.json');
    if (!fs.existsSync(pkgPath)) {
        return { success: false, error: 'Not a valid Canbox APP (no package.json)' };
    }

    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
    const appId = pkg.name;
    const destPath = path.join(appsDir, appId);

    if (fs.existsSync(destPath)) {
        return { success: false, error: 'APP already installed' };
    }

    // 复制 APP 目录
    fs.mkdirSync(destPath, { recursive: true });
    copyDirSync(appPath, destPath);

    return { success: true, appId };
});

ipcMain.handle('manager.apps.remove', async (_e, appId) => {
    const userData = app.getPath('userData');
    const appPath = path.join(userData, 'apps', appId);

    if (!fs.existsSync(appPath)) {
        return { success: false, error: 'APP not found' };
    }

    fs.rmSync(appPath, { recursive: true, force: true });
    return { success: true };
});

ipcMain.handle('manager.apps.launch', async (_e, appId) => {
    const userData = app.getPath('userData');
    const appPath = path.join(userData, 'apps', appId);
    const coreInjection = path.resolve(app.getAppPath(), '..', 'canbox-core', 'injection.js');

    if (!fs.existsSync(appPath)) {
        return { success: false, error: 'APP not found' };
    }

    try {
        const child = spawn(process.execPath, [
            '-r', coreInjection,
            appPath
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
    const userData = app.getPath('userData');
    const db = require(path.resolve(app.getAppPath(), '..', 'canbox-core', 'lib', 'db')).get(userData);

    try {
        // 清除 APP 在 apps 数据库中的数据
        const result = await db.apps.find({
            selector: { appId }
        });
        if (result.docs) {
            for (const doc of result.docs) {
                await db.apps.remove(doc);
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// -- 仓库管理 --
ipcMain.handle('manager.repos.list', async () => {
    const userData = app.getPath('userData');
    const db = require(path.resolve(app.getAppPath(), '..', 'canbox-core', 'lib', 'db')).get(userData);

    try {
        const result = await db.core.find({
            selector: { type: 'repo' }
        });
        return result.docs || [];
    } catch (e) {
        return [];
    }
});

ipcMain.handle('manager.repos.add', async (_e, url, options) => {
    const userData = app.getPath('userData');
    const db = require(path.resolve(app.getAppPath(), '..', 'canbox-core', 'lib', 'db')).get(userData);

    try {
        const doc = {
            _id: `repo_${Date.now()}`,
            type: 'repo',
            url,
            name: (options && options.name) || url,
            createdAt: Date.now(),
            updatedAt: Date.now()
        };
        await db.core.put(doc);
        return { success: true, repo: doc };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

ipcMain.handle('manager.repos.remove', async (_e, repoId) => {
    const userData = app.getPath('userData');
    const db = require(path.resolve(app.getAppPath(), '..', 'canbox-core', 'lib', 'db')).get(userData);

    try {
        const doc = await db.core.get(repoId);
        await db.core.remove(doc);
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
});

// -- 设置 --
ipcMain.handle('manager.settings.get', async (_e, key) => {
    const Store = require('electron-store');
    const userData = app.getPath('userData');
    const store = new Store({ cwd: userData, name: 'canbox' });
    return store.get(`manager.${key}`);
});

ipcMain.handle('manager.settings.set', async (_e, key, value) => {
    const Store = require('electron-store');
    const userData = app.getPath('userData');
    const store = new Store({ cwd: userData, name: 'canbox' });
    store.set(`manager.${key}`, value);
    return { success: true };
});

ipcMain.handle('manager.settings.getAll', async () => {
    const Store = require('electron-store');
    const userData = app.getPath('userData');
    const store = new Store({ cwd: userData, name: 'canbox' });
    const data = store.store;
    const result = {};
    for (const [key, value] of Object.entries(data)) {
        if (key.startsWith('manager.')) {
            result[key.slice(8)] = value;
        }
    }
    return result;
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
        backgroundColor: '#f7f8fa',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    console.timeEnd('[startup] BrowserWindow 创建');

    // --- 精细计时：页面加载各阶段 ---
    const loadPhaseTimers = {};

    mainWindow.webContents.on('did-start-navigation', (_e, _url, isInPlace) => {
        if (!isInPlace) {
            loadPhaseTimers.navigationStart = performance.now();
            console.log(`[startup:phase] did-start-navigation @ +${(performance.now()).toFixed(0)}ms`);
        }
    });
    mainWindow.webContents.on('did-navigate', (_e, _url) => {
        console.log(`[startup:phase] did-navigate @ +${(performance.now()).toFixed(0)}ms`);
    });
    mainWindow.webContents.on('did-start-loading', () => {
        loadPhaseTimers.loadingStart = performance.now();
        console.time('[startup] 页面加载 (did-finish-load)');
        console.log(`[startup:phase] did-start-loading @ +${(performance.now()).toFixed(0)}ms`);
    });
    mainWindow.webContents.on('dom-ready', () => {
        console.log(`[startup:phase] dom-ready @ +${(performance.now()).toFixed(0)}ms (自 start-loading: ${(performance.now() - (loadPhaseTimers.loadingStart || 0)).toFixed(0)}ms)`);
    });
    mainWindow.webContents.on('did-finish-load', () => {
        console.timeEnd('[startup] 页面加载 (did-finish-load)');
        console.log(`[startup:phase] did-finish-load @ +${(performance.now()).toFixed(0)}ms`);
    });

    const isDev = process.env.NODE_ENV === 'development';
    console.log(`[startup] 模式: ${isDev ? '开发 (loadURL)' : '生产 (loadFile)'}`);

    if (isDev) {
        mainWindow.loadURL('http://localhost:12334');
        // mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }
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
