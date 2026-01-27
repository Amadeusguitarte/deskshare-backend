@echo off
title DESKSHARE LEGACY BOOT
echo Limpiando procesos...
taskkill /f /im DeskShareWebRTC.exe /t >nul 2>&1
echo Iniciando Version LEGACY v32.0 ...
start DeskShareWebRTC.exe
exit
