# Tarea programada ABIS: garantiza PostgreSQL arriba, espera a que acepte
# conexiones y corre el flujo diario completo (Excel -> ETL -> BD -> Telegram),
# registrando todo en logs/flujo-diario.log.
#
# Registrada via Register-ScheduledTask como "ABIS-FlujoDiario" (ver
# docs/sprints/AVANCE_SPRINT7.md). Se puede correr a mano para probarla:
#   powershell -NoProfile -ExecutionPolicy Bypass -File scripts\tarea-diaria.ps1
#
# Sin caracteres con tilde a proposito: PowerShell 5.1 puede leer mal un .ps1
# guardado como UTF-8 sin BOM (ya rompio rutas con "Nicolas" antes).

$ErrorActionPreference = "Continue"

$proyecto = Split-Path -Parent $PSScriptRoot
$log = Join-Path $proyecto "logs\flujo-diario.log"
$nodeExe = "C:\Program Files\nodejs\node.exe"
$pgIsReady = "C:\Program Files\PostgreSQL\18\bin\pg_isready.exe"
$ensureRunning = Join-Path $env:USERPROFILE "pgdata-abis-5433\ensure-running.ps1"

# Carpeta de llegada del Excel diario (la llena ABIS-FuenteDiaria a las 07:30; en
# produccion real seria la carpeta del sistema origen). Se procesa el archivo mas reciente:
# los nombres son enrolamiento_AAAA-MM-DD.xlsx, asi que ordenar por nombre = ordenar por fecha.
$carpetaLlegada = Join-Path $env:USERPROFILE "Documents\ABIS_excel_diario"
$excelDiario = $null
if (Test-Path $carpetaLlegada) {
    $reciente = Get-ChildItem -Path $carpetaLlegada -Filter "enrolamiento_*.xlsx" |
        Sort-Object Name -Descending |
        Select-Object -First 1
    if ($reciente) { $excelDiario = $reciente.FullName }
}
if (-not $excelDiario) {
    $excelReal = Join-Path $proyecto "New_Enrolados Abis.xlsx"
    if (Test-Path $excelReal) {
        $excelDiario = $excelReal
    } else {
        $excelDiario = Join-Path $carpetaLlegada "enrolamiento_pendiente.xlsx"
        "Aviso: no hay Excel en $carpetaLlegada ni archivo principal; se procesara ruta inexistente." | Add-Content -Path $log
    }
}

"=== Inicio tarea diaria: $(Get-Date -Format o) ===" | Add-Content -Path $log

# 1. Garantizar que PostgreSQL 5433 este lanzado (corre como proceso manual y no
#    sobrevive reinicios; ensure-running.ps1 lo relanza desprendido de consola).
if (Test-Path $ensureRunning) {
    & powershell -NoProfile -ExecutionPolicy Bypass -File $ensureRunning
} else {
    "Aviso: no se encontro ensure-running.ps1 ($ensureRunning); se asume que la BD ya esta arriba." | Add-Content -Path $log
}

# 2. Esperar a que el puerto 5433 acepte conexiones (max ~60 s). Escuchar en el
#    puerto no alcanza: si la BD esta recuperandose de una caida, rechaza
#    conexiones unos segundos mas ("el sistema de base de datos esta iniciandose").
$listo = $false
for ($i = 1; $i -le 30; $i++) {
    & $pgIsReady -h localhost -p 5433 -t 2 -q
    if ($LASTEXITCODE -eq 0) { $listo = $true; break }
    Start-Sleep -Seconds 2
}
if (-not $listo) {
    "ERROR: PostgreSQL 5433 no acepto conexiones tras 60 s. Abortando." | Add-Content -Path $log
    "=== Fin tarea diaria: $(Get-Date -Format o) (exit=1) ===" | Add-Content -Path $log
    exit 1
}

# 3. Flujo completo. Se lanza node.exe directo via .NET Process (no "& cmd.exe /c" ni el
#    >> nativo de PowerShell): "& cmd.exe" abre una ventana de consola visible aunque la
#    tarea este en -WindowStyle Hidden (ese flag no lo hereda un proceso hijo lanzado asi),
#    y el >> de PS 5.1 escribe UTF-16 y deja el log ilegible. CreateNoWindow=$true evita
#    la ventana, y agregar el texto capturado con UTF8Encoding($false) evita el BOM/UTF-16.
$scriptFlujo = "scripts\flujo-diario.js"

$psi = New-Object System.Diagnostics.ProcessStartInfo
$psi.FileName = $nodeExe
$psi.Arguments = "`"$scriptFlujo`" `"$excelDiario`""
$psi.WorkingDirectory = $proyecto
$psi.RedirectStandardOutput = $true
$psi.RedirectStandardError = $true
$psi.UseShellExecute = $false
$psi.CreateNoWindow = $true

$proc = [System.Diagnostics.Process]::Start($psi)
$salida = $proc.StandardOutput.ReadToEnd()
$errores = $proc.StandardError.ReadToEnd()
$proc.WaitForExit()
$codigo = $proc.ExitCode

$utf8SinBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::AppendAllText($log, $salida, $utf8SinBom)
[System.IO.File]::AppendAllText($log, $errores, $utf8SinBom)

"=== Fin tarea diaria: $(Get-Date -Format o) (exit=$codigo) ===" | Add-Content -Path $log
exit $codigo
