#!/usr/bin/env node
/**
 * Canbox 启动器 (Node SEA, 跨平台)
 * 用法: canbox manager | canbox app <appId>
 *
 * 等价于 bin/canbox (bash) 的功能，由 Node SEA 编译为单一可执行文件。
 * Windows 产物: canbox.exe | Linux/macOS 产物: canbox
 *
 * 核心模式: spawn electron (detached) -> child.unref() -> process.exit(0)
 * canbox 立即退出，electron 独立运行（已通过 SEA demo 验证）。
 */

'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ====== 路径推导 ======
// SEA 中 process.execPath 是 canbox 可执行文件的路径
// canbox 位于 $INSTDIR/bin/canbox（Windows: canbox.exe），CANBOX_HOME 是 $INSTDIR
// 生产模式: 从 execPath 推导；开发/测试: 允许 CANBOX_HOME 环境变量覆盖
const BIN_DIR = path.dirname(process.execPath);
const CANBOX_HOME = process.env.CANBOX_HOME || path.dirname(BIN_DIR);
const CORE = path.join(CANBOX_HOME, 'canbox-core', 'injection.js');

// ====== 环境变量 ======
process.env.CANBOX_ENV = 'production';
process.env.NODE_ENV = 'production';
process.env.CANBOX_HOME = CANBOX_HOME;

// ====== USER_DATA 解析 ======
// 必须与 canbox-core/lib/env.js 保持一致：优先级 CANBOX_USER_DATA > CANBOX_HOME > 平台默认路径
// CANBOX_HOME 已在上方设置（与 canbox-core 读取的 env 变量一致），确保两者读到同一份 paths.json，
// 从而得到相同的 USERS_PATH，避免 launcher 与 manager 找 APP 的位置不一致。
// 注意：Linux 下 canbox-core 走 app.getPath('appData') → ~/.config/canbox，
//       bash 启动器 fallback 用 $HOME/.config/canbox；这里保持一致。
const DEFAULT_USER_DATA = process.platform === 'win32'
    ? path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'canbox')
    : path.join(os.homedir(), '.config', 'canbox');
const USER_DATA = process.env.CANBOX_USER_DATA
    || process.env.CANBOX_HOME
    || DEFAULT_USER_DATA;

// ====== USERS_PATH 解析 ======
let USERS_PATH = path.join(USER_DATA, 'Users');
const PATHS_JSON = path.join(USER_DATA, 'paths.json');
if (fs.existsSync(PATHS_JSON)) {
    try {
        const paths = JSON.parse(fs.readFileSync(PATHS_JSON, 'utf8'));
        if (paths && paths.usersPath) {
            USERS_PATH = paths.usersPath;
        }
    } catch (e) {
        // 解析失败用默认值
    }
}

// ====== electron 版本选择器（翻译自 bash 的 electron-selector 逻辑）======

// 白名单版本（与 bin/canbox 保持一致）
const ALLOWED_VERSIONS = { '42.5.1': true };

// electron 二进制文件名（按平台）
// Windows: electron.exe | Linux: electron | macOS: Electron.app/Contents/MacOS/Electron
const ELECTRON_BIN = process.platform === 'win32'
    ? 'electron.exe'
    : (process.platform === 'darwin' ? 'Electron.app/Contents/MacOS/Electron' : 'electron');

function parseVersion(ver) {
    const parts = String(ver).split('.').map(p => parseInt(p, 10) || 0);
    const major = parts[0] || 0;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    return `${String(major).padStart(3, '0')}.${String(minor).padStart(3, '0')}.${String(patch).padStart(3, '0')}`;
}

function compareVersions(a, b) {
    const aNorm = parseVersion(a);
    const bNorm = parseVersion(b);
    if (aNorm > bNorm) return 1;
    if (aNorm < bNorm) return -1;
    return 0;
}

function satisfies(version, range) {
    range = String(range).trim();
    if (range === '' || range === '*') return true;

    if (range.startsWith('^')) {
        const target = range.substring(1);
        const tParts = target.split('.').map(p => parseInt(p, 10) || 0);
        const vParts = version.split('.').map(p => parseInt(p, 10) || 0);
        if (vParts[0] !== tParts[0]) return false;
        return compareVersions(version, target) >= 0;
    }

    return compareVersions(version, range) === 0;
}

function getElectronRange(appDir) {
    const metaFile = path.join(appDir, '.canbox-app');
    if (!fs.existsSync(metaFile)) return '';
    try {
        const content = JSON.parse(fs.readFileSync(metaFile, 'utf8'));
        return (content && content.electron && content.electron.range) || '';
    } catch (e) {
        return '';
    }
}

