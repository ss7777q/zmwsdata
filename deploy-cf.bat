@echo off
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0deploy-cf.ps1"
exit /b %ERRORLEVEL%
