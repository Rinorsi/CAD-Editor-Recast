@echo off
title Item Workshop Preview Launcher
echo Starting Item Workshop preview. First start takes about 1 minute; the game window opens by itself.
echo Keep this window open. It closes after you quit the game.
echo.
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0tools\preview\start.ps1" %*
if errorlevel 1 goto failed
exit /b 0
:failed
echo.
echo Launch failed, see the reason above. Press any key to close.
pause >nul
exit /b 1
