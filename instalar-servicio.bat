@echo off
title Configurar Inicio Automatico Sistema ABIS
:: Verificar permisos de Administrador
net session >nul 2>&1
if %errorlevel% neq 0 (
    echo =======================================================
    echo  [!] ERROR: Requiere permisos de Administrador.
    echo.
    echo  Por favor haz clic derecho sobre este archivo y elige:
    echo  "Ejecutar como administrador"
    echo =======================================================
    pause
    exit /b 1
)

echo =======================================================
echo  Registrando Sistema ABIS en el Programador de Windows...
echo =======================================================

schtasks /create /tn "SistemaABIS_Servicio" /tr "\"C:\Users\Nicolás\Desktop\sistema-abis\scripts\start-background-service.bat\"" /sc onstart /ru "NT AUTHORITY\SYSTEM" /rl highest /f

if %errorlevel% equ 0 (
    echo.
    echo =======================================================
    echo  [OK] CONFIGURACION EXITOSA!
    echo.
    echo  El Sistema ABIS ahora iniciara solo apenas encienda el PC,
    echo  incluso si nadie ingresa la contrasenia de usuario.
    echo =======================================================
) else (
    echo.
    echo [ERROR] No se pudo crear la tarea programada.
)
echo.
pause
