Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$logDirectory = Join-Path $repositoryRoot "generated\deploy"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$logPath = Join-Path $logDirectory ("app-{0}-{1}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $PID)

Start-Transcript -Path $logPath -Force
try {
  Set-Location -LiteralPath $repositoryRoot
  $env:NODE_ENV = "production"

  & docker compose up -d hydradb
  if ($LASTEXITCODE -ne 0) { throw "Could not start HydraDB (exit $LASTEXITCODE)." }

  & pnpm.cmd hydra:wait
  if ($LASTEXITCODE -ne 0) { throw "HydraDB did not become ready (exit $LASTEXITCODE)." }

  $nextCli = Join-Path $repositoryRoot "node_modules\next\dist\bin\next"
  & node.exe $nextCli start -H 127.0.0.1 -p 3418
  if ($LASTEXITCODE -ne 0) { throw "Next.js exited with code $LASTEXITCODE." }
} finally {
  Stop-Transcript
}
