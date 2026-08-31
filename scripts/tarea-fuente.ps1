# Tarea programada ABIS-FuenteDiaria (07:30): simula al sistema origen.
# Garantiza PostgreSQL arriba, genera los registros del dia en abis_fuente y exporta el
# Excel diario a la carpeta de llegada. Log en logs/fuente-diario.log.
#
# Registrada via Register-ScheduledTask (ver docs/PruebDataBase_FAKE.md). Se puede correr
# a mano para probarla:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tarea-fuente.ps1
#
# Sin caracteres con tilde a proposito: PowerShell 5.1 puede leer mal un .ps1 guardado
# como UTF-8 sin BOM.

$ErrorActionPreference = "Continue"

$proyecto = Split-Path -Parent $PSScriptRoot
$log = Join-Path $proyecto "logs\fuente-diario.log"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$pgIsReady = "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe"
$ensureRunning = Join-Path $env:USERPROFILE "pgdata-abis-5433\ensure-running.ps1"

"=== Inicio fuente diaria: $(Get-Date -Format o) ===" | Add-Content -Path $log

# 1. Garantizar PostgreSQL 5433 lanzado (no sobrevive reinicios).
if (Test-Path $ensureRunning) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ensureRunning
}

# 2. Esperar a que acepte conexiones (max ~60 s).
$listo = $false
for ($i = 1; $i -le 30; $i++) {
    & $pgIsReady -h localhost -p 5433 -t 2 -q
    if ($LASTEXITCODE -eq 0) { $listo = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $listo) {
    "ERROR: PostgreSQL 5433 no acepto conexiones tras 60 s. Abortando." | Add-Content -Path $log
    "=== Fin fuente diaria: $(Get-Date -Format o) (exit=1) ===" | Add-Content -Path $log
    exit 1
}

# 3. Generar datos del dia y exportar el Excel. Redireccion dentro de cmd: el >> de
#    PS 5.1 escribe UTF-16 y deja el log ilegible.
& cmd.exe /c "`"$nodeExe`" scripts\fuente-generar.js >> `"$log`" 2>&1"
$codigoGenerar = $LASTEXITCODE
& cmd.exe /c "`"$nodeExe`" scripts\fuente-exportar.js >> `"$log`" 2>&1"
$codigoExportar = $LASTEXITCODE

"=== Fin fuente diaria: $(Get-Date -Format o) (generar=$codigoGenerar, exportar=$codigoExportar) ===" | Add-Content -Path $log
if ($codigoGenerar -ne 0 -or $codigoExportar -ne 0) { exit 1 }
exit 0
