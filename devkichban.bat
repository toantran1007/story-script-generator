@echo off
rem Chay ban code MOI NHAT (hot reload) de test truoc khi build exe.
rem Sua file trong src/ la app tu cap nhat ngay, khong can build lai.
cd /d "%~dp0"
set ELECTRON_RUN_AS_NODE=
set "NPM=npm"
if exist "C:\Program Files\nodejs\npm.cmd" set "NPM=C:\Program Files\nodejs\npm.cmd"
call "%NPM%" run dev
pause