function scanBuiltinVersions() {
    const results = [];
    let entries = [];
    try {
        entries = fs.readdirSync(CANBOX_HOME, { withFileTypes: true });
    } catch (e) {
        return results;
    }
    for (const entry of entries) {
        if (entry.isDirectory() && entry.name.startsWith('electron-')) {
            const electronPath = path.join(CANBOX_HOME, entry.name, ELECTRON_BIN);
            if (fs.existsSync(electronPath)) {
                const ver = entry.name.replace(/^electron-/, '');
                results.push(ver);
            }
        }
    }
    return results;
}

function readDownloadedVersions() {
    const registryPath = path.join(USER_DATA, 'runtime', 'electron-registry.json');
    if (!fs.existsSync(registryPath)) return [];
    try {
        const json = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        if (!json || !json.installedVersions) return [];
        const versions = [];
        for (const key of Object.keys(json.installedVersions)) {
            const entry = json.installedVersions[key];
            if (entry && entry.electron) {
                versions.push(entry.electron);
            }
        }
        return versions;
    } catch (e) {
        return [];
    }
}

function getDownloadedVersionPath(ver) {
    const registryPath = path.join(USER_DATA, 'runtime', 'electron-registry.json');
    if (!fs.existsSync(registryPath)) return '';
    try {
        const json = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
        if (!json || !json.installedVersions) return '';
        for (const key of Object.keys(json.installedVersions)) {
            const entry = json.installedVersions[key];
            if (entry && entry.electron === ver && entry.path) {
                const electronPath = path.join(USER_DATA, 'runtime', entry.path, ELECTRON_BIN);
                if (fs.existsSync(electronPath)) return electronPath;
            }
        }
        return '';
    } catch (e) {
        return '';
    }
}

function findBuiltinElectron() {
    const versions = scanBuiltinVersions();
    if (versions.length === 0) return '';
    // 选最新版本
    let selected = versions[0];
    for (const ver of versions) {
        if (compareVersions(ver, selected) > 0) selected = ver;
    }
    return path.join(CANBOX_HOME, `electron-${selected}`, ELECTRON_BIN);
}

function resolveAppElectron(appDir) {
    const range = getElectronRange(appDir);
    if (!range) {
        fail('APP 未声明 electron 版本（.canbox-app 中 electron.range 缺失）');
    }

    // 白名单中满足 range 的候选
    const allowedCandidates = Object.keys(ALLOWED_VERSIONS).filter(v => satisfies(v, range));
    if (allowedCandidates.length === 0) {
        fail(`canbox 未纳入满足 ${range} 的 electron 版本`);
    }

    const builtinVersions = scanBuiltinVersions();
    const downloadedVersions = readDownloadedVersions();
    const allCandidates = [...builtinVersions, ...downloadedVersions];

    // 交集：既在白名单候选中，又在可用版本中
    const validCandidates = allCandidates.filter(v => allowedCandidates.includes(v));

    if (validCandidates.length === 0) {
        // 选白名单中最高的版本提示下载
        let highestAllowed = allowedCandidates[0];
        for (const v of allowedCandidates) {
            if (compareVersions(v, highestAllowed) > 0) highestAllowed = v;
        }
        fail(`需要下载 electron: ${highestAllowed}`);
    }

    // 选最高的有效版本
    let selectedVersion = validCandidates[0];
    for (const v of validCandidates) {
        if (compareVersions(v, selectedVersion) > 0) selectedVersion = v;
    }

    // 优先用 builtin，否则用 downloaded
    let electronPath = '';
    if (builtinVersions.includes(selectedVersion)) {
        electronPath = path.join(CANBOX_HOME, `electron-${selectedVersion}`, ELECTRON_BIN);
    } else {
        electronPath = getDownloadedVersionPath(selectedVersion);
    }

    if (!electronPath || !fs.existsSync(electronPath)) {
        fail(`找不到 electron 二进制文件: ${selectedVersion}`);
    }

    return electronPath;
}

// ====== 启动 electron ======
function launchElectron(electronPath, args) {
    const child = spawn(electronPath, args, {
        detached: true,
        stdio: 'ignore',
        windowsHide: false  // electron 是 GUI 程序，不应隐藏
    });
    child.unref();
    child.on('error', (err) => {
        fail(`启动 electron 失败: ${err.message}`);
    });
    // 立即退出，electron 独立运行
    process.exit(0);
}

