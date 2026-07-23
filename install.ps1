# Eddy Code 一键安装 (TypeScript 版 / Windows)
# 前置: Node.js >= 22.0.0 + Git
# 国内用户建议科学上网，如遇网络错误请多尝试几次

$ErrorActionPreference = "Stop"

$Repo       = "crake7even/eddy-code"
$DefaultDir = "$env:USERPROFILE\eddy-code"
$InstallDir = if ($env:INSTALL_DIR) { $env:INSTALL_DIR } else { $DefaultDir }
$BinDir     = "$InstallDir\bin"

$UpgradeMode = $false
$ForceMode   = $false
foreach ($arg in $args) {
    if ($arg -eq "--upgrade") { $UpgradeMode = $true }
    if ($arg -eq "--force")   { $ForceMode   = $true }
}

function Info($msg)  { Write-Host "[INFO]  $msg" -ForegroundColor Green }
function Warn($msg)  { Write-Host "[WARN]  $msg" -ForegroundColor Yellow }
function Error($msg) { Write-Host "[ERROR] $msg" -ForegroundColor Red }

# ══════════════════════════════════════════════════════════════════════════════
# 0. 彻底清理所有旧版本 eddy（Python / pip），确保全新安装不冲突
# ══════════════════════════════════════════════════════════════════════════════
Info "清理旧 eddy 版本..."

# ── 删除所有已知位置的旧 eddy 命令 ──
$oldPaths = @(
    "$env:USERPROFILE\eddy-code\bin\eddy.cmd",
    "$env:USERPROFILE\eddy-code\bin\eddy.bat",
    "$env:USERPROFILE\eddy-code\bin\eddy"
)
foreach ($old in $oldPaths) {
    if (Test-Path $old) {
        Remove-Item -Force $old -ErrorAction SilentlyContinue
        Info "已删除旧命令: $old"
    }
}

# ── 卸载 pip / uv 安装的旧 eddy 包 ──
# ── 彻底删除旧安装目录 ──
if (Test-Path $InstallDir) {
    Info "删除旧安装目录: $InstallDir"
    Remove-Item -Recurse -Force $InstallDir -ErrorAction SilentlyContinue
}

# ── 清理 PowerShell Profile 中的旧 eddy-code PATH 引用 ──
if (Test-Path $PROFILE) {
    $content = Get-Content $PROFILE -Raw -ErrorAction SilentlyContinue
    if ($content -match 'eddy-code') {
        $cleaned = $content -replace '(?m)^.*eddy-code.*\r?\n?', ''
        Set-Content $PROFILE $cleaned.TrimEnd() -Encoding UTF8
        Info "已清理 PowerShell Profile 中的旧 eddy-code 引用"
    }
}
Info "Cleanup complete"

# ══════════════════════════════════════════════════════════════════════════════
# 1. 检测 Node.js >= 22.0.0
# ══════════════════════════════════════════════════════════════════════════════
function Find-Node {
    foreach ($cmd in @("node", "nodejs", "node22", "node24", "node25")) {
        $found = Get-Command $cmd -ErrorAction SilentlyContinue
        if (-not $found) { continue }
        $verOutput = & $found.Source --version 2>&1
        if ($verOutput -match "v?(\d+)\.(\d+)\.(\d+)") {
            $major = [int]$matches[1]
            $minor = [int]$matches[2]
            if ($major -gt 22) {
                return @{ Path = $found.Source; Version = "$major.$minor" }
            }
            if ($major -eq 22) {
                if ($minor -ge 0) {
                    return @{ Path = $found.Source; Version = "$major.$minor" }
                }
            }
        }
    }
    return $null
}

Info "检测 Node.js >= 22.0.0..."
$nodeInfo = Find-Node
if (-not $nodeInfo) {
    Error "Node.js 22.0.0 or newer was not found"
    Write-Host ""
    Write-Host "Install Node.js first:"
    Write-Host "  1. 访问 https://nodejs.org/"
    Write-Host "  2. 下载 Node.js LTS 版 (64-bit)"
    Write-Host "  3. 安装时勾选 'Add to PATH'"
    Write-Host ""
    exit 1
}
$node = $nodeInfo.Path
Info "Node.js: $( & $node --version )  (路径: $node)"

# ── 2. 检测 Git ────────────────────────────────────────────────────────────
Info "检测 Git..."
if (-not (Get-Command git -ErrorAction SilentlyContinue)) {
    Error "未找到 Git"
    Write-Host ""
    Write-Host "Install Git for Windows:"
    Write-Host "  https://git-scm.com/download/win"
    Write-Host ""
    exit 1
}
Info "Git: $(git --version)"

# ── 3. 检测 / 安装 pnpm ────────────────────────────────────────────────────
Info "检测 pnpm..."
$pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
if (-not $pnpm) {
    Info "pnpm 未安装，正在自动安装..."
    try {
        & $node -e "require('child_process').execSync('corepack enable', {stdio:'inherit'})" 2>$null
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
    } catch { }

    if (-not $pnpm) {
        try {
            $tmpPnpmInstall = "$env:TEMP\pnpm-install-$(Get-Random).ps1"
            irm https://get.pnpm.io/install.ps1 -OutFile $tmpPnpmInstall
            & $tmpPnpmInstall
            Remove-Item $tmpPnpmInstall -ErrorAction SilentlyContinue
        } catch {
            Error "pnpm 安装失败: $_"
            Write-Host "请手动安装: https://pnpm.io/installation"
            exit 1
        }
        $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
        if (-not $pnpm) {
            foreach ($p in @(
                "$env:LOCALAPPDATA\pnpm\pnpm.exe",
                "$env:USERPROFILE\.local\bin\pnpm.exe",
                "$env:USERPROFILE\.cargo\bin\pnpm.exe"
            )) {
                if (Test-Path $p) {
                    $env:PATH = "$(Split-Path $p);$env:PATH"
                    $pnpm = Get-Command pnpm -ErrorAction SilentlyContinue
                    if ($pnpm) { break }
                }
            }
        }
    }
    if (-not $pnpm) {
        Error "pnpm was installed but not found; reopen PowerShell and retry"
        exit 1
    }
}
Info "pnpm: $(pnpm --version)"

