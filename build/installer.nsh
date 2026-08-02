; Inix NSIS customization — branding + uninstall process-tree kill.
; Install/update process close uses electron-builder's default _CHECK_APP_RUNNING.

!include "getProcessInfo.nsh"
Var pid

; Kill the full Inix process tree (main + GPU/utility/renderer children).
!macro inixForceCloseAppImpl
  ${GetProcessInfo} 0 $pid $1 $2 $3 $4
  DetailPrint "Closing all ${PRODUCT_NAME} processes..."
  !ifdef INSTALL_MODE_PER_ALL_USERS
    nsExec::Exec `taskkill /im "${PRODUCT_FILENAME}.exe" /fi "PID ne $pid" /t`
  !else
    nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /im "${PRODUCT_FILENAME}.exe" /fi "PID ne $pid" /fi "USERNAME eq %USERNAME%" /t`
  !endif
  Sleep 500
  StrCpy $R1 0
  inixForceCloseLoop:
    IntOp $R1 $R1 + 1
    !ifdef INSTALL_MODE_PER_ALL_USERS
      ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
    !else
      nsExec::Exec `"$SYSDIR\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "$SYSDIR\find.exe" "${PRODUCT_FILENAME}.exe"`
      Pop $R0
    !endif
    IntCmp $R0 0 0 inixForceCloseDone
      Sleep 800
      !ifdef INSTALL_MODE_PER_ALL_USERS
        nsExec::Exec `taskkill /f /im "${PRODUCT_FILENAME}.exe" /fi "PID ne $pid" /t`
      !else
        nsExec::Exec `"$SYSDIR\cmd.exe" /c taskkill /f /im "${PRODUCT_FILENAME}.exe" /fi "PID ne $pid" /fi "USERNAME eq %USERNAME%" /t`
      !endif
      !ifdef INSTALL_MODE_PER_ALL_USERS
        ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
      !else
        nsExec::Exec `"$SYSDIR\cmd.exe" /c tasklist /FI "USERNAME eq %USERNAME%" /FI "IMAGENAME eq ${PRODUCT_FILENAME}.exe" /FO csv | "$SYSDIR\find.exe" "${PRODUCT_FILENAME}.exe"`
        Pop $R0
      !endif
      IntCmp $R0 0 0 inixForceCloseDone
        DetailPrint "Waiting for ${PRODUCT_NAME} to close."
        Sleep 1500
        Goto inixForceCloseLoop
    IntCmp $R1 8 inixForceCloseDone inixForceCloseLoop inixForceCloseDone
  inixForceCloseDone:
!macroend

!ifndef BUILD_UNINSTALLER
  Function inixForceCloseApp
    !insertmacro inixForceCloseAppImpl
  FunctionEnd
!else
  Function un.inixForceCloseApp
    !insertmacro inixForceCloseAppImpl
  FunctionEnd
!endif

!macro inixForceCloseAppCall
  !ifndef BUILD_UNINSTALLER
    Call inixForceCloseApp
  !else
    Call un.inixForceCloseApp
  !endif
!macroend

!ifndef BUILD_UNINSTALLER
  Function inixWriteDebugLog
    Exch $0
    Push $1
    ClearErrors
    FileOpen $1 "$TEMP\inix-debug-7afe24.log" a
    IfErrors inixWriteDebugLogSkip
    FileSeek $1 0 END
    FileWrite $1 "$0$\r$\n"
    FileClose $1
    inixWriteDebugLogSkip:
    DetailPrint "$0"
    Pop $1
    Pop $0
  FunctionEnd

  Function inixRetryUninstallInPlace
    Push $R1
    Push $R2
    Push $R3
    Push $R4

    ReadRegStr $R1 SHELL_CONTEXT "Software\Microsoft\Windows\CurrentVersion\Uninstall\${UNINSTALL_APP_KEY}" UninstallString
    StrCmp $R1 "" 0 inixRetryHaveUninstall
      Push "H1:retry-skip no-uninstall-string"
      Call inixWriteDebugLog
      Goto inixRetryUninstallDone
    inixRetryHaveUninstall:

    Push $R1
    Call GetInQuotes
    Pop $R2

    ReadRegStr $R3 SHELL_CONTEXT "Software\${APP_GUID}" InstallLocation
    StrCmp $R3 "" 0 inixRetryHaveInst
      Push $R2
      Call GetFileParent
      Pop $R3
    inixRetryHaveInst:

    StrCpy $R4 "/S /KEEP_APP_DATA --updated"
    !ifdef INSTALL_MODE_PER_ALL_USERS
      StrCpy $R4 "$R4 /allusers"
    !else
      StrCpy $R4 "$R4 /currentuser"
    !endif

    Push "H1:retry-inplace path=$R2 inst=$R3"
    Call inixWriteDebugLog
    DetailPrint "Retrying previous-version uninstall in place..."
    ExecWait '"$R2" $R4 _?=$R3' $R0
    Push "H1:retry-inplace-exit code=$R0"
    Call inixWriteDebugLog

    IntCmp $R0 0 inixRetryUninstallDone 0 0
      DetailPrint "In-place uninstall failed ($R0). Closing ${PRODUCT_NAME} and clearing install folder..."
      !insertmacro inixForceCloseAppCall
      SetOutPath $TEMP
      RMDir /r "$R3"
      Push "H3:fallback-rmdir inst=$R3 after=$R0"
      Call inixWriteDebugLog
      StrCpy $R0 0

    inixRetryUninstallDone:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
  FunctionEnd

  Function inixCustomUnInstallCheck
    !insertmacro inixForceCloseAppCall
    Push "H4:uninstall-old-version-exit code=$R0"
    Call inixWriteDebugLog
    IntCmp $R0 0 inixCustomUnInstallCheckDone
    Call inixRetryUninstallInPlace
    Push "H4:uninstall-after-retry code=$R0"
    Call inixWriteDebugLog
    inixCustomUnInstallCheckDone:
  FunctionEnd
