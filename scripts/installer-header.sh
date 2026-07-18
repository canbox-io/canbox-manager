#!/bin/bash
# Canbox Linux 自解压安装脚本
# 用法: ./Canbox-linux-x86_64.sh [安装路径] [--update] [--uninstall [路径]]
#
# 模式:
#   无参数 (tty)      交互式安装/更新，提示用户确认路径
#   --update          非交互更新，自动探测已安装路径并更新
#   [路径]            安装到指定路径
#   --uninstall [路径] 卸载指定路径（默认 /opt/canbox）
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

# ====== 公共函数 ======

# 探测已安装路径，输出路径或空
detectExistingInstall() {
    # 1. 从 desktop 文件 Exec 行反解
    local desktop_file="$HOME/.local/share/applications/canbox.desktop"
    if [ -f "$desktop_file" ]; then
        local exec_line=$(grep '^Exec=' "$desktop_file" | head -1)
        # Exec="/path/to/bin/canbox" manager  或  Exec=/path/to/bin/canbox manager
        local path=$(echo "$exec_line" | sed -E 's/^Exec="?([^"]+)"? .*/\1/')
        # 取 bin/canbox 的上级上级目录
        if [ -n "$path" ] && [ -f "$path" ]; then
            local bin_dir=$(dirname "$path")
            local install_dir=$(dirname "$bin_dir")
            if [ -f "$install_dir/bin/canbox" ]; then
                echo "$install_dir"
                return 0
            fi
        fi
    fi

    # 2. 常见路径探测
    for candidate in /opt/canbox "$HOME/.local/canbox" "$HOME/canbox"; do
        if [ -f "$candidate/bin/canbox" ]; then
            echo "$candidate"
            return 0
        fi
    done

    # 3. 未找到
    echo ""
    return 1
}

# 判断路径是否需要提权（目录不可写）
needPrivilege() {
    local target_dir="$1"
    local parent_dir=$(dirname "$target_dir")
    if [ ! -w "$parent_dir" ] 2>/dev/null; then
        return 0
    fi
    return 1
}

# 提权执行命令：优先 pkexec（GUI），降级 sudo
runPrivileged() {
    if command -v pkexec >/dev/null 2>&1; then
        pkexec "$@"
    else
        sudo "$@"
    fi
}

# 安装文件到目标目录（处理提权）
# 程序目录直接覆盖：先清理旧 builtin electron-* 目录，再复制新文件
installFiles() {
    local target_dir="$1"
    # 清理旧的 builtin electron 目录（electron-*），避免版本残留
    # 用户下载的 electron 在 userData/runtime/，不受影响
    if [ -d "$target_dir" ]; then
        rm -rf "$target_dir"/electron-* 2>/dev/null || true
    fi
    if needPrivilege "$target_dir"; then
        echo "[canbox] 安装到系统目录需要管理员权限"
        echo "[canbox] 路径: $target_dir"
        runPrivileged mkdir -p "$target_dir"
        runPrivileged cp -r "$INSTALL_TMPDIR/canbox/"* "$target_dir/"
        runPrivileged chmod +x "$target_dir/bin/canbox"
        # 给 builtin electron 二进制加执行权限（扫描 electron-* 目录）
        for e_dir in "$target_dir"/electron-*/; do
            if [ -f "${e_dir}electron" ]; then
                runPrivileged chmod +x "${e_dir}electron" 2>/dev/null || true
            fi
        done
    else
        mkdir -p "$target_dir"
        cp -r "$INSTALL_TMPDIR/canbox/"* "$target_dir/"
        chmod +x "$target_dir/bin/canbox"
        # 给 builtin electron 二进制加执行权限（扫描 electron-* 目录）
        for e_dir in "$target_dir"/electron-*/; do
            if [ -f "${e_dir}electron" ]; then
                chmod +x "${e_dir}electron" 2>/dev/null || true
            fi
        done
    fi
}

# 生成 desktop 快捷方式
generateDesktopFile() {
    local install_dir="$1"
    local apps_dir="$HOME/.local/share/applications"
    mkdir -p "$apps_dir"

    # 复制图标到用户可访问目录
    local icon_dir="$HOME/.local/share/canbox/icons"
    mkdir -p "$icon_dir"
    local icon_path=""
    for icon_src in "$install_dir/manager/icons/512.png" "$install_dir/manager/icons/256.png" "$install_dir/manager/logo.png"; do
        if [ -f "$icon_src" ]; then
            cp "$icon_src" "$icon_dir/canbox.png" 2>/dev/null || true
            icon_path="$icon_dir/canbox.png"
            break
        fi
    done

    local desktop_file="$apps_dir/canbox.desktop"
    cat > "$desktop_file" <<EOF
[Desktop Entry]
Name=Canbox
Comment=Canbox 应用集合平台
Exec="$install_dir/bin/canbox" manager
${icon_path:+Icon=$icon_path}
Type=Application
Categories=Utility;Development;
Terminal=false
StartupNotify=true
StartupWMClass=canbox-manager
EOF
    chmod +x "$desktop_file"
    echo "[canbox] 已创建桌面快捷方式: $desktop_file"
}

