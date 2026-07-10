@echo off
REM Canbox 启动器 (Windows)
REM 用法: canbox.bat manager | canbox.bat app <appId>

setlocal

REM 推导 CANBOX_HOME（脚本所在目录的上级目录）
set CANBOX_HOME=%~dp0..
set ELECTRON=%CANBOX_HOME%\electron\electron.exe
set CORE=%CANBOX_HOME%\canbox-core\injection.js

REM 检查 electron 二进制
if not exist "%ELECTRON%" (
    echo [canbox] 错误: 找不到 electron: %ELECTRON% >&2
    exit /b 1
)

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

if "%1"=="manager" (
    "%ELECTRON%" -r "%CORE%" "%CANBOX_HOME%\manager\" --app-id=canbox-manager --no-sandbox
    goto :eof
)

if "%1"=="app" (
    if "%2"=="" (
        echo 用法: canbox.bat app ^<appId^> >&2
        exit /b 1
    )
    set APP_ID=%2
    set APP_DIR=%USERS_PATH%\apps\%APP_ID%
    set APP_TARGET=%APP_DIR%\app.asar
    if not exist "%APP_TARGET%" (
        if exist "%APP_DIR%\" (
            set APP_TARGET=%APP_DIR%\
        ) else (
            echo [canbox] 错误: APP 不存在: %APP_ID% >&2
            exit /b 1
        )
    )
    "%ELECTRON%" -r "%CORE%" "%APP_TARGET%" --app-id=%APP_ID% --no-sandbox
    goto :eof
)

echo Canbox 启动器 >&2
echo 用法: canbox.bat manager ^| canbox.bat app ^<appId^> >&2
exit /b 1
