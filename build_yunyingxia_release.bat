@echo off
setlocal EnableExtensions
title Yunyingxia Release Build

set "PROJECT_ROOT=%~dp0"
set "BUILD_SCRIPT=%PROJECT_ROOT%packaging\build\build_yunyingxia_release.ps1"
set "ACCOUNT_SERVER=https://anyq.site"
set "PRODUCT_CODE=operation_shrimp"
set "UPDATE_PUBLIC_KEY=lYg7Ws_9MxeQYmSVP6SNJ8ZgRh1isI8mv_SwIrP7eZ4"
set "INTEGRITY_KEY=%USERPROFILE%\.wanshan\wanshan-integrity-private.pem"

if not exist "%BUILD_SCRIPT%" (
  echo ERROR: Build script not found.
  echo %BUILD_SCRIPT%
  pause
  exit /b 1
)

if not exist "%INTEGRITY_KEY%" (
  echo ERROR: Integrity private key not found.
  echo %INTEGRITY_KEY%
  echo Create or restore the key before building a commercial package.
  pause
  exit /b 1
)

set "VERSION="
set /p "VERSION=Release version (example 0.1.14): "
if "%VERSION%"=="" (
  echo ERROR: Version is required.
  pause
  exit /b 1
)

echo.
echo Building Yunyingxia %VERSION%...
echo Product: %PRODUCT_CODE%
echo Account service: %ACCOUNT_SERVER%
echo.
echo NOTE: This build has integrity signing. Windows code signing is only applied
echo when the PowerShell build command is given real signing tool parameters.
echo.

pushd "%PROJECT_ROOT%"
pwsh -NoProfile -ExecutionPolicy Bypass -File "%BUILD_SCRIPT%" ^
  -Version "%VERSION%" ^
  -Commercial ^
  -AccountServerUrl "%ACCOUNT_SERVER%" ^
  -ProductCode "%PRODUCT_CODE%" ^
  -UpdatePublicKey "%UPDATE_PUBLIC_KEY%" ^
  -IntegrityPrivateKeyPath "%INTEGRITY_KEY%"
set "BUILD_EXIT=%ERRORLEVEL%"
popd

echo.
if not "%BUILD_EXIT%"=="0" (
  echo BUILD FAILED. Exit code: %BUILD_EXIT%
  pause
  exit /b %BUILD_EXIT%
)

echo BUILD COMPLETE.
echo Output: release\operation-shrimp\%VERSION%\
pause
exit /b 0
