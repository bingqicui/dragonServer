@echo off
chcp 65001 >nul 2>&1
REM ===== Start the standalone local MongoDB =====
REM Normal dev does NOT need this file: `npm run dev` (or start-dev.bat) manages MongoDB itself.
REM Use this only when you want MongoDB running on its own, e.g. keeping data while restarting the server.
REM Data dir: %MONGO_DIR%\data   (default MONGO_DIR = ..\serverApps\mongodb, override with MONGO_HOME)
REM Keep this file ASCII-only and CRLF (see the note in start-dev.bat).

set "MONGO_DIR=%~dp0..\serverApps\mongodb"
if defined MONGO_HOME set "MONGO_DIR=%MONGO_HOME%"
set "DATA_DIR=%MONGO_DIR%\data"

if not exist "%MONGO_DIR%\bin\mongod.exe" (
  echo [ERROR] mongod.exe not found: "%MONGO_DIR%\bin\mongod.exe"
  echo         Unzip the MongoDB portable build there, or set MONGO_HOME to its folder.
  echo.
  pause
  exit /b 1
)

if not exist "%DATA_DIR%" (
  echo Creating data dir: %DATA_DIR%
  mkdir "%DATA_DIR%"
)

echo ============================================
echo  Starting MongoDB
echo  mongod : %MONGO_DIR%\bin\mongod.exe
echo  data   : %DATA_DIR%
echo  port   : 27017
echo  Close this window to stop MongoDB.
echo ============================================
echo.

"%MONGO_DIR%\bin\mongod.exe" --dbpath "%DATA_DIR%" --port 27017

echo.
echo MongoDB stopped (window closed).
pause
