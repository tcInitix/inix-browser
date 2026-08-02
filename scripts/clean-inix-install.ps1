# Reset a broken Inix install so the NSIS installer can finish cleanly.
# Run in PowerShell, then re-run Inix-Setup-*.exe

$ErrorActionPreference = "SilentlyContinue"

Write-Host "Stopping Inix processes..."
taskkill /IM Inix.exe /F /T 2>$null
taskkill /IM "Inix Setup*.exe" /F /T 2>$null
Get-Process | Where-Object { $_.Name -like "Inix-Setup*" } | Stop-Process -Force
Start-Sleep -Seconds 2

$paths = @(
    "$env:LOCALAPPDATA\Programs\Inix",
    "$env:LOCALAPPDATA\Programs\inix-browser"
)

foreach ($dir in $paths) {
    if (Test-Path $dir) {
        Write-Host "Removing $dir"
        Remove-Item $dir -Recurse -Force
    }
}

Write-Host "Removing stale NSIS staging folders..."
Get-ChildItem $env:TEMP -Directory | Where-Object { $_.Name -match '^(nsm|nsa)' } | ForEach-Object {
    $staging = Join-Path $_.FullName "old-install"
    if (Test-Path $staging) {
        Write-Host "  Removing $staging"
        Remove-Item $staging -Recurse -Force
    }
}

Remove-Item "$env:TEMP\inix-debug-7afe24.log" -Force

Write-Host ""
Write-Host "Done. Close Task Manager, free some RAM if usage is high, then run Inix-Setup again."
