; Inix NSIS customization — branding + update-safe app shutdown.

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
  !ifdef APP_EXECUTABLE_FILENAME
    ${if} ${isUpdated}
      DetailPrint "Closing ${PRODUCT_NAME} before installing the update..."
      StrCpy $R9 0
      ${DoWhile} $R9 < 6
        Sleep 1000
        nsExec::ExecToLog 'taskkill /F /IM "${APP_EXECUTABLE_FILENAME}" /T'
        Sleep 500
        IntOp $R9 $R9 + 1
      ${Loop}
    ${endif}
  !endif
!macroend
