$ErrorActionPreference = 'Stop'

$repoRoot = $PSScriptRoot
$env:PAPERCLIP_HOME = Join-Path $repoRoot '.paperclip-home'
$env:PAPERCLIP_INSTANCE_ID = 'm0'
$env:HOST = '127.0.0.1'
$env:PORT = '3100'
$env:SERVE_UI = 'true'
$env:PAPERCLIP_UI_DEV_MIDDLEWARE = 'false'
$env:PAPERCLIP_MIGRATION_AUTO_APPLY = 'true'

# Local agent runs need a stable signing secret so Paperclip can give them an API token.
# Keep it in the ignored instance home, never in this script or the public fork.
$secretFile = Join-Path $env:PAPERCLIP_HOME 'agent-jwt-secret.txt'
if (-not (Test-Path -LiteralPath $secretFile)) {
    New-Item -ItemType Directory -Force -Path $env:PAPERCLIP_HOME | Out-Null
    $secretBytes = New-Object byte[] 48
    $random = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $random.GetBytes($secretBytes)
    } finally {
        $random.Dispose()
    }
    [System.IO.File]::WriteAllText($secretFile, [Convert]::ToBase64String($secretBytes))
}
$secret = [System.IO.File]::ReadAllText($secretFile).Trim()
if ([string]::IsNullOrWhiteSpace($secret)) {
    throw "Agent JWT secret at '$secretFile' is empty. Delete the file and re-run this script to generate a new one. Existing agent run tokens will stop validating."
}
$env:PAPERCLIP_AGENT_JWT_SECRET = $secret

Remove-Item Env:DATABASE_URL -ErrorAction SilentlyContinue
Remove-Item Env:DATABASE_MIGRATION_URL -ErrorAction SilentlyContinue

Set-Location -LiteralPath $repoRoot
npm exec --yes --package=pnpm@9.15.4 -- pnpm dev:server
