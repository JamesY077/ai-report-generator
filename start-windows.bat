@echo off
setlocal

cd /d "%~dp0"

echo AI Report Generator
echo Project directory: %cd%
echo.

where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed.
  echo Please install Node.js 22 LTS or newer from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

where npm >nul 2>nul
if errorlevel 1 (
  echo npm is not installed.
  echo Please reinstall Node.js from https://nodejs.org/
  echo.
  pause
  exit /b 1
)

for /f "tokens=*" %%i in ('node -v') do set NODE_VERSION=%%i
for /f "tokens=*" %%i in ('npm -v') do set NPM_VERSION=%%i
echo Node: %NODE_VERSION%
echo npm:  %NPM_VERSION%
echo.

if not exist "node_modules" (
  echo Installing dependencies...
  if exist "package-lock.json" (
    call npm ci
  ) else (
    call npm install
  )
  if errorlevel 1 (
    echo.
    echo Failed to install dependencies.
    pause
    exit /b 1
  )
) else (
  echo Dependencies already installed.
)

echo.
echo Starting development server...
echo A browser window should open automatically.
echo Press Ctrl+C in this window to stop the server.
echo.

call npm run dev -- --open

echo.
echo Server stopped.
pause
