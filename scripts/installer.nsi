; Canbox Windows NSIS 安装脚本
; 用法: makensis installer.nsi
;
; 产物: Canbox-Setup-x86_64.exe
; 安装到: $PROGRAMFILES\Canbox (或用户选择路径)

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ====== 基本信息 ======
Name "Canbox"
OutFile "..\release\Canbox-Setup-x86_64.exe"
InstallDir "$PROGRAMFILES64\Canbox"
InstallDirRegKey HKLM "Software\Canbox" "InstallDir"
RequestExecutionLevel admin
ShowInstDetails show
ShowUnInstDetails show
Unicode True

; ====== 版本信息 ======
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Canbox"
VIAddVersionKey "CompanyName" "lizl6"
VIAddVersionKey "LegalCopyright" "Apache-2.0"
VIAddVersionKey "FileDescription" "Canbox 应用集合平台"
VIAddVersionKey "FileVersion" "0.1.0.0"

; ====== MUI 界面配置 ======
!define MUI_ABORTWARNING
!define MUI_ICON "..\icons\icon.ico"
!define MUI_UNICON "..\icons\icon.ico"

; 安装页面
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; 卸载页面
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; 语言
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ====== 安装逻辑 ======
Section "Canbox" SecMain
    SectionIn RO
    SetOutPath "$INSTDIR"

    ; 关闭正在运行的 manager（避免文件占用）
    nsExec::ExecToLog 'taskkill /F /IM electron.exe /T'
    Sleep 1000

    ; 写入文件（从 stage 目录复制）
    File /r "..\release\stage\canbox\*.*"

    ; 创建卸载程序
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; 注册表信息
    WriteRegStr HKLM "Software\Canbox" "InstallDir" "$INSTDIR"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayName" "Canbox"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayIcon" "$\"$INSTDIR\electron\electron.exe$\""
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayVersion" "0.1.0"
    WriteRegStr HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "Publisher" "lizl6"

    ; 开始菜单快捷方式（manager）
    CreateDirectory "$SMPROGRAMS\Canbox"
    CreateShortCut "$SMPROGRAMS\Canbox\Canbox.lnk" "$INSTDIR\bin\canbox.bat" "manager" "$INSTDIR\manager\icons\256.png" 0
    CreateShortCut "$SMPROGRAMS\Canbox\卸载 Canbox.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\manager\icons\256.png" 0

    ; 桌面快捷方式
    CreateShortCut "$DESKTOP\Canbox.lnk" "$INSTDIR\bin\canbox.bat" "manager" "$INSTDIR\manager\icons\256.png" 0

    ; 安装完成后启动 manager
    Exec "$INSTDIR\bin\canbox.bat manager"
SectionEnd

; ====== 卸载逻辑 ======
Section "Uninstall"
    ; 删除安装目录
    RMDir /r "$INSTDIR"

    ; 删除快捷方式
    RMDir /r "$SMPROGRAMS\Canbox"
    Delete "$DESKTOP\Canbox.lnk"

    ; 删除 APP 快捷方式
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\canbox-*.lnk"

    ; 清理注册表
    DeleteRegKey HKLM "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox"
    DeleteRegKey HKLM "Software\Canbox"
SectionEnd
