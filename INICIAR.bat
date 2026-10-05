@echo off
chcp 65001 >nul
title BUNKER - Evidence Engine
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 (
  echo Necesitas Node.js. Descargalo en https://nodejs.org e intenta de nuevo.
  pause
  exit /b
)

if not exist node_modules (
  echo Instalando dependencias por primera vez, espera un momento...
  call npm install
)

echo Preparando BUNKER...
call npm run build >nul

echo.
echo   BUNKER esta listo en http://localhost:4173
echo   Deja esta ventana abierta mientras usas la app. Cierrala para apagarla.
echo   Usa siempre esta misma direccion: ahi viven tus datos.
echo.
start "" http://localhost:4173
call npm run preview