// ====== 错误处理 ======
function fail(message) {
    const logPath = path.join(process.env.TEMP || os.tmpdir(), 'canbox-launcher-error.log');
    const timestamp = new Date().toISOString();
    const logLine = `[${timestamp}] ${message}\n`;
    try {
        fs.appendFileSync(logPath, logLine);
    } catch (e) {
        // 日志写入失败只能忽略
    }
    // 弹原生对话框：Windows 用 PowerShell + MessageBox，Linux 用 zenity
    // TODO(linux): zenity 未安装时 fallback 到 stderr（Linux 环境实测时调整）
    try {
        if (process.platform === 'win32') {
            const escaped = message.replace(/'/g, "''");
            spawn('powershell.exe', [
                '-NoProfile', '-NoNewWindow', '-Command',
                `Add-Type -AssemblyName PresentationFramework; [System.Windows.MessageBox]::Show('${escaped}', 'Canbox', 'OK', 'Error') > $null`
            ], {
                detached: true,
                stdio: 'ignore',
                windowsHide: true
            }).unref();
        } else {
            // Linux/macOS: zenity --error（若无 zenity 则仅写日志，不弹窗）
            spawn('zenity', ['--error', `--text=${message}`, '--title=Canbox'], {
                detached: true,
                stdio: 'ignore'
            }).unref();
        }
    } catch (e) {
        // 对话框失败只能忽略
    }
    process.exit(1);
}

// ====== 命令分发 ======
const command = process.argv[2];
const EXE_NAME = process.platform === 'win32' ? 'canbox.exe' : 'canbox';

if (command === 'manager') {
    // 检查 CORE
    if (!fs.existsSync(CORE)) {
        fail(`找不到 canbox-core: ${CORE}`);
    }
    const electron = findBuiltinElectron();
    if (!electron) {
        fail(`找不到 builtin electron（${CANBOX_HOME}/electron-*/${ELECTRON_BIN}）`);
    }
    const managerPath = path.join(CANBOX_HOME, 'manager') + path.sep;
    launchElectron(electron, ['-r', CORE, managerPath, '--app-id=canbox-manager', '--no-sandbox']);

} else if (command === 'app') {
    const appId = process.argv[3];
    if (!appId) {
        fail(`Canbox 启动器\n用法: ${EXE_NAME} manager | ${EXE_NAME} app <appId>`);
    }

    // 检查 CORE
    if (!fs.existsSync(CORE)) {
        fail(`找不到 canbox-core: ${CORE}`);
    }

    // 优先 USERS_PATH/apps/<appId>，fallback 到 CANBOX_HOME/apps/<appId>
    const userAppDir = path.join(USERS_PATH, 'apps', appId);
    const homeAppDir = path.join(CANBOX_HOME, 'apps', appId);
    let appDir = '';
    let appTarget = '';

    if (fs.existsSync(path.join(userAppDir, 'app.asar'))) {
        appDir = userAppDir;
        appTarget = path.join(userAppDir, 'app.asar');
    } else if (fs.existsSync(userAppDir) && fs.statSync(userAppDir).isDirectory()) {
        appDir = userAppDir;
        appTarget = userAppDir + path.sep;
    } else if (fs.existsSync(path.join(homeAppDir, 'app.asar'))) {
        appDir = homeAppDir;
        appTarget = path.join(homeAppDir, 'app.asar');
    } else if (fs.existsSync(homeAppDir) && fs.statSync(homeAppDir).isDirectory()) {
        appDir = homeAppDir;
        appTarget = homeAppDir + path.sep;
    } else {
        fail(`APP 不存在: ${appId} (尝试: ${userAppDir}, ${homeAppDir})`);
    }

    const electron = resolveAppElectron(appDir);

    // 检测 IS_WEB_APP
    let isWebApp = false;
    const canboxAppFile = path.join(appDir, '.canbox-app');
    if (fs.existsSync(canboxAppFile)) {
        try {
            const meta = JSON.parse(fs.readFileSync(canboxAppFile, 'utf8'));
            if (meta && meta.type === 'web') {
                isWebApp = true;
            }
        } catch (e) {
            // 解析失败当作非 web app
        }
    }

    if (isWebApp) {
        launchElectron(electron, [appTarget, '--no-sandbox']);
    } else {
        launchElectron(electron, ['-r', CORE, appTarget, `--app-id=${appId}`, '--no-sandbox']);
    }
} else {
    fail(`Canbox 启动器\n用法: ${EXE_NAME} manager | ${EXE_NAME} app <appId>`);
}
