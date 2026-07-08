/**
 * canbox-manager — APP 启动器文件管理
 *
 * 在生产模式（app.isPackaged()）下，为已安装的 APP 生成系统快捷方式：
 *   Linux:   ~/.local/share/applications/canbox-{name}.desktop
 *   Windows: %APPDATA%/Microsoft/Windows/Start Menu/Programs/canbox-{name}.lnk
 *   macOS:   /Applications/canbox-{name}.app (alias)
 *
 * launcher 指向 manager 可执行文件，通过 --launch-app-id 参数启动对应 APP。
 * manager 收到此参数后 spawn APP 然后立即退出（不显示 manager 窗口）。
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

/**
 * 判断当前是否应写 launcher（仅生产模式）
 */
function shouldWriteLauncher() {
    try {
        const { app } = require('electron');
        return app.isPackaged;
    } catch (e) {
        return false;
    }
}

/**
 * 获取 launcher 文件名（不含路径）
 */
function getLauncherName(appName) {
    return `canbox-${appName}`;
}

/**
 * 获取 launcher 文件路径
 */
function getLauncherPath(appName) {
    const launcherName = getLauncherName(appName);
    if (process.platform === 'win32') {
        const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        return path.join(programsPath, `${launcherName}.lnk`);
    } else if (process.platform === 'darwin') {
        return path.join('/Applications', `${launcherName}.app`);
    } else {
        const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
        return path.join(applicationsPath, `${launcherName}.desktop`);
    }
}

/**
 * 获取图标缓存路径
 */
function getIconPath(appId, logoDataUri) {
    if (!logoDataUri) return null;
    const iconDir = path.join(os.homedir(), '.local', 'share', 'canbox', 'icons');
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

    // 解析 data URI
    const match = logoDataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'svg+xml' ? 'svg' : match[1];
    const iconPath = path.join(iconDir, `${appId}.${ext}`);
    try {
        fs.writeFileSync(iconPath, Buffer.from(match[2], 'base64'));
        return iconPath;
    } catch (e) {
        return null;
    }
}

/**
 * 生成 launcher 文件
 * @param {Object} appInfo { appId, name, description, logo }
 * @returns {Object} { success, error? }
 */
function generateLauncher(appInfo) {
    if (!shouldWriteLauncher()) {
        return { success: true, skipped: true };
    }

    const { appId, name, description } = appInfo;
    const launcherName = getLauncherName(name);
    const execPath = process.env.APPIMAGE || process.execPath;
    const args = `--launch-app-id=${appId} --no-sandbox`;
    const iconPath = getIconPath(appId, appInfo.logo);

    try {
        if (process.platform === 'win32') {
            const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
            if (!fs.existsSync(programsPath)) fs.mkdirSync(programsPath, { recursive: true });
            const launcherPath = path.join(programsPath, `${launcherName}.lnk`);
            const escapedTarget = execPath.replace(/\\/g, '\\\\');
            const escapedArgs = args;
            const escapedIcon = iconPath ? iconPath.replace(/\\/g, '\\\\') : '';
            const cmd = `powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${launcherPath.replace(/\\/g, '\\\\')}'); $s.TargetPath = '${escapedTarget}'; $s.Arguments = '${escapedArgs}'; ${iconPath ? `$s.IconLocation = '${escapedIcon},0'; ` : ''}$s.Save()"`;
            execSync(cmd);
        } else if (process.platform === 'darwin') {
            // macOS: 创建 alias 到 /Applications
            const target = `"${execPath}" ${args}`;
            execSync(`osascript -e 'tell application "Finder" to make alias file to POSIX file ${target} at POSIX file "/Applications"'`);
        } else {
            // Linux: .desktop 文件
            const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
            if (!fs.existsSync(applicationsPath)) fs.mkdirSync(applicationsPath, { recursive: true });
            const launcherPath = path.join(applicationsPath, `${launcherName}.desktop`);
            const desktopFile = `[Desktop Entry]
Name=${launcherName}
Comment=${description || ''}
Exec="${execPath}" ${args}
${iconPath ? `Icon=${iconPath}` : ''}
Type=Application
Terminal=false
`;
            fs.writeFileSync(launcherPath, desktopFile);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 删除 launcher 文件
 * @param {string} appName APP 名称
 * @returns {Object} { success, error? }
 */
function deleteLauncher(appName) {
    if (!shouldWriteLauncher()) {
        return { success: true, skipped: true };
    }

    const launcherName = getLauncherName(appName);
    const launcherPath = getLauncherPath(appName);

    try {
        if (fs.existsSync(launcherPath)) {
            if (process.platform === 'darwin') {
                // macOS alias 需要用 trash
                execSync(`rm -rf "${launcherPath}"`);
            } else {
                fs.unlinkSync(launcherPath);
            }
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

module.exports = {
    shouldWriteLauncher,
    getLauncherPath,
    generateLauncher,
    deleteLauncher
};
