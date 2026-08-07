/**
 * canbox-manager — APP 启动器文件管理
 *
 * 在生产模式（CANBOX_ENV=production，由 bin/canbox 设置）下，为已安装的 APP 生成系统快捷方式：
 *   Linux:   ~/.local/share/applications/canbox-{name}.desktop（文件名带前缀，菜单显示纯 name）
 *   Windows: %APPDATA%/Microsoft/Windows/Start Menu/Programs/Canbox/{name}.lnk（Canbox 子文件夹分组）
 *
 * launcher 指向 bin/canbox（或 bin/canbox.bat），通过 `app <appId>` 参数启动对应 APP。
 * bin/canbox 内部执行: electron -r core/injection.js <app.asar> --app-id=<id> --no-sandbox
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const { execSync } = require('child_process');
const { URL } = require('url');

/**
 * 从 URL 提取用于追加到显示名的英文标识
 * 解析 hostname，去 TLD、去 www/m 等常见前缀，提取有意义的英文标识
 * @param {string} urlString - 网页应用 URL
 * @returns {string|null} 英文标识（如 'Wenxin'），提取失败返回 null
 */
function extractDomainKeyword(urlString) {
    if (!urlString) return null;
    try {
        const parsed = new URL(urlString);
        const hostname = parsed.hostname;
        const parts = hostname.split('.').filter(p => p);

        parts.pop(); // 去掉 TLD
        const commonPrefixes = ['www', 'm', 'mobile', 'app', 'api', 'docs', 'blog', 'shop'];
        const meaningfulParts = parts.filter(p => !commonPrefixes.includes(p.toLowerCase()));

        if (meaningfulParts.length === 0) return null;

        const mainDomain = meaningfulParts[0];
        return mainDomain.charAt(0).toUpperCase() + mainDomain.slice(1);
    } catch (e) {
        return null;
    }
}

/**
 * 判断字符串是否全部为中文字符（不含标点/空格）
 */
function isAllChinese(str) {
    if (!str) return false;
    // 去掉空格和标点后检查是否全是中文
    const clean = str.replace(/[\s\u3000-\u303f\uff00-\uffef]/g, '');
    if (!clean) return false;
    return /^[\u4e00-\u9fff]+$/.test(clean);
}

/**
 * 解析 launcher 的显示名：全中文时追加英文标识
 * @param {string} name - 原始名称
 * @param {string} webAppUrl - 网页应用 URL
 * @returns {string} 解析后的显示名
 */
function resolveDisplayName(name, webAppUrl) {
    if (!webAppUrl || !name) return name;
    if (!isAllChinese(name)) return name;
    const keyword = extractDomainKeyword(webAppUrl);
    if (!keyword) return name;
    return name + keyword;
}

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
 * Windows 下使用 Node SEA 编译的 canbox.exe，Linux 下使用 bash 脚本 canbox
 */
function getBinLauncherPath() {
    const ext = process.platform === 'win32' ? 'canbox.exe' : 'canbox';
    return path.join(__dirname, '..', 'bin', ext);
}

/**
 * 获取 launcher 文件名（不含路径，带 canbox- 前缀，用于文件系统标识）
 */
function getLauncherName(appName) {
    return `canbox-${appName}`;
}

/**
 * 获取 launcher 文件路径
 * Linux:   ~/.local/share/applications/canbox-{name}.desktop（文件名带前缀，Name= 用纯 name）
 * Windows: %APPDATA%/Microsoft/Windows/Start Menu/Programs/Canbox/{name}.lnk（Canbox 子文件夹分组）
 */
function getLauncherPath(appName) {
    if (process.platform === 'win32') {
        // Windows: 放入 Canbox 子文件夹，文件名用纯 name，开始菜单显示为 "Canbox" 分组下的 "{name}"
        const canboxGroupPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Canbox');
        return path.join(canboxGroupPath, `${appName}.lnk`);
    } else {
        // Linux: 文件名保留 canbox- 前缀便于辨识，.desktop 的 Name= 用纯 name
        const launcherName = getLauncherName(appName);
        const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
        return path.join(applicationsPath, `${launcherName}.desktop`);
    }
}

/**
 * 获取图标缓存路径
 * Windows: 生成 .ico（PNG-in-ICO，Vista+ 支持），.lnk 的 IconLocation 对 ICO 支持可靠
 *          直接引用 PNG 在 Windows Shell 图标缓存中常无法正常显示
 * Linux:   生成原始格式（png/svg）
 */
function getIconPath(appId, logoDataUri) {
    if (!logoDataUri) return null;
    const iconDir = path.join(os.homedir(), '.local', 'share', 'canbox', 'icons');
    if (!fs.existsSync(iconDir)) fs.mkdirSync(iconDir, { recursive: true });

    // 解析 data URI
    const match = logoDataUri.match(/^data:image\/(\w+);base64,(.+)$/);
    if (!match) return null;
    const ext = match[1] === 'svg+xml' ? 'svg' : match[1];
    const imgBuf = Buffer.from(match[2], 'base64');

    try {
        if (process.platform === 'win32') {
            // Windows: 生成 ICO（PNG-in-ICO 格式）
            // SVG 无法直接放入 ICO，跳过（极少见，APP logo 一般是 PNG）
            if (ext === 'svg') return null;
            const icoPath = path.join(iconDir, `${appId}.ico`);
            const icoBuf = pngToIco(imgBuf);
            fs.writeFileSync(icoPath, icoBuf);
            return icoPath;
        } else {
            const iconPath = path.join(iconDir, `${appId}.${ext}`);
            fs.writeFileSync(iconPath, imgBuf);
            return iconPath;
        }
    } catch (e) {
        return null;
    }
}

