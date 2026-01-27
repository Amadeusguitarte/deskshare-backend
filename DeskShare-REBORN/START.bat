@echo off
title DESKSHARE REBORN BOOT
echo Limpiando procesos antiguos...
taskkill /f /im DeskShareWebRTC.exe /t >nul 2>&1
echo Iniciando Version REBORN v30.0...
start DeskShareWebRTC.exe
exit
