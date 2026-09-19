@echo off
rem Double-click this file to start the asset register on a Windows PC.
rem Leave the window open while people are using it.

cd /d "%~dp0"

if not exist node_modules (
  echo Installing what the program needs, one moment...
  call npm ci --omit=dev || call npm install --omit=dev
)

set NODE_ENV=production
node server.js
pause
