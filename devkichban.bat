@echo off
if /i "%~1"=="--hidden" goto run
start "" wscript.exe "%~dp0devkichban.vbs"
exit /b
:run
setlocal
rem Chay ban code MOI NHAT (hot reload) de test truoc khi build exe.
rem Sua file trong src/ la app tu cap nhat ngay, khong can build lai.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set "NPM=npm"
if exist "C:\Program Files\nodejs\npm.cmd" set "NPM=C:\Program Files\nodejs\npm.cmd"
if not exist "logs" mkdir "logs"
call "%NPM%" run dev >> "logs\dev.log" 2>&1
exit /b %errorlevel%
