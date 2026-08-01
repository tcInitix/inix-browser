# Inix first-time runtime setup for Windows
$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$runtimeDir = Join-Path $root "node_modules\electron"
$distDir = Join-Path $runtimeDir "dist"
$pathFile = Join-Path $runtimeDir "path.txt"

Write-Host "Setting up Inix runtime..."

Push-Location $runtimeDir
node install.js
Pop-Location

if (-not (Test-Path (Join-Path $distDir "electron.exe"))) {
    Write-Host "Downloading Inix runtime components..."
    $zip = node -e "
        const { downloadArtifact } = require('@electron/get');
        const { version } = require('./node_modules/electron/package');
        downloadArtifact({ version, artifactName: 'electron', platform: 'win32', arch: process.arch })
            .then(p => process.stdout.write(p))
            .catch(e => { console.error(e); process.exit(1); });
    "
    if ($LASTEXITCODE -ne 0) { exit 1 }

    Remove-Item -Recurse -Force $distDir -ErrorAction SilentlyContinue
    Expand-Archive -Path $zip.Trim() -DestinationPath $distDir -Force
    [System.IO.File]::WriteAllText($pathFile, "electron.exe")
    $version = (Get-Content (Join-Path $runtimeDir "package.json") | ConvertFrom-Json).version
    [System.IO.File]::WriteAllText((Join-Path $distDir "version"), "v$version")
}

Write-Host "Inix runtime ready."
