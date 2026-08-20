Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$repositoryRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot "..\.."))
$secretDirectory = Join-Path $repositoryRoot ".hydratrace\secrets"
$secretPath = Join-Path $secretDirectory "mimo-api-key.dpapi"
New-Item -ItemType Directory -Force -Path $secretDirectory | Out-Null

$secureKey = Read-Host "Paste the NEW MiMo API key (input is hidden)" -AsSecureString
$encrypted = ConvertFrom-SecureString $secureKey
if ([string]::IsNullOrWhiteSpace($encrypted)) { throw "No key was entered." }
Set-Content -LiteralPath $secretPath -Value $encrypted -Encoding UTF8
Write-Output "Encrypted MiMo credential stored with Windows DPAPI at .hydratrace/secrets/mimo-api-key.dpapi"
