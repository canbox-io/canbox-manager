const fs = require('fs');
const path = require('path');

/**
 * Electron Builder afterPack 钩子
 *
 * 在 Linux 平台用启动脚本包装可执行文件，自动添加 --no-sandbox 参数。
 * 解决 AppImage 的 SUID sandbox 权限问题，用户无需手动加 --no-sandbox。
 *
 * 仅影响 Linux 平台，Windows/macOS 不受影响。
 */
exports.default = async function(context) {
    if (context.electronPlatformName !== 'linux') {
        return;
    }

    const appOutDir = context.appOutDir;
    // Linux 可执行文件名默认用 package.json 的 name 字段
    const executableName = require('./package.json').name;
    const originalBinary = path.join(appOutDir, executableName);
    const wrappedBinary = path.join(appOutDir, executableName + '-bin');

    console.log('[afterPack] Linux 平台，包装可执行文件:', executableName);

    if (!fs.existsSync(originalBinary)) {
        console.warn('[afterPack] 可执行文件不存在:', originalBinary);
        return;
    }

    // 1. 重命名原始可执行文件
    fs.renameSync(originalBinary, wrappedBinary);
    console.log('[afterPack] 重命名:', executableName, '->', executableName + '-bin');

    // 2. 创建启动脚本替代原可执行文件
    const launchScript = `#!/bin/bash
# Canbox 启动脚本 - 自动添加 --no-sandbox 参数
SCRIPT_DIR="$(cd "$(dirname "$(readlink -f "$0")")" && pwd)"
exec "$SCRIPT_DIR/${executableName}-bin" "$@" --no-sandbox
`;
    fs.writeFileSync(originalBinary, launchScript, { mode: 0o755 });
    fs.chmodSync(originalBinary, 0o755);
    console.log('[afterPack] 启动脚本创建完成:', originalBinary);
};
