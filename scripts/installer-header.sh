#!/bin/bash
# Canbox Linux 自解压安装脚本
# 用法: ./Canbox-linux-x86_64.sh [安装路径] [--uninstall]
#
# 默认安装到 /opt/canbox（需提权），也可指定用户目录。

set -e

# ====== 自解压机制 ======
# 脚本结构: [header(本文件)] + [tar.gz 二进制数据]
# 通过 SKIP_LINE 找到数据起始位置，提取后解压安装。
SKIP_LINE=$(awk '/^__TARBALL_BELOW__$/{print NR + 1; exit 0;}' "$0")
INSTALL_TMPDIR=$(mktemp -d /tmp/canbox-install.XXXXXX)

cleanup() {
    rm -rf "$INSTALL_TMPDIR"
}
trap cleanup EXIT

# 提取内嵌 tar.gz 并解压
echo "[canbox] 解压文件..."
tail -n +"$SKIP_LINE" "$0" | tar xz -C "$INSTALL_TMPDIR"

if [ ! -d "$INSTALL_TMPDIR/canbox" ]; then
    echo "[canbox] 错误: 解压失败" >&2
    exit 1
fi

# ====== 卸载模式 ======
if [ "${1:-}" = "--uninstall" ]; then
    INSTALL_DIR="${2:-/opt/canbox}"
    echo "[canbox] 卸载: $INSTALL_DIR"
    if [ ! -d "$INSTALL_DIR" ]; then
        echo "[canbox] 目录不存在，无需卸载"
        exit 0
    fi
    NEED_SUDO=0
    if [ ! -w "$INSTALL_DIR" ] && [ ! -w "$(dirname "$INSTALL_DIR")" ]; then
        NEED_SUDO=1
    fi
    if [ "$NEED_SUDO" = "1" ]; then
        echo "[canbox] 需要 sudo 权限删除 $INSTALL_DIR"
        sudo rm -rf "$INSTALL_DIR"
    else
        rm -rf "$INSTALL_DIR"
    fi
    # 删除 desktop 文件
    rm -f "$HOME/.local/share/applications/canbox.desktop" 2>/dev/null || true
    rm -f "$HOME/.local/share/applications/canbox-"*.desktop 2>/dev/null || true
    echo "[canbox] 卸载完成"
    exit 0
fi

# ====== 安装模式 ======
INSTALL_DIR="${1:-/opt/canbox}"

# 关闭正在运行的 manager（避免文件占用）
pkill -f "canbox-manager" 2>/dev/null || true
sleep 1

echo ""
echo "============================================"
echo "  Canbox 安装程序"
echo "============================================"
echo "  安装路径: $INSTALL_DIR"
echo "============================================"
echo ""

# 检查目标路径是否需要提权
NEED_SUDO=0
if [ "$(dirname "$INSTALL_DIR")" = "/opt" ] || [ ! -w "$(dirname "$INSTALL_DIR")" ] 2>/dev/null; then
    NEED_SUDO=1
    if [ "$NEED_SUDO" = "1" ]; then
        echo "[canbox] 安装到系统目录需要管理员权限（sudo）"
        echo "[canbox] 原因: $INSTALL_DIR 不在用户可写目录内"
        echo ""
    fi
fi

# 创建目标目录
if [ "$NEED_SUDO" = "1" ]; then
    sudo mkdir -p "$INSTALL_DIR"
    sudo cp -r "$INSTALL_TMPDIR/canbox/"* "$INSTALL_DIR/"
    # bin/canbox 需要可执行权限
    sudo chmod +x "$INSTALL_DIR/bin/canbox"
    sudo chmod +x "$INSTALL_DIR/electron/electron" 2>/dev/null || true
else
    mkdir -p "$INSTALL_DIR"
    cp -r "$INSTALL_TMPDIR/canbox/"* "$INSTALL_DIR/"
    chmod +x "$INSTALL_DIR/bin/canbox"
    chmod +x "$INSTALL_DIR/electron/electron" 2>/dev/null || true
fi

echo "[canbox] 文件已复制到 $INSTALL_DIR"

# 生成 manager desktop 快捷方式
APPS_DIR="$HOME/.local/share/applications"
mkdir -p "$APPS_DIR"

# 复制图标到用户可访问目录
ICON_DIR="$HOME/.local/share/canbox/icons"
mkdir -p "$ICON_DIR"
ICON_PATH=""
for ICON_SRC in "$INSTALL_DIR/manager/icons/512.png" "$INSTALL_DIR/manager/icons/256.png" "$INSTALL_DIR/manager/logo.png"; do
    if [ -f "$ICON_SRC" ]; then
        cp "$ICON_SRC" "$ICON_DIR/canbox.png" 2>/dev/null || true
        ICON_PATH="$ICON_DIR/canbox.png"
        break
    fi
done

DESKTOP_FILE="$APPS_DIR/canbox.desktop"
cat > "$DESKTOP_FILE" <<EOF
[Desktop Entry]
Name=Canbox
Comment=Canbox 应用集合平台
Exec="$INSTALL_DIR/bin/canbox" manager
${ICON_PATH:+Icon=$ICON_PATH}
Type=Application
Categories=Utility;Development;
Terminal=false
StartupNotify=true
StartupWMClass=canbox-manager
EOF
chmod +x "$DESKTOP_FILE"

echo "[canbox] 已创建桌面快捷方式: $DESKTOP_FILE"
echo ""
echo "============================================"
echo "  安装完成！"
echo "============================================"
echo ""

# 启动 manager（后台运行）
if [ -x "$INSTALL_DIR/bin/canbox" ]; then
    nohup "$INSTALL_DIR/bin/canbox" manager >/dev/null 2>&1 &
    echo "  Canbox Manager 已启动"
else
    echo "  从应用菜单中找到 'Canbox' 启动"
    echo "  或手动启动: $INSTALL_DIR/bin/canbox manager"
fi
echo ""
echo "  卸载: $0 --uninstall $INSTALL_DIR"
echo "============================================"

exit 0

__TARBALL_BELOW__
