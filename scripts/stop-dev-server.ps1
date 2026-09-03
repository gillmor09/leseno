# Stops the Next.js (or any) process listening on port 3000.

$ErrorActionPreference = "SilentlyContinue"

$conns = Get-NetTCPConnection -LocalPort 3000 -State Listen
if (-not $conns) {
  Write-Host "Kein Dev-Server auf Port 3000 gefunden."
  exit 0
}

$pids = $conns | Select-Object -ExpandProperty OwningProcess -Unique
foreach ($procId in $pids) {
  & taskkill.exe /F /T /PID $procId | Out-Null
}

Write-Host ("Dev-Server auf Port 3000 wurde beendet (PID: " + ($pids -join ", ") + ").")
