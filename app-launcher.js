/**
 * canbox-manager — APP 启动器文件管理
 *
 * 在生产模式（CANBOX_ENV=production，由 bin/canbox 设置）下，为已安装的 APP 生成系统快捷方式：
 *   Linux:   ~/.local/share/applications/canbox-{name}.desktop
 *   Windows: %APPDATA%/Microsoft/Windows/Start Menu/Programs/canbox-{name}.lnk
 *
 * launcher 指向 bin/canbox（或 bin/canbox.bat），通过 `app <appId>` 参数启动对应 APP。
 * bin/canbox 内部执行: electron -r core/injection.js <app.asar> --app-id=<id> --no-sandbox
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');

/**
 * 判断当前是否应写 launcher（仅生产模式）
 * 生产模式由 bin/canbox 设置 CANBOX_ENV=production 环境变量
 */
function shouldWriteLauncher() {
    return process.env.CANBOX_ENV === 'production';
}

/**
 * 获取 bin/canbox 启动器路径
 * 生产模式下 __dirname 是 {CANBOX_HOME}/manager/，bin/canbox 在 {CANBOX_HOME}/bin/
 */
function getBinLauncherPath() {
    const ext = process.platform === 'win32' ? 'canbox.bat' : 'canbox';
    return path.join(__dirname, '..', 'bin', ext);
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

    const { appId, name, description, wmClass } = appInfo;
    const launcherName = getLauncherName(name);
    const launcherPath = getLauncherPath(name);

    // 已存在则跳过，避免重复生成
    if (fs.existsSync(launcherPath)) {
        return { success: true, skipped: true };
    }

    const binPath = getBinLauncherPath();
    const args = `app ${appId}`;
    const iconPath = getIconPath(appId, appInfo.logo);

    console.log('[app-launcher] 生成 APP launcher:', name, '路径:', launcherPath);

    try {
        if (process.platform === 'win32') {
            const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
            if (!fs.existsSync(programsPath)) fs.mkdirSync(programsPath, { recursive: true });
            const escapedTarget = binPath.replace(/\\/g, '\\\\');
            const escapedIcon = iconPath ? iconPath.replace(/\\/g, '\\\\') : '';
            const cmd = `powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${launcherPath.replace(/\\/g, '\\\\')}'); $s.TargetPath = '${escapedTarget}'; $s.Arguments = '${args}'; ${iconPath ? `$s.IconLocation = '${escapedIcon},0'; ` : ''}$s.Save()"`;
            execSync(cmd);
        } else {
            // Linux: .desktop 文件
            const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
            if (!fs.existsSync(applicationsPath)) fs.mkdirSync(applicationsPath, { recursive: true });
            const desktopFile = `[Desktop Entry]
Name=${launcherName}
Comment=${description || ''}
Exec="${binPath}" ${args}
${iconPath ? `Icon=${iconPath}` : ''}
Type=Application
Terminal=false
StartupNotify=true
StartupWMClass=${wmClass || name}
`;
            fs.writeFileSync(launcherPath, desktopFile);
            fs.chmodSync(launcherPath, 0o755);
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

    const launcherPath = getLauncherPath(appName);

    try {
        if (fs.existsSync(launcherPath)) {
            fs.unlinkSync(launcherPath);
        }
        return { success: true };
    } catch (e) {
        return { success: false, error: e.message };
    }
}

/**
 * 获取 manager 自身 launcher 路径
 */
function getManagerLauncherPath() {
    if (process.platform === 'win32') {
        const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
        return path.join(programsPath, 'Canbox.lnk');
    } else {
        const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
        return path.join(applicationsPath, 'canbox.desktop');
    }
}

/**
 * 生成 manager 自身的 launcher（出现在系统应用菜单中）
 * 启动时检查，已存在则跳过
 * @returns {Object} { success, skipped?, error? }
 */
function generateManagerLauncher() {
    if (!shouldWriteLauncher()) {
        return { success: true, skipped: true };
    }

    const launcherPath = getManagerLauncherPath();

    // 已存在则跳过
    if (fs.existsSync(launcherPath)) {
        return { success: true, skipped: true };
    }

    const binPath = getBinLauncherPath();

    // 从 manager 目录复制图标到外部缓存目录（desktop 环境需要可访问的图标路径）
    let iconPath = '';
    const iconDir = path.join(os.homedir(), '.local', 'share', 'canbox', 'icons');
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

    const iconSources = [
        path.join(__dirname, 'icons', '512.png'),
        path.join(__dirname, 'icons', '256.png'),
        path.join(__dirname, 'logo.png')
    ];
    for (const src of iconSources) {
        if (fs.existsSync(src)) {
            try {
                iconPath = path.join(iconDir, 'canbox.png');
                fs.copyFileSync(src, iconPath);
                break;
            } catch (e) {
                console.error('[app-launcher] 复制 manager 图标失败:', e.message);
                iconPath = '';
            }
        }
    }

    console.log('[app-launcher] 生成 manager launcher, 路径:', launcherPath);

    try {
        if (process.platform === 'win32') {
            const programsPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs');
            if (!fs.existsSync(programsPath)) fs.mkdirSync(programsPath, { recursive: true });
            const escapedTarget = binPath.replace(/\\/g, '\\\\');
            const escapedIcon = iconPath ? iconPath.replace(/\\/g, '\\\\') : '';
            const cmd = `powershell -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${launcherPath.replace(/\\/g, '\\\\')}'); $s.TargetPath = '${escapedTarget}'; $s.Arguments = 'manager'; ${iconPath ? `$s.IconLocation = '${escapedIcon},0'; ` : ''}$s.Save()"`;
            execSync(cmd);
        } else {
            const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
            if (!fs.existsSync(applicationsPath)) fs.mkdirSync(applicationsPath, { recursive: true });
            // StartupWMClass 必须与窗口实际 WM_CLASS 一致。
            // Electron Linux 的 WM_CLASS 由 package.json 的 name 字段决定（=canbox-manager）。
            const desktopFile = `[Desktop Entry]
Name=Canbox
Comment=Canbox 应用集合平台
Exec="${binPath}" manager
${iconPath ? `Icon=${iconPath}` : ''}
Type=Application
Categories=Utility;Development;
Terminal=false
StartupNotify=true
StartupWMClass=canbox-manager
`;
            fs.writeFileSync(launcherPath, desktopFile);
            fs.chmodSync(launcherPath, 0o755);
        }
        console.log('[app-launcher] manager launcher 生成成功');
        return { success: true };
    } catch (e) {
        console.error('[app-launcher] manager launcher 生成失败:', e.message);
        return { success: false, error: e.message };
    }
}

module.exports = {
    shouldWriteLauncher,
    getLauncherPath,
    generateLauncher,
    deleteLauncher,
    generateManagerLauncher
};
