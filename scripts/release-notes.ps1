# Generate user-facing release notes from git changes since last push (Ollama).
$ErrorActionPreference = "Stop"
Set-Location (Split-Path -Parent $PSScriptRoot)

$model = if ($env:RELEASE_NOTES_MODEL) { $env:RELEASE_NOTES_MODEL } else { "llama3.2:latest" }
$hostUrl = if ($env:OLLAMA_HOST) { $env:OLLAMA_HOST } else { "http://127.0.0.1:11434" }

Write-Host "Inix release notes — model: $model"
Write-Host "Ensure Ollama is running: ollama pull $model"
Write-Host ""

node scripts/generate-release-notes.mjs --model $model --host $hostUrl @args
exit $LASTEXITCODE
