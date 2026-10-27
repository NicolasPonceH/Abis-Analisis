param(
    [string]$SiadServiceName = "SIAD",
    [string]$HealthUrl = "http://127.0.0.1:5001/health/live",
    [int]$IntervalSeconds = 15,
    [int]$TimeoutSeconds = 5,
    [int]$FailuresBeforeRestart = 3,
    [int]$StartupGraceSeconds = 120,
    [int]$RecoveryWaitSeconds = 120
)

$ErrorActionPreference = "Stop"
$repoRoot = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$logDirectory = Join-Path $repoRoot "logs"
$logPath = Join-Path $logDirectory "siad-watchdog.log"
New-Item -ItemType Directory -Path $logDirectory -Force | Out-Null

function Write-WatchdogLog([string]$Message) {
    if (Test-Path -LiteralPath $logPath) {
        if ((Get-Item -LiteralPath $logPath).Length -gt 1MB) {
            Move-Item -LiteralPath $logPath -Destination "$logPath.1" -Force
        }
    }
    $line = "{0} {1}" -f (Get-Date -Format "yyyy-MM-dd HH:mm:ss"), $Message
    Add-Content -LiteralPath $logPath -Value $line -Encoding UTF8
}

function Test-SiadHealth {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -TimeoutSec $TimeoutSeconds -UseBasicParsing
        return ($response.StatusCode -ge 200 -and $response.StatusCode -lt 300)
    } catch {
        return $false
    }
}

$failures = 0
Write-WatchdogLog "Supervisor iniciado. Servicio='$SiadServiceName'; salud='$HealthUrl'."
Start-Sleep -Seconds $StartupGraceSeconds

while ($true) {
    if (Test-SiadHealth) {
        if ($failures -gt 0) {
            Write-WatchdogLog "SIAD volvió a responder; contador de fallos reiniciado."
        }
        $failures = 0
    } else {
        $failures++
        if ($failures -ge $FailuresBeforeRestart) {
            try {
                $service = Get-Service -Name $SiadServiceName
                if ($service.Status -eq "Stopped") {
                    Write-WatchdogLog "SIAD no respondió $failures veces; iniciando el servicio detenido."
                    Start-Service -Name $SiadServiceName
                } else {
                    Write-WatchdogLog "SIAD no respondió $failures veces; reiniciando el servicio."
                    Restart-Service -Name $SiadServiceName -Force
                }
            } catch {
                Write-WatchdogLog "No se pudo reiniciar SIAD: $($_.Exception.Message)"
            }
            $failures = 0
            Start-Sleep -Seconds $RecoveryWaitSeconds
        }
    }
    Start-Sleep -Seconds $IntervalSeconds
}
