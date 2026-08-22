@echo off
rem Phat hanh ban moi len GitHub Releases (app nhan vien tu cap nhat).
rem Cach dung: tang "version" trong package.json roi double-click file nay.
rem Token GitHub doc tu file .gh_token (dong dau tien).
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set /p GH_TOKEN=<.gh_token
if "%GH_TOKEN%"=="" (
  echo Khong doc duoc token tu .gh_token
  pause
  exit /b 1
)
set "NPM=npm"
if exist "C:\Program Files\nodejs\npm.cmd" set "NPM=C:\Program Files\nodejs\npm.cmd"
call "%NPM%" run release
pause
