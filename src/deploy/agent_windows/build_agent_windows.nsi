# Usage:
#
# noobaa-setup.exe /S /config <agent_conf.json with base 64 encoding>
#

!include "MUI2.nsh"
!include "FileFunc.nsh"
!include "StrFunc.nsh"
!include "CharToASCII.nsh"
!include "LogicLib.nsh"
!include "Base64.nsh"
!include x64.nsh

!define MAX_PATH 2600
!define NSIS_MAX_STRLEN=8192

# Command line defines - send with /DNAME=VALUE
# !define VERSION ...
# !define OUTFILE ...

!define NB "NooBaa"
!define ICON "noobaa_icon24.ico"
!define START_MENU_DIR "$SMPROGRAMS\${NB}"
!define UNINST "uninstall-noobaa.exe"
!define UNINST_LNK "Uninstall-${NB}.lnk"
!define NBREG "Software\Microsoft\Windows\CurrentVersion\Uninstall\NooBaa"

# !define MUI_COMPONENTSPAGE_SMALLDESC
# !insertmacro MUI_PAGE_COMPONENTS
# !insertmacro MUI_PAGE_DIRECTORY
# !insertmacro MUI_PAGE_INSTFILES
# !insertmacro MUI_PAGE_FINISH
# !insertmacro MUI_LANGUAGE English

# Installer Attributes (http://nsis.sourceforge.net/Docs/Chapter4.html#instattribs)
Name "${NB}"
Icon "${ICON}"
UninstallIcon "${ICON}"
Unicode true
BrandingText "${NB}"
OutFile "${OUTFILE}"
InstallDir "$PROGRAMFILES\${NB}"
RequestExecutionLevel admin
SilentInstall silent
SilentUnInstall silent
Page instfiles
UninstPage uninstConfirm
UninstPage instfiles

# Installer Version Information (http://nsis.sourceforge.net/Docs/Chapter4.html#versioninfo)
VIProductVersion ${VERSION}
VIAddVersionKey ProductName "${NB} Local Service"
VIAddVersionKey Comments ""
VIAddVersionKey CompanyName "${NB}"
VIAddVersionKey LegalCopyright "Y.G ${NB} Ltd."
VIAddVersionKey FileDescription "${NB} Local Service for Storage"
VIAddVersionKey FileVersion ${VERSION}
VIAddVersionKey ProductVersion ${VERSION}
VIAddVersionKey InternalName "${NB} Local Service"
VIAddVersionKey LegalTrademarks "${NB} is a Trademark of Y.G ${NB} Ltd."

Var AGENT_CONF
Var EXISTING_INSTALL


#############
# writeFile #
#############

!define writeFile "!insertmacro writeFile"

!macro writeFile File String
	Push "${String}"
	Push "${File}"
	Call writeFile
!macroend

Function writeFile
	; Stack: <file> <string>
	ClearErrors
	; Notice we are preserving registers $0, $1 and $2
	Exch $0                     ; Stack: $0 <string>
	Exch                        ; Stack: <string> $0
	Exch $1                     ; Stack: $1 $0
	Push $2                     ; Stack: $2 $1 $0
	; $0 = file
	; $1 = string
	FileOpen $2 "$0" "a"
	FileSeek $2 0 END
	FileWrite $2 "$1$\r$\n"
	FileClose $2
	Pop $2                      ; Stack: $1 $0
	Pop $1                      ; Stack: $0
	Pop $0                      ; Stack: -empty-
FunctionEnd


###########
# .onInit #
###########

Function .onInit

	${If} ${RunningX64}
		StrCpy $INSTDIR "$PROGRAMFILES64\${NB}"
	${Else}
		StrCpy $INSTDIR "$PROGRAMFILES\${NB}"
	${EndIf}

	IfFileExists "$INSTDIR\agent_conf.json" OnFileExistsAgentConf OnFileMissingAgentConf
		OnFileExistsAgentConf:
			StrCpy $EXISTING_INSTALL "true"
		OnFileMissingAgentConf:
			StrCpy $EXISTING_INSTALL "false"

	ClearErrors
	${GetOptions} "$CMDLINE" "/config" $AGENT_CONF
	${If} $AGENT_CONF == ""
	IfErrors OnErrorOptionConfig OnGoodOptionConfig
		OnErrorOptionConfig:
			IfFileExists "$INSTDIR\agent_conf.json" OnExistsAgentConf OnMissingAgentConf
				OnExistsAgentConf:
					StrCpy $UPGRADE "true"
				OnMissingAgentConf:
					MessageBox MB_OK "Missing /config parameter. Please copy the setup parameters from the 'Add Node' wizard"
					Abort
		OnGoodOptionConfig:
			# all good
	${EndIf}

