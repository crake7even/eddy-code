#!/usr/bin/env bash
# Eddy Code 一键安装 (TypeScript 版)
# 前置: Node.js >= 22.0.0, Git
# 国内用户建议科学上网，如遇网络错误请多尝试几次

set -euo pipefail

# 参数解析
UPGRADE_MODE=false
FORCE_MODE=false
while [[ $# -gt 0 ]]; do
    case "$1" in
        --upgrade) UPGRADE_MODE=true; shift ;;
        --force)   FORCE_MODE=true;   shift ;;
        *)         shift ;;
    esac
done

REPO="crake7even/eddy-code"
# 与仓库根 package.json 的 packageManager 保持一致
PNPM_VERSION="10.33.0"
# 默认安装最新发布版本（v* tag）；可用 EDDY_VERSION=0.6.7 指定版本
EDDY_VERSION="${EDDY_VERSION:-}"
# 用户数据（config.toml、sessions、memory 等）在 DATA_DIR，代码装在它下面的 app/，
# 升级只替换 app/，不碰用户数据。
DATA_DIR="${HOME}/.eddy-code"
DEFAULT_DIR="$DATA_DIR/app"
INSTALL_DIR="${INSTALL_DIR:-$DEFAULT_DIR}"
BIN_DIR="$DATA_DIR/bin"
EDDY_HOME="$INSTALL_DIR"

info()  { echo "[INFO]  $*"; }
warn()  { echo "[WARN]  $*" >&2; }
error() { echo "[ERROR] $*" >&2; }

# ══════════════════════════════════════════════════════════════════════════════
# 0. 彻底清理所有旧版本 eddy（Python / pip / uv），确保全新安装不冲突
# ══════════════════════════════════════════════════════════════════════════════
info "清理旧 eddy 版本..."

# ── 删除所有已知位置的旧 eddy 命令 ──
for dir in \
    "$HOME/.eddy-code/bin" \
    "$HOME/.eddy-code/bin" \
    "$HOME/.local/bin" \
    "/usr/local/bin" \
    "/opt/homebrew/bin"; do
    if [ -f "$dir/eddy" ]; then
        rm -f "$dir/eddy"
        info "已删除旧命令: $dir/eddy"
    fi
done

# ── 卸载 pip / pipx / uv 全局安装的旧 eddy 包 ──

# ── 删除旧安装目录：只删确认是 eddy-code 源码的目录，绝不删用户数据 ──
is_eddy_checkout() {
    [ -f "$1/package.json" ] && grep -q '"name": *"@eddy-code/monorepo"' "$1/package.json"
}

resolve_dir() {
    (cd "$1" 2>/dev/null && pwd -P)
}

# 旧版把代码直接装在 ~/.eddy-code，和用户数据混在一起：只删仓库文件和构建产物，
# 保留 config.toml、sessions、memory、AGENTS.md（用户全局指令）、bin/ 等。
if is_eddy_checkout "$DATA_DIR"; then
    info "迁移旧安装布局: 仅移除 $DATA_DIR 中的源码文件，保留用户数据"
    repo_entries=$(git -C "$DATA_DIR" ls-tree --name-only HEAD 2>/dev/null) || {
        error "无法识别 $DATA_DIR 中的旧版源码文件，为避免误删用户数据已停止安装"
        echo "请手动删除 $DATA_DIR 中的源码文件（保留 config.toml、sessions、memory 等）后重试"
        exit 1
    }
    while IFS= read -r entry; do
        case "$entry" in
            ''|AGENTS.md|bin) ;;
            *) rm -rf "${DATA_DIR:?}/$entry" ;;
        esac
    done <<< "$repo_entries"
    rm -rf "${DATA_DIR:?}/.git" "${DATA_DIR:?}/node_modules"
fi

if [ -e "$INSTALL_DIR" ]; then
    resolved=$(resolve_dir "$INSTALL_DIR") || {
        error "安装路径不是目录: $INSTALL_DIR"
        exit 1
    }
    if [ "$resolved" = "/" ] || [ "$resolved" = "$(resolve_dir "$HOME")" ] \
        || [ "$resolved" = "$(resolve_dir "$DATA_DIR")" ]; then
        error "拒绝删除 $INSTALL_DIR：它是根目录、用户主目录或 eddy 数据目录"
        exit 1
    fi
    if is_eddy_checkout "$INSTALL_DIR"; then
        info "删除旧安装目录: $INSTALL_DIR"
        rm -rf "$INSTALL_DIR"
    elif [ -z "$(ls -A "$INSTALL_DIR")" ]; then
        rmdir "$INSTALL_DIR"
    else
        error "安装路径 $INSTALL_DIR 已存在且不是 eddy-code 安装，为避免误删已停止"
        echo "请换一个 INSTALL_DIR，或确认无用后手动删除该目录"
        exit 1
    fi
fi

# ── 清理 shell 配置中的所有旧 eddy-code PATH 条目 ──
for rc in "$HOME/.zshrc" "$HOME/.bashrc" "$HOME/.bash_profile" "$HOME/.zprofile"; do
    if [ -f "$rc" ]; then
        sed -i.bak '/\.eddy-code\/bin/d' "$rc" 2>/dev/null || true
        sed -i.bak '/eddy-code.*PATH/d' "$rc" 2>/dev/null || true
        rm -f "${rc}.bak" 2>/dev/null || true
    fi
done
info "旧版本清理完毕"

