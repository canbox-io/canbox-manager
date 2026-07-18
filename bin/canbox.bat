@echo off
REM Canbox 启动器 (Windows)
REM 用法: canbox.bat manager | canbox.bat app <appId>

setlocal enabledelayedexpansion

REM 推导 CANBOX_HOME（脚本所在目录的上级目录）
set CANBOX_HOME=%~dp0..
set CORE=%CANBOX_HOME%\canbox-core\injection.js
set SELECTOR=%CANBOX_HOME%\canbox-core\lib\electron-selector.js

REM 检查 injection.js
if not exist "%CORE%" (
    echo [canbox] 错误: 找不到 canbox-core: %CORE% >&2
    exit /b 1
)

set CANBOX_ENV=production
set NODE_ENV=production

REM 解析用户数据目录（与 canbox-core/lib/env.js 一致）
if defined CANBOX_USER_DATA (
    set USER_DATA=%CANBOX_USER_DATA%
) else if defined CANBOX_HOME_ENV (
    set USER_DATA=%CANBOX_HOME_ENV%
) else (
    set USER_DATA=%APPDATA%\canbox
)

REM 从 paths.json 读取 usersPath（用 PowerShell 解析 JSON）
set USERS_PATH=%USER_DATA%\Users
set PATHS_JSON=%USER_DATA%\paths.json
if exist "%PATHS_JSON%" (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content -Raw '%PATHS_JSON%' | ConvertFrom-Json).usersPath" 2^>nul`) do (
        set USERS_PATH=%%i
    )
)

REM 扫描程序目录中的 builtin electron（electron-{ver}/electron.exe）
set BUILTIN_ELECTRON=
for /d %%d in ("%CANBOX_HOME%\electron-*") do (
    if exist "%%d\electron.exe" (
        set BUILTIN_ELECTRON=%%d\electron.exe
    )
)

if "%1"=="manager" (
    if "!BUILTIN_ELECTRON!"=="" (
        echo [canbox] 错误: 找不到 builtin electron（%CANBOX_HOME%\electron-*\electron.exe） >&2
        exit /b 1
    )
    "!BUILTIN_ELECTRON!" -r "%CORE%" "%CANBOX_HOME%\manager\" --app-id=canbox-manager --no-sandbox
    goto :eof
)

if "%1"=="app" (
    if "%2"=="" (
        echo 用法: canbox.bat app ^<appId^> >&2
        exit /b 1
    )
    set APP_ID=%2
    set APP_DIR=%USERS_PATH%\apps\!APP_ID!
    set APP_TARGET=!APP_DIR!\app.asar
    if not exist "!APP_TARGET!" (
        if exist "!APP_DIR!\" (
            set APP_TARGET=!APP_DIR!\
        ) else (
            echo [canbox] 错误: APP 不存在: !APP_ID! >&2
            exit /b 1
        )
    )

    REM 通过 selector 选择 electron 版本
    for /f "usebackq delims=" %%i in (`node "%SELECTOR%" --app-dir "!APP_DIR!" --canbox-home "%CANBOX_HOME%" --user-data "%USER_DATA%" 2^>^&1`) do (
        set SELECTOR_OUTPUT=%%i
    )
    if errorlevel 2 (
        echo [canbox] 需要下载 electron: !SELECTOR_OUTPUT! >&2
        exit /b 1
    )
    if errorlevel 1 (
        echo [canbox] 错误: !SELECTOR_OUTPUT! >&2
        exit /b 1
    )
    set ELECTRON=!SELECTOR_OUTPUT!

    REM 从 .canbox-app 判断是否为网页应用（type === 'web'）
    set IS_WEB_APP=0
    set CANBOX_APP_FILE=!APP_DIR!\.canbox-app
    if exist "!CANBOX_APP_FILE!" (
        findstr /C:"\"type\"" "!CANBOX_APP_FILE!" | findstr /C:"\"web\"" >nul 2>&1
        if !errorlevel! equ 0 set IS_WEB_APP=1
    )

    if "!IS_WEB_APP!"=="1" (
        "!ELECTRON!" "!APP_TARGET!" --no-sandbox
    ) else (
        "!ELECTRON!" -r "%CORE%" "!APP_TARGET!" "--app-id=!APP_ID!" --no-sandbox
    )
    goto :eof
)

echo Canbox 启动器 >&2
echo 用法: canbox.bat manager ^| canbox.bat app ^<appId^> >&2
exit /b 1
