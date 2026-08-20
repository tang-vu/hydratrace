Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$configPath = Join-Path $env:USERPROFILE ".cloudflared\hydratrace.yml"
$logDirectory = Join-Path $repositoryRoot "generated\deploy"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$logPath = Join-Path $logDirectory ("tunnel-{0}-{1}.log" -f (Get-Date -Format "yyyyMMdd-HHmmss"), $PID)

if (-not (Test-Path -LiteralPath $configPath -PathType Leaf)) {
  throw "HydraTrace tunnel configuration is missing at $configPath."
}

Start-Transcript -Path $logPath -Force
try {
  & cloudflared tunnel --no-autoupdate --config $configPath run
  if ($LASTEXITCODE -ne 0) { throw "cloudflared exited with code $LASTEXITCODE." }
} finally {
  Stop-Transcript
}