FunctionEnd


###########
# Install #
###########

Section "Noobaa Local Service"
	SetOutPath $INSTDIR

	${If} $UPGRADE == "false"

		; do not let to install on existing deployment
		IfFileExists $INSTDIR\agent_conf.json AbortInstall SkipDelete
			AbortInstall:
				MessageBox MB_OK "Agent already installed"
				Abort 
			SkipDelete:

		${Base64_Decode} $AGENT_CONF
		Pop $0
		${WriteFile} "$INSTDIR\agent_conf.json" $0
		;MessageBox MB_OK "config: $AGENT_CONF $0 $INSTDIR	"
		nsJSON::Set /file $INSTDIR\agent_conf.json
		; Read address from agent_conf.json
		ClearErrors
		nsJSON::Get `address` /end
		${IfNot} ${Errors}
			Pop $R0
			StrCpy $address $R0
			${StrRep} $address $address "wss://" "https://"
			${StrRep} $address $address "ws://" "http://"
		${EndIf}
	${EndIf}

	IfFileExists $INSTDIR\*.* Upgrades Standard
		Upgrades:
			StrCpy $UPGRADE "true"
		Standard:
			StrCpy $AUTO_UPGRADE "false"

	IfFileExists $INSTDIR\noobaa-setup.exe Auto_Upgrades Auto_Standard
		Auto_Upgrades:
			StrCpy $AUTO_UPGRADE "true"
		Auto_Standard:

	${If} $UPGRADE == "true" ;delete all files that we want to update

		${If} $AUTO_UPGRADE == "false" ;delete all files that we want to update
			nsExec::ExecToStack '$\"$INSTDIR\service_uninstaller.bat$\""'
		${EndIf}
		Delete "$INSTDIR\config.js"
		Delete "$INSTDIR\package.json"
		Delete "$INSTDIR\${ICON}"
		Delete "$INSTDIR\${UNINST}"
		#No need for atom any more. Keep for future use?!
		#RMDir "$INSTDIR\atom-shell"
		RMDir /r "$INSTDIR\node_modules"
		RMDir /r "$INSTDIR\src"
		RMDir /r "$INSTDIR\ssl"
		${If} $AUTO_UPGRADE == "false" ;delete all files that we want to update
			Delete "$INSTDIR\service_uninstaller.bat"
			Delete "$INSTDIR\service_installer.bat"
			Delete "$INSTDIR\node.exe"
			Delete "$INSTDIR\service.bat"
			RMDir /r "$INSTDIR\build"
		${EndIf}
	${Else}
		File "7za.exe"
		File "NooBaa_Agent_wd.exe"
		File "wget.exe"
	${EndIf}

	WriteUninstaller "$INSTDIR\${UNINST}"
	File "7za.exe"
	File "wget.exe"
	File "NooBaa_Agent_wd.exe"
	File "service_installer.bat"
	File "service_uninstaller.bat"
	File "${ICON}"
	File "package.json"
	File "config.js"
	File "src"
	File "node_modules"
	${If} ${RunningX64}
		File ".\64\node.exe"
		File ".\64\build"
	${Else}
		File ".\32\node.exe"
		File ".\32\build"
	${EndIf}

	WriteRegStr HKLM "${NBREG}" "DisplayName" "NooBaa Local Service"
	WriteRegStr HKLM "${NBREG}" "UninstallString" "$\"$INSTDIR\${UNINST}$\""
	WriteRegStr HKLM "${NBREG}" "QuietUninstallString" "$\"$INSTDIR\${UNINST}$\" /S"

	${If} $AUTO_UPGRADE == "false" ;delete all files that we want to update
		CreateDirectory "${START_MENU_DIR}"
		CreateShortCut "${START_MENU_DIR}\${UNINST_LNK}" "$INSTDIR\${UNINST}"
		nsExec::ExecToStack '$\"$INSTDIR\service_installer.bat$\""'
	${EndIf}

SectionEnd


#############
# Uninstall #
#############

Section "uninstall"

	# Calling node agent_uninstall --remove_noobaa_storage which will detect all drives
	# and delete noobaa_storage if exists.
	# Using the $0 register to pass params to cmd because we have too many levels of quotes...
	StrCpy $0 '/c ""$INSTDIR\node.exe" "$INSTDIR\src\agent\agent_uninstall.js" --remove_noobaa_storage"'
	ExecWait 'cmd.exe $0'

	# Remove the service an
	nsExec::ExecToStack '$\"$INSTDIR\service_uninstaller.bat$\""'

	DeleteRegKey HKLM "${NBREG}"

	RMDir /r "${START_MENU_DIR}"
	RMDir /r "$INSTDIR"

SectionEnd
