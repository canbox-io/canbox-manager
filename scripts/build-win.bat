@echo off
REM Canbox Windows 打包脚本
REM 产物: Canbox-Setup-x86_64.exe (NSIS 安装包)
REM
REM 用法: npm run dist:win
REM 依赖: NSIS (makensis), node_modules/electron

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

set OUTPUT_DIR=release
set STAGE_DIR=%OUTPUT_DIR%\stage
set INSTALLER=%OUTPUT_DIR%\Canbox-Setup-x86_64.exe

echo ====== Canbox Windows 打包 ======

REM 1. 构建 manager 前端
echo [1/5] 构建 manager 前端 (vite build)...
call npm run build
if errorlevel 1 (
    echo 错误: vite build 失败 >&2
    exit /b 1
)

REM 2. 准备目录结构
echo [2/5] 组装目录结构...
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%\canbox"

REM 2a. 复制 electron 运行时
set ELECTRON_DIST=node_modules\electron\dist
if not exist "%ELECTRON_DIST%\electron.exe" (
    echo 错误: electron 运行时不存在，请先 npm install >&2
    exit /b 1
)
xcopy /e /i /q "%ELECTRON_DIST%" "%STAGE_DIR%\canbox\electron" >nul
echo   electron: 已复制

REM 2b. 复制 canbox-core
set CORE_SRC=..\canbox-core
if not exist "%CORE_SRC%\injection.js" (
    echo 错误: canbox-core 不存在: %CORE_SRC% >&2
    exit /b 1
)
mkdir "%STAGE_DIR%\canbox\canbox-core"
xcopy /e /i /q "%CORE_SRC%\lib" "%STAGE_DIR%\canbox\canbox-core\lib" >nul
copy /y "%CORE_SRC%\injection.js" "%STAGE_DIR%\canbox\canbox-core\" >nul
copy /y "%CORE_SRC%\package.json" "%STAGE_DIR%\canbox\canbox-core\" >nul
REM 复制 canbox-core 的 node_modules
if exist "%CORE_SRC%\node_modules" (
    xcopy /e /i /q "%CORE_SRC%\node_modules" "%STAGE_DIR%\canbox\canbox-core\node_modules" >nul
) else (
    echo 警告: canbox-core\node_modules 不存在 >&2
)
echo   canbox-core: 已复制

REM 2c. 复制 manager 文件
set MANAGER_DIR=%STAGE_DIR%\canbox\manager
mkdir "%MANAGER_DIR%"
copy /y main.js preload.js repo-probe.js app-launcher.js package.json "%MANAGER_DIR%\" >nul
xcopy /e /i /q build "%MANAGER_DIR%\build" >nul
xcopy /e /i /q icons "%MANAGER_DIR%\icons" >nul
if exist logo.png copy /y logo.png "%MANAGER_DIR%\" >nul
if exist logo.svg copy /y logo.svg "%MANAGER_DIR%\" >nul
REM 复制 manager 主进程运行时依赖（adm-zip, nanoid, axios 及传递依赖）
node scripts\copy-runtime-deps.js node_modules "%MANAGER_DIR%\node_modules"
echo   manager: 已复制

REM 2d. 复制 bin 启动器
mkdir "%STAGE_DIR%\canbox\bin"
copy /y bin\canbox.bat "%STAGE_DIR%\canbox\bin\" >nul
echo   bin/canbox.bat: 已复制

REM 3. 生成 NSIS 安装包
echo [3/5] 生成 NSIS 安装包...
where makensis >nul 2>&1
if errorlevel 1 (
    echo 错误: 找不到 makensis，请安装 NSIS >&2
    echo 下载: https://nsis.sourceforge.io/Download >&2
    rmdir /s /q "%STAGE_DIR%"
    exit /b 1
)

makensis /V2 scripts\installer.nsi
if errorlevel 1 (
    echo 错误: NSIS 编译失败 >&2
    rmdir /s /q "%STAGE_DIR%"
    exit /b 1
)

REM 4. 清理临时文件
echo [4/5] 清理临时文件...
rmdir /s /q "%STAGE_DIR%"

REM 5. 完成
echo [5/5] 打包完成
echo.
echo ====== 打包完成 ======
echo 产物: %INSTALLER%
for %%I in ("%INSTALLER%") do echo 大小: %%~zI bytes
echo.
echo 安装: 运行 %INSTALLER%
endlocal
