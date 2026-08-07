; Canbox Windows NSIS installer script
; Usage: makensis installer.nsi
;
; Output: Canbox-Setup-x86_64.exe
; Install to: $LOCALAPPDATA\Programs\Canbox (user-level, no admin required)

!include "MUI2.nsh"
!include "LogicLib.nsh"

; ====== Basic info ======
Name "Canbox"
OutFile "..\release\Canbox-Setup-x86_64.exe"
InstallDir "$LOCALAPPDATA\Programs\Canbox"
InstallDirRegKey HKCU "Software\Canbox" "InstallDir"
RequestExecutionLevel user
ShowInstDetails show
ShowUnInstDetails show
Unicode True

; Use zlib compression (fast, larger than LZMA but much quicker to build)
SetCompressor zlib

; ====== Version info ======
VIProductVersion "0.1.0.0"
VIAddVersionKey "ProductName" "Canbox"
VIAddVersionKey "CompanyName" "lizl6"
VIAddVersionKey "LegalCopyright" "Apache-2.0"
VIAddVersionKey "FileDescription" "Canbox application platform"
VIAddVersionKey "FileVersion" "0.1.0.0"

; ====== MUI UI config ======
!define MUI_ABORTWARNING
!define MUI_ICON "..\icons\icon.ico"
!define MUI_UNICON "..\icons\icon.ico"

; Finish page: option to launch Canbox after install
!define MUI_FINISHPAGE_RUN_TEXT "Launch Canbox now"
!define MUI_FINISHPAGE_RUN "$INSTDIR\bin\canbox.exe"
!define MUI_FINISHPAGE_RUN_PARAMETERS "manager"

; Install pages
!insertmacro MUI_PAGE_WELCOME
!insertmacro MUI_PAGE_DIRECTORY
!insertmacro MUI_PAGE_INSTFILES
!insertmacro MUI_PAGE_FINISH

; Uninstall pages
!insertmacro MUI_UNPAGE_WELCOME
!insertmacro MUI_UNPAGE_CONFIRM
!insertmacro MUI_UNPAGE_INSTFILES
!insertmacro MUI_UNPAGE_FINISH

; Languages
!insertmacro MUI_LANGUAGE "SimpChinese"
!insertmacro MUI_LANGUAGE "English"

; ====== Install logic ======
Section "Canbox" SecMain
    SectionIn RO
    SetOutPath "$INSTDIR"

    ; Kill running manager (avoid file lock)
    nsExec::ExecToLog 'taskkill /F /IM electron.exe /T'
    Sleep 500

    ; Write files (from stage dir)
    File /r "..\release\stage\canbox\*.*"

    ; Create uninstaller
    WriteUninstaller "$INSTDIR\Uninstall.exe"

    ; Registry info (user-level)
    WriteRegStr HKCU "Software\Canbox" "InstallDir" "$INSTDIR"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayName" "Canbox"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "UninstallString" "$\"$INSTDIR\Uninstall.exe$\""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayIcon" "$\"$INSTDIR\manager\icons\icon.ico$\""
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "DisplayVersion" "0.1.0"
    WriteRegStr HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox" "Publisher" "lizl6"

    ; Start menu shortcuts (manager) - use icon.ico
    CreateDirectory "$SMPROGRAMS\Canbox"
    CreateShortCut "$SMPROGRAMS\Canbox\Canbox.lnk" "$INSTDIR\bin\canbox.exe" "manager" "$INSTDIR\manager\icons\icon.ico" 0
    CreateShortCut "$SMPROGRAMS\Canbox\Uninstall Canbox.lnk" "$INSTDIR\Uninstall.exe" "" "$INSTDIR\manager\icons\icon.ico" 0

    ; Desktop shortcut - use icon.ico
    CreateShortCut "$DESKTOP\Canbox.lnk" "$INSTDIR\bin\canbox.exe" "manager" "$INSTDIR\manager\icons\icon.ico" 0
SectionEnd

; ====== Uninstall logic ======
Section "Uninstall"
    ; Kill running manager
    nsExec::ExecToLog 'taskkill /F /IM electron.exe /T'
    Sleep 500

    ; Remove install dir
    RMDir /r "$INSTDIR"

    ; Remove shortcuts
    RMDir /r "$SMPROGRAMS\Canbox"
    Delete "$DESKTOP\Canbox.lnk"

    ; Remove APP shortcuts
    Delete "$APPDATA\Microsoft\Windows\Start Menu\Programs\canbox-*.lnk"

    ; Clean registry (user-level)
    DeleteRegKey HKCU "Software\Microsoft\Windows\CurrentVersion\Uninstall\Canbox"
    DeleteRegKey HKCU "Software\Canbox"
SectionEnd