# ── 4. 下载项目 ─────────────────────────────────────────────────────────────
Info "安装路径: $InstallDir"
Info "下载源码仓库 crake7even/eddy-code（repo/source 标识）..."
git clone --depth 1 "https://github.com/$Repo.git" $InstallDir
if ($LASTEXITCODE -ne 0) {
    Error "git clone failed (exit code: $LASTEXITCODE)"
    Write-Host "Check your network connection and retry."
    exit 1
}
Set-Location $InstallDir

# ── 5. 安装依赖并构建 ──────────────────────────────────────────────────────
Info "安装依赖并构建..."
pnpm install
if ($LASTEXITCODE -ne 0) {
    Error "Dependency install failed (exit code: $LASTEXITCODE)"
    exit 1
}
pnpm -r build
if ($LASTEXITCODE -ne 0) {
    Error "Build failed (exit code: $LASTEXITCODE)"
    exit 1
}

# ── 6. 创建 eddy 主命令，并只保留 eddy 主入口 ───────────────────────────
Info "创建 eddy 命令..."
New-Item -ItemType Directory -Force -Path $BinDir | Out-Null

$NodeExe = if (Test-Path "$InstallDir\node.exe") { "$InstallDir\node.exe" } else { $node }
$EddyCmd = @"
@echo off
set "EDDY_HOME=$InstallDir"
cd /d "$InstallDir"
"$NodeExe" "$InstallDir\apps\eddy-code\dist\main.mjs" %*
"@
Set-Content -Path "$BinDir\eddy.cmd" -Value $EddyCmd -Encoding Default

# ── 7. 创建桌面快捷方式 ───────────────────────────────────────────────────
Info "创建桌面快捷方式..."
try {
    $DesktopPath = [Environment]::GetFolderPath("Desktop")
    $ShortcutPath = "$DesktopPath\Eddy Code.lnk"
    $WshShell = New-Object -ComObject WScript.Shell
    $Shortcut = $WshShell.CreateShortcut($ShortcutPath)

    # 按优先级选择终端：Windows Terminal > pwsh 7 > powershell 5
    $wt    = Get-Command wt.exe           -ErrorAction SilentlyContinue
    $pwsh7 = Get-Command pwsh.exe         -ErrorAction SilentlyContinue
    $ps5   = Get-Command powershell.exe   -ErrorAction SilentlyContinue

    if ($wt) {
        # Windows Terminal — 现代、美观
        $Shortcut.TargetPath = $wt.Source
        $Shortcut.Arguments  = "--title `"Eddy Code`" cmd /k `"chcp 65001 > nul && eddy`""
    }
    elseif ($pwsh7) {
        # PowerShell 7+
        $Shortcut.TargetPath = $pwsh7.Source
        $Shortcut.Arguments  = "-NoExit -Command `"chcp 65001 > `$null; `$Host.UI.RawUI.WindowTitle = 'Eddy Code'; eddy`""
    }
    elseif ($ps5) {
        # Windows PowerShell 5.x（旧版 conhost，加 UTF-8 补丁）
        $Shortcut.TargetPath = $ps5.Source
        $Shortcut.Arguments  = "-NoExit -Command `"chcp 65001 > `$null; [Console]::OutputEncoding = [Console]::InputEncoding = [Text.Encoding]::UTF8; `$Host.UI.RawUI.WindowTitle = 'Eddy Code'; eddy`""
    }
    else {
        $Shortcut.TargetPath = "powershell.exe"
        $Shortcut.Arguments  = "-NoExit -Command `"chcp 65001 > `$null; [Console]::OutputEncoding = [Console]::InputEncoding = [Text.Encoding]::UTF8; `$Host.UI.RawUI.WindowTitle = 'Eddy Code'; eddy`""
    }

    $Shortcut.WorkingDirectory = $env:USERPROFILE
    $Shortcut.Description      = "Eddy Code - AI command line assistant"
    $IconPath = "$InstallDir\icon.ico"
    if (Test-Path $IconPath) {
        $Shortcut.IconLocation = $IconPath
    }
    $Shortcut.Save()
    Info "桌面快捷方式已创建: $ShortcutPath"
} catch {
    Warn "快捷方式创建失败: $_"
}

# ── 8. 添加到用户 PATH ─────────────────────────────────────────────────────
$UserPath = [Environment]::GetEnvironmentVariable("PATH", "User")
if ($UserPath -notlike "*$BinDir*") {
    Info "添加 $BinDir 到用户 PATH..."
    [Environment]::SetEnvironmentVariable("PATH", "$UserPath;$BinDir", "User")
    $env:PATH = "$env:PATH;$BinDir"
}

# ── 完成 ───────────────────────────────────────────────────────────────────
Info "Install complete"
Write-Host ""
Write-Host "安装位置: $InstallDir"
Write-Host "运行:     eddy --version"
Write-Host ""
Write-Host "提示: 如果命令找不到，请重新打开 PowerShell 或 CMD"
