@echo off
setlocal
set "LOTUS_ELECTRON=%LOTUS_ELECTRON_EXE%"
if not defined LOTUS_ELECTRON for /f "delims=" %%E in ('where electron.exe 2^>nul') do if not defined LOTUS_ELECTRON set "LOTUS_ELECTRON=%%E"
if not exist "%LOTUS_ELECTRON%" (
  echo Set LOTUS_ELECTRON_EXE to an installed Electron executable. See REQUIREMENTS.md.
  pause
  exit /b 1
)
set "ELECTRON_RUN_AS_NODE="
"%LOTUS_ELECTRON%" "%~dp0app" %*
exit /b %ERRORLEVEL%
