set BLD=%WORKSPACE%\build\agent_windows
set ART=%WORKSPACE%\artifacts

echo "=====> clean %BLD%"
rd /s/q %BLD%
mkdir %BLD%
mkdir %BLD%\src
mkdir %BLD%\32\build
mkdir %BLD%\64\build
mkdir %ART%

echo "=====> pushd %BLD%"
pushd %BLD%

echo "=====> nvm install %NODEJS_VERSION%"
set /p NODEJS_VERSION=<.\.nvmrc
nvm install "%NODEJS_VERSION%" || exit 1
for /f "usebackq tokens=*" %%x in ('where node.exe') do set NODE_EXE=%%x

echo "=====> copy package files to %BLD%"
copy "%NODE_EXE%" "%BLD%" || exit 1
copy "%WORKSPACE%\package.json" "%BLD%" || exit 1
copy "%WORKSPACE%\binding.gyp" "%BLD%" || exit 1
copy "%WORKSPACE%\config.js" "%BLD%" || exit 1
copy "%WORKSPACE%\src\deploy\windows\7za.exe" "%BLD%" || exit 1
copy "%WORKSPACE%\src\deploy\windows\wget.exe" "%BLD%" || exit 1
copy "%WORKSPACE%\src\deploy\windows\NooBaa_Agent_wd.exe" "%BLD%" || exit 1
copy "%WORKSPACE%\frontend\src\assets\noobaa_icon24.ico" "%BLD%" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\agent" "%BLD%\src\agent" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\api" "%BLD%\src\api" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\endpoint" "%BLD%\src\endpoint" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\native" "%BLD%\src\native" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\rpc" "%BLD%\src\rpc" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\s3" "%BLD%\src\s3" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\sdk" "%BLD%\src\sdk" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\tools" "%BLD%\src\tools" || exit 1
xcopy /Y/I/E "%WORKSPACE%\src\util" "%BLD%\src\util" || exit 1

echo "=====> update package.json for git commit %GIT_COMMIT%"
for /f "usebackq tokens=*" %%x in ('node %WORKSPACE%\src\deploy\common\update_package_json.js agent') do set NB_VERSION=%%x
echo "=====> version $NB_VERSION"

echo "=====> npm install --production"
cmd /c npm install --production || exit 1
if not exist ".\build\Release" exit 1

echo "=====> makensis"
set OUTFILE=%ART%\noobaa-setup-%NB_VERSION%.exe
makensis \
    /V4 \
    /NOCD \
    /HDRINFO \
    /DVERSION="%NB_VERSION%" \
    /DOUTFILE="%ART%\noobaa-setup-%NB_VERSION%.exe" \
    %WORKSPACE%\src\deploy\build_windows_agent.nsi || exit 1
echo "=====> installer: %OUTFILE%"

if exist "%SIGNTOOL_PATH%" (
    echo "=====> signing installer with %SIGNTOOL_PATH%"
    "%SIGNTOOL_PATH%" sign /v /sm /t http://timestamp.digicert.com /a %OUTFILE% || exit 1
)

echo "=====> done"
popd
exit 0
