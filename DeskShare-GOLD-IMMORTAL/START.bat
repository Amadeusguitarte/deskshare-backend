@echo off
title Iniciando DeskShare GOLD IMMORTAL
echo Matando procesos antiguos...
taskkill /f /im DeskShareWebRTC.exe /t >nul 2>&1
echo Iniciando Version Restablecida...
start DeskShareWebRTC.exe
exit
