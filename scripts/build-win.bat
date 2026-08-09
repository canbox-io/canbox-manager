@echo off
REM Canbox Windows build script
REM Output: Canbox-Setup-x86_64.exe (NSIS installer)
REM
REM Usage: npm run dist:win
REM Requires: NSIS (makensis), node_modules/electron, Node.js >= 24

setlocal enabledelayedexpansion
cd /d "%~dp0\.."

REM Add NSIS to PATH if not found (common install locations)
where makensis >nul 2>&1
if errorlevel 1 (
    if exist "%LOCALAPPDATA%\Programs\NSIS\makensis.exe" (
        set "PATH=%LOCALAPPDATA%\Programs\NSIS;%PATH%"
    ) else if exist "C:\Program Files\NSIS\makensis.exe" (
        set "PATH=C:\Program Files\NSIS;%PATH%"
    ) else if exist "C:\Program Files (x86)\NSIS\makensis.exe" (
        set "PATH=C:\Program Files (x86)\NSIS;%PATH%"
    )
)

set OUTPUT_DIR=release
set STAGE_DIR=%OUTPUT_DIR%\stage
set INSTALLER=%OUTPUT_DIR%\Canbox-Setup-x86_64.exe

echo ====== Canbox Windows Build ======

REM 1. Build manager frontend
echo [1/5] Build manager frontend (vite build)...
call npm run build
if errorlevel 1 (
    echo ERROR: vite build failed >&2
    exit /b 1
)

REM 2. Assemble directory structure
echo [2/5] Assemble directory structure...
if exist "%STAGE_DIR%" rmdir /s /q "%STAGE_DIR%"
mkdir "%STAGE_DIR%\canbox"

REM 2a. Copy electron runtime (versioned dir, e.g. electron-42.5.1\)
set ELECTRON_DIST=node_modules\electron\dist
if not exist "%ELECTRON_DIST%\electron.exe" (
    echo ERROR: electron runtime missing, run npm install first >&2
    exit /b 1
)
set ELECTRON_VERSION=
if exist "%ELECTRON_DIST%\version" (
    set /p ELECTRON_VERSION=<"%ELECTRON_DIST%\version"
)
if "!ELECTRON_VERSION!"=="" (
    echo ERROR: cannot read electron version from %ELECTRON_DIST%\version >&2
    exit /b 1
)
xcopy /e /i /q "%ELECTRON_DIST%" "%STAGE_DIR%\canbox\electron-!ELECTRON_VERSION!" >nul
echo   electron: !ELECTRON_VERSION! -^> electron-!ELECTRON_VERSION!\

REM 2b. Copy canbox-core
set CORE_SRC=..\canbox-core
if not exist "%CORE_SRC%\injection.js" (
    echo ERROR: canbox-core not found: %CORE_SRC% >&2
    exit /b 1
)
mkdir "%STAGE_DIR%\canbox\canbox-core"
xcopy /e /i /q "%CORE_SRC%\lib" "%STAGE_DIR%\canbox\canbox-core\lib" >nul
copy /y "%CORE_SRC%\injection.js" "%STAGE_DIR%\canbox\canbox-core\" >nul
copy /y "%CORE_SRC%\package.json" "%STAGE_DIR%\canbox\canbox-core\" >nul
if exist "%CORE_SRC%\node_modules" (
    xcopy /e /i /q "%CORE_SRC%\node_modules" "%STAGE_DIR%\canbox\canbox-core\node_modules" >nul
) else (
    echo WARNING: canbox-core\node_modules not found >&2
)
echo   canbox-core: copied

REM 2c. Copy manager files
set MANAGER_DIR=%STAGE_DIR%\canbox\manager
mkdir "%MANAGER_DIR%"
for %%f in (main.js preload.js repo-probe.js app-launcher.js updater.js catalog-manager.js package.json) do copy /y "%%f" "%MANAGER_DIR%\" >nul
xcopy /e /i /q build "%MANAGER_DIR%\build" >nul
xcopy /e /i /q icons "%MANAGER_DIR%\icons" >nul
if exist logo.png copy /y logo.png "%MANAGER_DIR%\" >nul
if exist logo.svg copy /y logo.svg "%MANAGER_DIR%\" >nul
REM Copy manager runtime deps (adm-zip, nanoid, axios and transitive deps)
node scripts\copy-runtime-deps.js node_modules "%MANAGER_DIR%\node_modules"
echo   manager: copied

REM 2d. Build canbox.exe (Node SEA launcher)
echo   Build canbox.exe (Node SEA)...
pushd bin\canbox-sea
call node build.js
if errorlevel 1 (
    echo ERROR: canbox.exe build failed >&2
    popd
    exit /b 1
)
popd
mkdir "%STAGE_DIR%\canbox\bin"
copy /y bin\canbox-sea\canbox.exe "%STAGE_DIR%\canbox\bin\" >nul
echo   bin/canbox.exe: copied

REM 3. Generate NSIS installer
echo [3/5] Generate NSIS installer...
where makensis >nul 2>&1
if errorlevel 1 (
    echo ERROR: makensis not found, install NSIS >&2
    echo Download: https://nsis.sourceforge.io/Download >&2
    echo Or add NSIS to PATH. Checked: PATH, %%LOCALAPPDATA%%\Programs\NSIS, C:\Program Files\NSIS >&2
    rmdir /s /q "%STAGE_DIR%"
    exit /b 1
)

makensis /V2 scripts\installer.nsi
if errorlevel 1 (
    echo ERROR: NSIS compile failed >&2
    rmdir /s /q "%STAGE_DIR%"
    exit /b 1
)

REM 4. Clean up temp files
echo [4/5] Clean up temp files...
rmdir /s /q "%STAGE_DIR%"

REM 5. Done
echo [5/5] Build complete
echo.
echo ====== Build Complete ======
echo Output: %INSTALLER%
for %%I in ("%INSTALLER%") do echo Size: %%~zI bytes
echo.
echo Install: run %INSTALLER%
endlocal
