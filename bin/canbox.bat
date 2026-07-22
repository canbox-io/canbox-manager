@echo off
REM Canbox 启动器 (Windows)
REM 用法: canbox.bat manager | canbox.bat app <appId>

setlocal enabledelayedexpansion

set CANBOX_HOME=%~dp0..
set CORE=%CANBOX_HOME%\canbox-core\injection.js

if not exist "%CORE%" (
    echo [canbox] 错误: 找不到 canbox-core: %CORE% >&2
    exit /b 1
)

set CANBOX_ENV=production
set NODE_ENV=production

if defined CANBOX_USER_DATA (
    set USER_DATA=%CANBOX_USER_DATA%
) else if defined CANBOX_HOME_ENV (
    set USER_DATA=%CANBOX_HOME_ENV%
) else (
    set USER_DATA=%APPDATA%\canbox
)

set USERS_PATH=%USER_DATA%\Users
set PATHS_JSON=%USER_DATA%\paths.json
if exist "%PATHS_JSON%" (
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "(Get-Content -Raw '%PATHS_JSON%' | ConvertFrom-Json).usersPath" 2^>nul`) do (
        set USERS_PATH=%%i
    )
)

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

    REM 通过 PowerShell 实现的 selector 选择 electron 版本
    for /f "usebackq delims=" %%i in (`powershell -NoProfile -Command "
        $canboxHome = '%CANBOX_HOME%';
        $userData = '%USER_DATA%';
        $appDir = '!APP_DIR!';
        
        $ALLOWED_VERSIONS = @{'42.5.1' = $true};
        
        function ParseVersion($ver) {
            $parts = $ver -split '\.' | ForEach-Object { [int]$_ };
            return '{0:D3}.{1:D3}.{2:D3}' -f ($parts[0], $parts[1], $parts[2]);
        }
        
        function CompareVersions($a, $b) {
            $aNorm = ParseVersion $a;
            $bNorm = ParseVersion $b;
            if ($aNorm -gt $bNorm) { return 1 };
            if ($aNorm -lt $bNorm) { return -1 };
            return 0;
        }
        
        function Satisfies($version, $range) {
            $range = $range.Trim();
            if ($range -eq '' -or $range -eq '*') { return $true };
            
            if ($range.StartsWith('^')) {
                $target = $range.Substring(1);
                $tParts = $target -split '\.' | ForEach-Object { [int]$_ };
                $vParts = $version -split '\.' | ForEach-Object { [int]$_ };
                
                if ($vParts[0] -ne $tParts[0]) { return $false };
                return (CompareVersions $version $target) -ge 0;
            }
            
            return (CompareVersions $version $range) -eq 0;
        }
        
        function GetElectronRange($appDir) {
            $metaFile = Join-Path $appDir '.canbox-app';
            if (-not (Test-Path $metaFile)) { return '' };
            $content = Get-Content $metaFile -Raw;
            if ($content -match '\"range\"\s*:\s*\"([^\"]+)\"') { return $matches[1] };
            return '';
        }
        
        function ScanBuiltinVersions($canboxHome) {
            $result = @();
            Get-ChildItem -Path (Join-Path $canboxHome 'electron-*') -Directory | ForEach-Object {
                $electronExe = Join-Path $_.FullName 'electron.exe';
                if (Test-Path $electronExe) {
                    $ver = $_.Name -replace '^electron-', '';
                    $result += $ver;
                }
            }
            return $result;
        }
        
        function ReadDownloadedVersions($userData) {
            $registryPath = Join-Path $userData 'runtime\electron-registry.json';
            if (-not (Test-Path $registryPath)) { return @() };
            try {
                $content = Get-Content $registryPath -Raw;
                $json = $content | ConvertFrom-Json;
                return $json.installedVersions.PSObject.Properties.Value | Where-Object { $_.electron } | ForEach-Object { $_.electron };
            } catch {
                return @();
            }
        }
        
        function GetDownloadedVersionPath($userData, $ver) {
            $registryPath = Join-Path $userData 'runtime\electron-registry.json';
            if (-not (Test-Path $registryPath)) { return '' };
            try {
                $content = Get-Content $registryPath -Raw;
                $json = $content | ConvertFrom-Json;
                $entry = $json.installedVersions.PSObject.Properties.Value | Where-Object { $_.electron -eq $ver };
                if ($entry) {
                    $electronExe = Join-Path $userData ('runtime\{0}\electron.exe' -f $entry.path);
                    if (Test-Path $electronExe) { return $electronExe };
                }
            } catch {}
            return '';
        }
        
        $range = GetElectronRange $appDir;
        if (-not $range) {
            Write-Error 'APP 未声明 electron 版本';
            exit 1;
        }
        
        $allowedCandidates = $ALLOWED_VERSIONS.Keys | Where-Object { Satisfies $_ $range };
        if (-not $allowedCandidates) {
            Write-Error ('canbox 未纳入满足 {0} 的 electron 版本' -f $range);
            exit 1;
        }
        
        $builtinVersions = ScanBuiltinVersions $canboxHome;
        $downloadedVersions = ReadDownloadedVersions $userData;
        
        $allCandidates = $builtinVersions + $downloadedVersions;
        $validCandidates = $allCandidates | Where-Object { $allowedCandidates -contains $_ };
        
        if (-not $validCandidates) {
            $highestAllowed = $allowedCandidates | Sort-Object -Descending { CompareVersions $_ '' } | Select-Object -First 1;
            Write-Error ('需要下载 electron: {0}' -f $highestAllowed);
            exit 1;
        }
        
        $selectedVersion = $validCandidates | Sort-Object -Descending { CompareVersions $_ '' } | Select-Object -First 1;
        
        $electronPath = '';
        if ($builtinVersions -contains $selectedVersion) {
            $electronPath = Join-Path $canboxHome ('electron-{0}\electron.exe' -f $selectedVersion);
        } else {
            $electronPath = GetDownloadedVersionPath $userData $selectedVersion;
        }
        
        if (-not $electronPath -or -not (Test-Path $electronPath)) {
            Write-Error ('找不到 electron 二进制文件: {0}' -f $selectedVersion);
            exit 1;
        }
        
        Write-Output $electronPath;
    " 2^>^&1`) do (
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