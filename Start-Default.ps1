$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$env:PAPERCLIP_HOME = Join-Path $env:USERPROFILE '.paperclip'
$env:PAPERCLIP_INSTANCE_ID = 'default'
$env:HOST = '127.0.0.1'
$env:PORT = '3100'
$env:SERVE_UI = 'true'
$env:PAPERCLIP_UI_DEV_MIDDLEWARE = 'false'
$env:PAPERCLIP_MIGRATION_AUTO_APPLY = 'true'

# Preserve the signing key carried over from the former M0 instance.
$secretFile = Join-Path $env:PAPERCLIP_HOME 'agent-jwt-secret.txt'
if (-not (Test-Path -LiteralPath $secretFile)) {
    throw "Agent JWT secret at '$secretFile' is missing. Restore it from the migration backup before starting."
}
$secret = [System.IO.File]::ReadAllText($secretFile).Trim()
if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "Agent JWT secret at '$secretFile' is empty. Restore it from the migration backup before starting."
}
$env:PAPERCLIP_AGENT_JWT_SECRET = $secret

Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_MIGRATION_URL -ErrorAction SilentlyContinue

Set-Location -LiteralPath $repoRoot
npm exec --yes --package=pnpm@9.15.4 -- pnpm dev:server
