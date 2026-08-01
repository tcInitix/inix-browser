; Inix NSIS customization — branding, update-safe shutdown, install activity log.

; _CHECK_APP_RUNNING (via customCheckAppRunning) needs GetProcessInfo; include it here
; because this file is parsed before allowOnlyOneInstallerInstance.nsh.
!include "getProcessInfo.nsh"
Var pid

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
  ; Use electron-builder's default close/retry logic (PID-safe, per-user aware).
  !insertmacro _CHECK_APP_RUNNING
  DetailPrint "Ready to install ${PRODUCT_NAME} ${VERSION}."
!macroend

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
