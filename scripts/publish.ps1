# Loads GH_TOKEN then runs the full release pipeline (same as npm run release).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

if (-not $env:GH_TOKEN) {
  $env:GH_TOKEN = [System.Environment]::GetEnvironmentVariable("GH_TOKEN", "User")
}
if (-not $env:GH_TOKEN) {
  $env:GH_TOKEN = [System.Environment]::GetEnvironmentVariable("GH_TOKEN", "Machine")
}

node scripts/release.mjs @args
exit $LASTEXITCODE
