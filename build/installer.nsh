; Inix NSIS — branding + minimal process close (v0.1.5 style).
; No custom uninstall hooks — electron-builder handles upgrades.

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

ShowUninstDetails show
!define MUI_UNINSTFILESPAGE_SHOWDETAILS
!define MUI_UNINSTFILESPAGE_SHOWDETAILSCONTROL

!ifndef BUILD_UNINSTALLER
  ShowInstDetails show
  !define MUI_INSTFILESPAGE_SHOWDETAILS
  !define MUI_INSTFILESPAGE_SHOWDETAILSCONTROL
!endif

!macro customCheckAppRunning
  !ifdef BUILD_UNINSTALLER
    !ifndef nsProcess::FindProcess
      !include "nsProcess.nsh"
    !endif
    DetailPrint "Closing ${PRODUCT_NAME}..."
    ${nsProcess::FindProcess} "${PRODUCT_FILENAME}.exe" $R0
    ${If} $R0 = 0
      nsExec::Exec `taskkill /f /im "${PRODUCT_FILENAME}.exe" /t`
      Sleep 1000
    ${EndIf}
  !else
    ${if} ${isUpdated}
      DetailPrint "Closing ${PRODUCT_NAME} before installing the update..."
      StrCpy $R9 0
      ${DoWhile} $R9 < 10
        nsExec::ExecToLog `taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T`
        Sleep 1000
        IntOp $R9 $R9 + 1
      ${Loop}
      Sleep 1500
    ${endif}
  !endif
!macroend

; When upgrading, the previous version's uninstaller may crash (broken NSIS from older builds).
; electron-builder would abort; we finish cleanup manually and continue the install.
!macro customUnInstallCheck
  ${if} $R0 == 0
    DetailPrint "Previous version uninstalled successfully."
  ${else}
    DetailPrint "Previous uninstaller failed (code $R0) — removing old files manually..."
    nsExec::ExecToLog `taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T`
    Sleep 2000
    ${if} $INSTDIR != ""
      RMDir /r "$INSTDIR"
      ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
        DetailPrint "Retrying removal of $INSTDIR..."
        Sleep 2000
        nsExec::ExecToLog `taskkill /F /IM "${PRODUCT_FILENAME}.exe" /T`
        RMDir /r "$INSTDIR"
      ${EndIf}
    ${endif}
    DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY}"
    DeleteRegKey SHELL_CONTEXT "${INSTALL_REGISTRY_KEY}"
    !ifdef UNINSTALL_REGISTRY_KEY_2
      DeleteRegKey SHELL_CONTEXT "${UNINSTALL_REGISTRY_KEY_2}"
    !endif
    ClearErrors
    DetailPrint "Manual cleanup finished; continuing install."
  ${endif}
!macroend

!macro customInstall
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  DetailPrint "${PRODUCT_NAME} ${VERSION} installed successfully."
!macroend

!macro customUnInstall
  ClearErrors
  RMDir /r "$PLUGINSDIR\old-install"
  DetailPrint "${PRODUCT_NAME} was removed from this computer."
!macroend