# ══════════════════════════════════════════════════════════════════════════════
# 1. 检测 Node.js >= 22.0.0
# ══════════════════════════════════════════════════════════════════════════════
find_node() {
    for cmd in node nodejs node22 node24 node25; do
        if command -v "$cmd" >/dev/null 2>&1; then
            ver_output=$($cmd --version 2>&1 | sed 's/^v//')
            if [[ "$ver_output" =~ ^([0-9]+)\.([0-9]+)\. ]]; then
                major="${BASH_REMATCH[1]}"
                minor="${BASH_REMATCH[2]}"
                if [[ "$major" -gt 22 ]] || { [[ "$major" -eq 22 ]] && [[ "$minor" -ge 0 ]]; }; then
                    echo "$cmd"
                    return 0
                fi
            fi
        fi
    done
    return 1
}

info "检测 Node.js >= 22.0.0..."
NODE_CMD=$(find_node) || {
    error "未找到 Node.js 22.0.0 或更高版本"
    echo ""
    echo "安装方式："
    echo "  macOS:    brew install node"
    echo "  通用:     https://nodejs.org/ 下载 LTS 版"
    echo ""
    exit 1
}
info "Node.js: $($NODE_CMD --version)"

# ── 2. 检测 Git ────────────────────────────────────────────────────────────
info "检测 Git..."
if ! command -v git >/dev/null 2>&1; then
    error "未找到 Git"
    echo ""
    echo "安装方式："
    echo "  macOS:    brew install git"
    echo "  Ubuntu:   sudo apt install git"
    echo "  其他:     https://git-scm.com/downloads"
    echo ""
    exit 1
fi
info "Git: $(git --version)"

# ── 3. 检测 / 安装 pnpm ────────────────────────────────────────────────────
info "检测 pnpm..."
if ! command -v pnpm >/dev/null 2>&1; then
    info "pnpm 未安装，正在自动安装..."
    if $NODE_CMD -e "process.exit(require('module').createRequire(import.meta.url)('child_process').execSync('corepack --version', {encoding:'utf8'}).trim() ? 0 : 1)" 2>/dev/null || command -v corepack >/dev/null 2>&1; then
        corepack enable 2>/dev/null || true
    fi
    if ! command -v pnpm >/dev/null 2>&1; then
        # 不执行远程安装脚本，也不全局安装：通过 npm 临时运行固定版本的 pnpm
        info "通过 npx 使用 pnpm@$PNPM_VERSION"
        pnpm() { npx --yes "pnpm@$PNPM_VERSION" "$@"; }
    fi
fi
info "pnpm: $(pnpm --version)"

# ── 4. 下载项目 ─────────────────────────────────────────────────────────────
if [ -z "$EDDY_VERSION" ]; then
    EDDY_VERSION=$(git ls-remote --tags --refs --sort=-v:refname "https://github.com/$REPO.git" 'v*' \
        | head -n 1 | sed 's#.*refs/tags/##') || true
    if [ -z "$EDDY_VERSION" ]; then
        error "无法获取 eddy-code 的发布版本"
        echo "请检查网络连接，或用 EDDY_VERSION=<版本号> 指定要安装的版本"
        exit 1
    fi
fi
case "$EDDY_VERSION" in [0-9]*) EDDY_VERSION="v$EDDY_VERSION" ;; esac

info "安装路径: $INSTALL_DIR"
info "下载 eddy-code $EDDY_VERSION..."
git clone --depth 1 --branch "$EDDY_VERSION" "https://github.com/$REPO.git" "$INSTALL_DIR" || {
    error "下载失败"
    echo "请检查网络连接（国内用户建议科学上网，或稍后重试）"
    exit 1
}
cd "$INSTALL_DIR"

# ── 5. 安装依赖并构建 ──────────────────────────────────────────────────────
info "安装依赖并构建..."
pnpm install --frozen-lockfile || {
    error "依赖安装失败"
    exit 1
}
pnpm -r build || {
    error "构建失败"
    exit 1
}

# ── 6. 创建 eddy 主命令，并只保留 eddy 主入口 ───────────────────────────
mkdir -p "$BIN_DIR"
cat > "$BIN_DIR/eddy" <<EOF
#!/usr/bin/env bash
EDDY_HOME="\${EDDY_HOME:-$(printf '%q' "$INSTALL_DIR")}"
cd "\$EDDY_HOME"
exec node "\$EDDY_HOME/apps/eddy-code/dist/main.mjs" "\$@"
EOF
chmod +x "$BIN_DIR/eddy"

# ── 7. 添加到 PATH ─────────────────────────────────────────────────────────
if [[ ":$PATH:" != *":$BIN_DIR:"* ]]; then
    SHELL_RC=""
    if [ -n "${ZSH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "zsh" ]; then
        SHELL_RC="$HOME/.zshrc"
    elif [ -n "${BASH_VERSION:-}" ] || [ "$(basename "$SHELL")" = "bash" ]; then
        SHELL_RC="$HOME/.bashrc"
    fi

    if [ -n "$SHELL_RC" ] && [ -f "$SHELL_RC" ]; then
        echo "export PATH=\"$BIN_DIR:\$PATH\"" >> "$SHELL_RC"
        info "已自动将 $BIN_DIR 加入 PATH ($SHELL_RC)"
    else
        echo ""
        echo "请手动添加以下到 shell 配置文件 (~/.bashrc 或 ~/.zshrc):"
        echo "  export PATH=\"$BIN_DIR:\$PATH\""
    fi
fi

export PATH="$BIN_DIR:$PATH"

info "安装完成！"
echo ""
echo "安装版本: $EDDY_VERSION"
echo "安装位置: $INSTALL_DIR"
echo "运行:     eddy --version"
echo ""
echo "如果命令找不到，请重新打开终端或执行: source ~/.bashrc (或 ~/.zshrc)"
