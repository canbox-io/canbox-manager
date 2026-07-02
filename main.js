/**
 * canbox-manager — App 主进程入口
 *
 * 这是一个标准的 Electron APP，通过 canbox-core 注入启动：
 *   electron -r canbox-core/injection.js canbox-manager/
 *
 * 与普通 APP 无任何区别，不拥有特殊权限。
 * 通过 canbox-core 提供的 store / db 等 API 实现：
 *   - APP 注册管理（导入、删除、清理数据）
 *   - 仓库管理（添加/删除仓库、浏览/下载 APP）
 *   - 系统设置（语言、字体、执行模式等）
 */

const { app, BrowserWindow } = require('electron');
const path = require('path');

let mainWindow = null;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 960,
        height: 680,
        minWidth: 800,
        minHeight: 600,
        title: 'Canbox Manager',
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: false
        }
    });

    // 开发模式加载 vite dev server，生产模式加载构建产物
    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, 'build', 'index.html'));
    }
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
    app.quit();
});

app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
        createWindow();
    }
});