!endif

ShowUninstDetails show
!define MUI_UNINSTFILESPAGE_SHOWDETAILS
!define MUI_UNINSTFILESPAGE_SHOWDETAILSCONTROL

!ifndef BUILD_UNINSTALLER
  ShowInstDetails show
  !define MUI_INSTFILESPAGE_SHOWDETAILS
  !define MUI_INSTFILESPAGE_SHOWDETAILSCONTROL
  !define MUI_PAGE_CUSTOMFUNCTION_SHOW inixInstFilesShow

  Function inixInstFilesShow
    SetDetailsPrint both
    DetailPrint "Starting ${PRODUCT_NAME} ${VERSION} installation..."
  FunctionEnd
!endif

!macro customHeader
  !define MUI_FINISHPAGE_NOAUTOCLOSE
  !define MUI_FINISHPAGE_TITLE "Inix is ready"
  !define MUI_FINISHPAGE_TEXT "Setup finished. You can launch Inix now or open it later from the Start menu."
  !define MUI_FINISHPAGE_RUN_TEXT "Launch Inix"
  !define MUI_FINISHPAGE_SHOWREADME ""
  !define MUI_UNFINISHPAGE_NOAUTOCLOSE
  !define MUI_UNFINISHPAGE_TITLE "Inix removed"
  !define MUI_UNFINISHPAGE_TEXT "Inix has been removed from your computer."
!macroend

!macro customWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Welcome to Inix"
  !define MUI_WELCOMEPAGE_TEXT "This will install Inix on your computer.$\r$\n$\r$\nIt is recommended that you close all other applications before continuing.$\r$\n$\r$\nClick Next to continue."
  !insertMacro MUI_PAGE_WELCOME
!macroend

!macro customUnWelcomePage
  !define MUI_WELCOMEPAGE_TITLE "Remove Inix"
  !define MUI_WELCOMEPAGE_TEXT "This will remove Inix from your computer.$\r$\n$\r$\nClick Next to continue."
  !insertmacro MUI_UNPAGE_WELCOME
!macroend

; Thin wrapper so our getProcessInfo / $pid includes stay valid.
; Install: electron-builder default only. Uninstall: force-kill process tree first.
!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    !insertmacro inixForceCloseAppCall
  !endif
  !insertmacro _CHECK_APP_RUNNING
!macroend

!ifndef BUILD_UNINSTALLER
  !macro customUnInstallCheck
    Call inixCustomUnInstallCheck
  !macroend

  !macro customUnInstallCheckCurrentUser
    Call inixCustomUnInstallCheck
  !macroend
!endif

!macro customInstall
  DetailPrint "Cleaning up files from the previous version..."
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  nsExec::ExecToLog `$SYSDIR\cmd.exe /c for /d %G in ("%TEMP%\nsm*.tmp") do @if exist "%G\old-install" rd /s /q "%G\old-install"`
  DetailPrint "${PRODUCT_NAME} ${VERSION} installed successfully."
!macroend

!macro customUnInit
  SetDetailsPrint both
  DetailPrint "Preparing to remove ${PRODUCT_NAME}..."
  !insertmacro inixForceCloseAppCall
!macroend

!macro customUnInstall
  SetDetailsPrint both
  !insertmacro inixForceCloseAppCall
  DetailPrint "Removing staged application files..."
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  DetailPrint "${PRODUCT_NAME} was removed from this computer."
!macroend
