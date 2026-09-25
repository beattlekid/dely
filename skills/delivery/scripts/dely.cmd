@echo off
setlocal
set "SCRIPT=%~dp0dely.js"

if defined DELY_NODE (
  "%DELY_NODE%" "%SCRIPT%" %*
  exit /b %ERRORLEVEL%
)

where node >nul 2>nul
if %ERRORLEVEL% neq 0 (
  echo BLOCKED no Node 18+ runtime; install Node 18+ 1>&2
  exit /b 10
)

node "%SCRIPT%" %*
exit /b %ERRORLEVEL%