# 关闭正在运行的 manager（避免文件占用）
killRunningManager() {
    pkill -f "canbox-manager" 2>/dev/null || true
    sleep 1
}

# 启动 manager
launchManager() {
    local install_dir="$1"
    if [ -x "$install_dir/bin/canbox" ]; then
        nohup "$install_dir/bin/canbox" manager >/dev/null 2>&1 &
        echo "[canbox] Canbox Manager 已启动"
    else
        echo "[canbox] 启动失败: $install_dir/bin/canbox 不存在或不可执行"
    fi
}

# ====== 卸载模式 ======
if [ "${1:-}" = "--uninstall" ]; then
    INSTALL_DIR="${2:-/opt/canbox}"
    # 如果未指定路径，探测已安装路径
    if [ -z "${2:-}" ]; then
        INSTALL_DIR=$(detectExistingInstall)
        if [ -z "$INSTALL_DIR" ]; then
            INSTALL_DIR="/opt/canbox"
        fi
    fi
    echo "[canbox] 卸载: $INSTALL_DIR"
    if [ ! -d "$INSTALL_DIR" ]; then
        echo "[canbox] 目录不存在，无需卸载"
        exit 0
    fi
    if needPrivilege "$INSTALL_DIR"; then
        echo "[canbox] 需要 sudo 权限删除 $INSTALL_DIR"
        runPrivileged rm -rf "$INSTALL_DIR"
    else
        rm -rf "$INSTALL_DIR"
    fi
    rm -f "$HOME/.local/share/applications/canbox.desktop" 2>/dev/null || true
    rm -f "$HOME/.local/share/applications/canbox-"*.desktop 2>/dev/null || true
    echo "[canbox] 卸载完成"
    exit 0
fi

# ====== 更新模式（非交互）======
UPDATE_MODE=0
if [ "${1:-}" = "--update" ]; then
    UPDATE_MODE=1
    shift
fi

# ====== 安装模式 ======
# 关闭正在运行的 manager
killRunningManager

# 探测已安装路径
EXISTING_DIR=$(detectExistingInstall)

if [ "$UPDATE_MODE" = "1" ]; then
    # 非交互更新模式：必须有已安装路径，否则报错
    if [ -z "$EXISTING_DIR" ]; then
        echo "[canbox] --update 模式: 未检测到已安装的 Canbox，无法自动更新" >&2
        echo "[canbox] 请以交互模式运行安装程序进行首次安装" >&2
        exit 1
    fi
    INSTALL_DIR="$EXISTING_DIR"
    echo "[canbox] 更新模式: 检测到已安装路径 $INSTALL_DIR，开始更新"
else
    # 交互模式
    if [ -n "$EXISTING_DIR" ]; then
        # 已有安装：更新，告知路径
        echo ""
        echo "============================================"
        echo "  检测到已安装的 Canbox"
        echo "  安装路径: $EXISTING_DIR"
        echo "  将更新到该目录"
        echo "============================================"
        echo ""
        echo "按回车继续更新，或输入新路径覆盖安装: "
        read -r user_input
        if [ -n "$user_input" ]; then
            INSTALL_DIR="$user_input"
        else
            INSTALL_DIR="$EXISTING_DIR"
        fi
    else
        # 首次安装：提示默认路径或自定义
        DEFAULT_DIR="/opt/canbox"
        echo ""
        echo "============================================"
        echo "  Canbox 安装程序"
        echo "============================================"
        echo "  默认安装路径: $DEFAULT_DIR (需管理员权限)"
        echo "  或输入其他路径（如 $HOME/.local/canbox 无需提权）"
        echo "============================================"
        echo ""
        echo "请输入安装路径 (回车使用默认 $DEFAULT_DIR): "
        read -r user_input
        if [ -n "$user_input" ]; then
            INSTALL_DIR="$user_input"
        else
            INSTALL_DIR="$DEFAULT_DIR"
        fi
    fi
fi

echo ""
echo "============================================"
echo "  Canbox 安装程序"
echo "  安装路径: $INSTALL_DIR"
echo "============================================"
echo ""

# 安装文件
installFiles "$INSTALL_DIR"
echo "[canbox] 文件已复制到 $INSTALL_DIR"

# 生成 desktop 快捷方式
generateDesktopFile "$INSTALL_DIR"

echo ""
echo "============================================"
echo "  安装完成！"
echo "============================================"
echo ""

# 启动 manager
launchManager "$INSTALL_DIR"

echo ""
echo "  卸载: $0 --uninstall $INSTALL_DIR"
echo "============================================"

exit 0

__TARBALL_BELOW__
