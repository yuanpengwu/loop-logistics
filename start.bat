@echo off
echo Loop Logistics -- starting server...
cd /d "%~dp0"
where node >nul 2>&1 || (echo ERROR: Node.js not found. Install from https://nodejs.org && pause && exit /b 1)
if not exist node_modules (
  echo Installing dependencies...
  npm install
)
echo.
echo Server starting at http://localhost:3000
echo Press Ctrl+C to stop.
echo.
start "" http://localhost:3000
node server.js
pause