/**
 * 将 PNG 字节流封装为 ICO 文件（PNG-in-ICO 格式，Windows Vista+ 支持）
 * ICO 结构: ICONDIR(6) + ICONDIRENTRY(16) + PNG data
 */
function pngToIco(pngBuf) {
    // ICONDIR: reserved(2)=0, type(2)=1(ICO), count(2)=1
    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0);  // reserved
    header.writeUInt16LE(1, 2);  // type = ICO
    header.writeUInt16LE(1, 4);  // count = 1

    // ICONDIRENTRY (16 bytes)
    // 从 PNG IHDR chunk 读取宽高（偏移 16: width 4字节, 20: height 4字节）
    let width = 0, height = 0;
    if (pngBuf.length >= 24 && pngBuf[0] === 0x89 && pngBuf[1] === 0x50) {
        width = pngBuf.readUInt32BE(16);
        height = pngBuf.readUInt32BE(20);
        // ICO 中 0 表示 256
        if (width === 256) width = 0;
        if (height === 256) height = 0;
    }
    const entry = Buffer.alloc(16);
    entry.writeUInt8(width & 0xFF, 0);     // width (0=256)
    entry.writeUInt8(height & 0xFF, 1);    // height (0=256)
    entry.writeUInt8(0, 2);                // colorCount (0=256色以上)
    entry.writeUInt8(0, 3);                // reserved
    entry.writeUInt16LE(1, 4);             // planes
    entry.writeUInt16LE(32, 6);            // bitCount
    entry.writeUInt32LE(pngBuf.length, 8); // bytesInRes
    entry.writeUInt32LE(22, 12);           // imageOffset (6+16)

    return Buffer.concat([header, entry, pngBuf]);
}

/**
 * 生成 launcher 文件
 * @param {Object} appInfo { appId, name, description, logo }
 * @param {Object} options { force?: boolean } force=true 时强制重新生成（用于修复）
 * @returns {Object} { success, error?, skipped? }
 */
function generateLauncher(appInfo, options) {
    const opts = options || {};
    if (!shouldWriteLauncher()) {
        return { success: true, skipped: true };
    }

    const { appId, name, description, wmClass } = appInfo;
    const launcherPath = getLauncherPath(name);

    // 已存在则跳过，避免重复生成（force 模式下不跳过）
    if (!opts.force && fs.existsSync(launcherPath)) {
        return { success: true, skipped: true };
    }

    const binPath = getBinLauncherPath();
    const args = `app ${appId}`;
    const iconPath = getIconPath(appId, appInfo.logo);
    const displayName = resolveDisplayName(name, appInfo.webAppUrl);

    console.log('[app-launcher] 生成 APP launcher:', name, '路径:', launcherPath);

    try {
        if (process.platform === 'win32') {
            // Windows: 确保 Canbox 子文件夹存在
            const canboxGroupPath = path.dirname(launcherPath);
            if (!fs.existsSync(canboxGroupPath)) fs.mkdirSync(canboxGroupPath, { recursive: true });
            // 注意：PowerShell 单引号字符串中不需要转义反斜杠
            const cmd = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${launcherPath}'); $s.TargetPath = '${binPath}'; $s.Arguments = '${args}'; ${iconPath ? `$s.IconLocation = '${iconPath},0'; ` : ''}$s.Save()"`;
            execSync(cmd);
        } else {
            // Linux: .desktop 文件，文件名带 canbox- 前缀，Name= 用解析后的显示名
            const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
            if (!fs.existsSync(applicationsPath)) fs.mkdirSync(applicationsPath, { recursive: true });
            const desktopFile = `[Desktop Entry]
Name=${displayName}
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
 * Windows: 放入 Canbox 子文件夹（与 NSIS installer 创建的路径一致），
 *          避免在 Programs 根目录产生重复的 Canbox.lnk。
 */
function getManagerLauncherPath() {
    if (process.platform === 'win32') {
        const canboxGroupPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Canbox');
        return path.join(canboxGroupPath, 'Canbox.lnk');
    } else {
        const applicationsPath = path.join(os.homedir(), '.local', 'share', 'applications');
        return path.join(applicationsPath, 'canbox.desktop');
    }
}

/**
 * 清理旧的 manager launcher 孤儿文件
 * 早期版本将 manager launcher 创建在 Programs 根目录（Canbox 子文件夹之外），
 * NSIS installer 实际创建在 Canbox 子文件夹内，导致出现两个 Canbox.lnk。
 * 此函数删除根目录下的孤儿，只保留子文件夹内的正确快捷方式。
 */
function cleanupOrphanManagerLauncher() {
    if (process.platform !== 'win32') return;
    const orphanPath = path.join(os.homedir(), 'AppData', 'Roaming', 'Microsoft', 'Windows', 'Start Menu', 'Programs', 'Canbox.lnk');
    try {
        if (fs.existsSync(orphanPath)) {
            fs.unlinkSync(orphanPath);
            console.log('[app-launcher] 清理旧的 manager launcher 孤儿:', orphanPath);
        }
    } catch (e) {
        // 清理失败不影响主流程
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

    // 清理早期版本遗留在 Programs 根目录的孤儿 manager launcher
    cleanupOrphanManagerLauncher();

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
            const cmd = `powershell -NoProfile -Command "$ws = New-Object -ComObject WScript.Shell; $s = $ws.CreateShortcut('${launcherPath}'); $s.TargetPath = '${binPath}'; $s.Arguments = 'manager'; ${iconPath ? `$s.IconLocation = '${iconPath},0'; ` : ''}$s.Save()"`;
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
    generateManagerLauncher,
    resolveDisplayName
};
