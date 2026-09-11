@echo off
title Desinstalar Inicio Automatico Sistema ABIS
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo =======================================================
    echo  [!] Requiere permisos de Administrador.
    echo  Haz clic derecho y selecciona "Ejecutar como administrador"
    echo =======================================================
    pause
    exit /b 1
)

schtasks /delete /tn "SistemaABIS_Servicio" /f
echo =======================================================
echo  [OK] La tarea automatica fue eliminada correctamente.
echo =======================================================
pause
