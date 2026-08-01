; Inix NSIS customization — branding, update-safe shutdown, install activity log.

; _CHECK_APP_RUNNING (via customCheckAppRunning) needs GetProcessInfo; include it here
; because this file is parsed before allowOnlyOneInstallerInstance.nsh.
!include "getProcessInfo.nsh"
Var pid

!ifndef BUILD_UNINSTALLER
  ; #region agent log — install debug log ($TEMP\inix-debug-7afe24.log)
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

    ReadRegStr $R1 SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}" UninstallString
    ${If} $R1 == ""
      Push "H1:retry-skip no-uninstall-string"
      Call inixWriteDebugLog
      Goto inixRetryUninstallDone
    ${EndIf}

    Push $R1
    Call GetInQuotes
    Pop $R2

    ReadRegStr $R3 SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}" InstallLocation
    ${If} $R3 == ""
      Push $R2
      Call GetFileParent
      Pop $R3
    ${EndIf}

    StrCpy $R4 "/S /KEEP_APP_DATA --updated"
    ${if} $installMode == "CurrentUser"
      StrCpy $R4 "$R4 /currentuser"
    ${else}
      StrCpy $R4 "$R4 /allusers"
    ${endif}

    Push "H1:retry-inplace path=$R2 inst=$R3"
    Call inixWriteDebugLog
    DetailPrint "Retrying previous-version uninstall in place..."
    ExecWait '"$R2" $R4 _?=$R3' $R0
    Push "H1:retry-inplace-exit code=$R0"
    Call inixWriteDebugLog

    ${If} $R0 != 0
      DetailPrint "In-place uninstall failed ($R0). Closing ${PRODUCT_NAME} and clearing install folder..."
      !insertmacro _CHECK_APP_RUNNING
      SetOutPath $TEMP
      RMDir /r "$R3"
      Push "H3:fallback-rmdir inst=$R3 after=$R0"
      Call inixWriteDebugLog
      StrCpy $R0 0
    ${EndIf}

    inixRetryUninstallDone:
    Pop $R4
    Pop $R3
    Pop $R2
    Pop $R1
  FunctionEnd
  ; #endregion
!endif

; Show the details console on the Installing page (electron-builder hides it by default).
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

!macro customCheckAppRunning
  SetDetailsPrint both
  DetailPrint "Checking for running ${PRODUCT_NAME}..."
  !ifndef BUILD_UNINSTALLER
    Push "H2:check-app-running start"
    Call inixWriteDebugLog
  !endif
  ; Use electron-builder's default close/retry logic (PID-safe, per-user aware).
  !insertmacro _CHECK_APP_RUNNING
  !ifndef BUILD_UNINSTALLER
    Push "H2:check-app-running done"
    Call inixWriteDebugLog
  !endif
  DetailPrint "Ready to install ${PRODUCT_NAME} ${VERSION}."
!macroend

!ifndef BUILD_UNINSTALLER
  !macro preInit
    Push "H0:preInit version=${VERSION}"
    Call inixWriteDebugLog
  !macroend

  !macro customUnInstallCheck
    Push "H4:uninstall-old-version-exit code=$R0"
    Call inixWriteDebugLog
    ${If} $R0 == 0
      Goto inixUninstallCheckOk
    ${EndIf}
    Call inixRetryUninstallInPlace
    Push "H4:uninstall-after-retry code=$R0"
    Call inixWriteDebugLog
    inixUninstallCheckOk:
  !macroend

  !macro customUnInstallCheckCurrentUser
    !insertmacro customUnInstallCheck
  !macroend
!endif

!macro customFiles_x64
  DetailPrint "Extracting 64-bit application package..."
!macroend

!macro customFiles_ia32
  DetailPrint "Extracting 32-bit application package..."
!macroend

!macro customFiles_arm64
  DetailPrint "Extracting ARM64 application package..."
!macroend

!macro customInstall
  DetailPrint "Copying program files completed."
  DetailPrint "Writing registry entries..."
  DetailPrint "Creating Start Menu shortcut..."
  DetailPrint "Creating desktop shortcut (if enabled)..."
  DetailPrint "Registering uninstall information..."
  ; Update mode stages the previous version under $PLUGINSDIR\old-install — remove it.
  DetailPrint "Cleaning up files from the previous version..."
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  ; Older uninstallers may leave staging folders in other NSIS temp dirs after an update.
  nsExec::ExecToLog `$SYSDIR\cmd.exe /c for /d %G in ("%TEMP%\nsm*.tmp") do @if exist "%G\old-install" rd /s /q "%G\old-install"`
  DetailPrint "${PRODUCT_NAME} ${VERSION} installed successfully."
!macroend

!macro customUnInstall
  SetDetailsPrint both
  DetailPrint "Removing ${PRODUCT_NAME} shortcuts..."
  DetailPrint "Removing program files..."
  ; During in-place updates, files are moved here first — delete the staged copy.
  DetailPrint "Removing staged application files..."
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  DetailPrint "Cleaning up registry entries..."
  DetailPrint "${PRODUCT_NAME} was removed from this computer."
!macroend
