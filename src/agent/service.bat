REM %~dp0 is the current script path (might be relative)
pushd %~dp0 

set COMMAND=%1
set SRV="Noobaa Local Service"
set INSTDIR="%CD%"
set PROGRAM="%INSTDIR%\node.exe"
set PROGRAM_ARGS="src\agent\agent_wrap.js"

if "%COMMAND%"=="install" (
    echo "Installing service ..."
    NooBaa_Agent_wd.exe install "%SRV%" "%PROGRAM%"
    NooBaa_Agent_wd.exe set "%SRV%" AppParameters "%PROGRAM_ARGS%"
    NooBaa_Agent_wd.exe set "%SRV%" AppDirectory "%INSTDIR%"
    NooBaa_Agent_wd.exe start "%SRV%"
    echo "Service installed."
) else if "%COMMAND%"=="uninstall" (
    echo "Uninstalling service ..."
    NooBaa_Agent_wd.exe stop "%SRV%"
    NooBaa_Agent_wd.exe remove "%SRV%" confirm
    echo "Service uninstalled."
) else if "%COMMAND%"=="start" (
    echo "Starting service ..."
    NooBaa_Agent_wd.exe start "%SRV%"
    echo "Service started."
) else if "%COMMAND%"=="stop" (
    echo "Stopping service ..."
    NooBaa_Agent_wd.exe stop "%SRV%"
    echo "Service stopped."
) else if "%COMMAND%"=="status" (
    NooBaa_Agent_wd.exe status "%SRV%"
) else (
    echo "Unsupported command: %COMMAND%"
    echo "Usage: %0 install|uninstall|start|stop|status"
)

popd
