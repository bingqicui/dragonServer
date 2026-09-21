@echo off
chcp 65001 >nul 2>&1
title Game Server - Dev (MongoDB + GameServer)
cd /d "%~dp0"

REM ===== One-click dev launcher: local MongoDB + game server =====
REM Double-click this file. Ctrl+C stops both.
REM All Chinese messages are printed by scripts\dev.mjs (Node handles UTF-8 safely).
REM Leftover MongoDB / server processes on 27017 / 3000 are closed automatically before start.
REM Switches: MONGO_TAKEOVER=0 / SERVER_TAKEOVER=0 disable takeover; DEV_DRY_RUN=1 detect only.
REM NOTE: keep this file ASCII-only and CRLF. Chinese bytes in a .bat break cmd's line parsing
REM (cmd decodes them with the OEM codepage, eats the line break and passes dev.mjs to the
REM  shell association, which pops up a "how do you want to open this file" dialog).

set "NODE_EXE="
for /f "delims=" %%i in ('where node 2^>nul') do if not defined NODE_EXE set "NODE_EXE=%%i"
if not defined NODE_EXE if exist "%ProgramFiles%\nodejs\node.exe" set "NODE_EXE=%ProgramFiles%\nodejs\node.exe"
if not defined NODE_EXE if exist "%LOCALAPPDATA%\Programs\nodejs\node.exe" set "NODE_EXE=%LOCALAPPDATA%\Programs\nodejs\node.exe"

if not defined NODE_EXE (
  echo [ERROR] Node.js not found. Install Node.js or add it to PATH.
  echo.
  pause
  exit /b 1
)

if not exist "%~dp0scripts\dev.mjs" (
  echo [ERROR] scripts\dev.mjs not found. Keep this bat in the serverCode folder.
  echo.
  pause
  exit /b 1
)

if not exist "node_modules\" (
  echo [INFO] node_modules not found - running "npm install" ...
  call npm install
  if errorlevel 1 (
    echo [ERROR] npm install failed. Check your network and retry.
    echo.
    pause
    exit /b 1
  )
)

echo ============================================
echo  Dev launcher: MongoDB + game server
echo  Stop: Ctrl+C
echo ============================================
echo.

"%NODE_EXE%" "%~dp0scripts\dev.mjs"
set "EXITCODE=%errorlevel%"

echo.
echo Dev launcher exited (code %EXITCODE%).
pause
