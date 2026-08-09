#!/bin/bash
# Canbox Linux 打包脚本
# 产物: Canbox-linux-x86_64.sh (自解压安装脚本)
#
# 用法: npm run dist:linux
# 依赖: node_modules/electron (npm install 自动下载)

set -e

cd "$(dirname "$0")/.."

OUTPUT_DIR="release"
PKG_NAME="Canbox-linux-x86_64"
STAGE_DIR="$OUTPUT_DIR/stage"
TARBALL="$OUTPUT_DIR/canbox.tar.gz"
INSTALLER="$OUTPUT_DIR/$PKG_NAME.sh"

echo "====== Canbox Linux 打包 ======"

# 1. 构建 manager 前端
echo "[1/5] 构建 manager 前端 (vite build)..."
npm run build

# 2. 准备目录结构
echo "[2/5] 组装目录结构..."
rm -rf "$STAGE_DIR"
mkdir -p "$STAGE_DIR/canbox"

# 2a. 复制 electron 运行时（目录名带版本号，如 electron-42.5.1/）
ELECTRON_DIST="node_modules/electron/dist"
if [ ! -d "$ELECTRON_DIST" ]; then
    echo "错误: electron 运行时不存在，请先 npm install" >&2
    exit 1
fi
ELECTRON_VERSION=$(cat "$ELECTRON_DIST/version" 2>/dev/null || echo "")
if [ -z "$ELECTRON_VERSION" ]; then
    echo "错误: 无法读取 electron 版本号（$ELECTRON_DIST/version 不存在）" >&2
    exit 1
fi
cp -r "$ELECTRON_DIST" "$STAGE_DIR/canbox/electron-$ELECTRON_VERSION"
echo "  electron: $ELECTRON_VERSION → electron-$ELECTRON_VERSION/"

# 2b. 复制 canbox-core
CORE_SRC="../canbox-core"
if [ ! -d "$CORE_SRC" ]; then
    echo "错误: canbox-core 不存在: $CORE_SRC" >&2
    exit 1
fi
mkdir -p "$STAGE_DIR/canbox/canbox-core"
cp -r "$CORE_SRC"/{injection.js,lib,package.json} "$STAGE_DIR/canbox/canbox-core/"
# 复制 canbox-core 的 node_modules（electron-store, pouchdb, log4js, module-alias 等）
if [ -d "$CORE_SRC/node_modules" ]; then
    cp -r "$CORE_SRC/node_modules" "$STAGE_DIR/canbox/canbox-core/"
else
    echo "警告: canbox-core/node_modules 不存在，请先在 canbox-core 目录执行 npm install" >&2
fi
echo "  canbox-core: 已复制（含 node_modules）"

# 2c. 复制 manager 文件
MANAGER_DIR="$STAGE_DIR/canbox/manager"
mkdir -p "$MANAGER_DIR"
cp main.js preload.js repo-probe.js app-launcher.js updater.js catalog-manager.js package.json "$MANAGER_DIR/"
cp -r build icons "$MANAGER_DIR/"
cp logo.png logo.svg "$MANAGER_DIR/" 2>/dev/null || true
# 复制 manager 主进程运行时依赖（adm-zip, nanoid, axios 及传递依赖）
# 前端依赖（vue, element-plus 等）已由 vite 打包到 build/，不复制
node scripts/copy-runtime-deps.js node_modules "$MANAGER_DIR/node_modules"
echo "  manager: 已复制（含运行时依赖）"

# 2d. 复制 bin 启动器
mkdir -p "$STAGE_DIR/canbox/bin"
cp bin/canbox "$STAGE_DIR/canbox/bin/"
chmod +x "$STAGE_DIR/canbox/bin/canbox"
echo "  bin/canbox: 已复制"

# 3. 打包 tar.gz
echo "[3/5] 创建 tar.gz..."
tar czf "$TARBALL" -C "$STAGE_DIR" canbox/

# 4. 生成自解压安装脚本
echo "[4/5] 生成自解压安装脚本..."
cp scripts/installer-header.sh "$INSTALLER"
# 将 tar.gz 追加到安装脚本末尾
cat "$TARBALL" >> "$INSTALLER"
chmod +x "$INSTALLER"

# 5. 清理临时文件
echo "[5/5] 清理临时文件..."
rm -rf "$STAGE_DIR" "$TARBALL"

echo ""
echo "====== 打包完成 ======"
echo "产物: $INSTALLER"
echo "大小: $(du -h "$INSTALLER" | cut -f1)"
echo ""
echo "安装: ./$PKG_NAME.sh"
