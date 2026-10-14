<#
.SYNOPSIS
    Start, stop, and open the local Crewspan server on Windows.

.DESCRIPTION
    Runs the built server and SPA on 127.0.0.1:3100, the same command the
    Linux systemd unit uses. The default command starts the server when it
    is down, opens Crewspan, and shows a small panel. Quitting the panel
    leaves the server running.

    launch    start if needed, open Crewspan, then show the panel (default)
    panel     show the panel
    start     build if the checkout changed, then start
    stop      stop the server
    restart   stop, then start
    status    print server status
    open      open Crewspan in an app window
    logs      follow server logs (Ctrl+C to leave)
    build     install dependencies and build the checkout
    help      show this help
#>
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('launch', 'panel', 'start', 'stop', 'restart', 'status', 'open', 'logs', 'build', 'help')]
    [string]$Command = 'launch'
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Url = 'http://127.0.0.1:3100'
$HealthUrl = "$Url/api/health"
$PaperclipHome = if ($env:PAPERCLIP_HOME) { $env:PAPERCLIP_HOME } else { Join-Path $env:USERPROFILE '.paperclip' }
$InstanceDir = Join-Path $PaperclipHome 'instances\default'
$InstanceConfig = Join-Path $InstanceDir 'config.json'
$StateDir = Join-Path $env:LOCALAPPDATA 'Crewspan'
$PidFile = Join-Path $StateDir 'server.pid'
$BuildStamp = Join-Path $StateDir 'built-commit'
$OutLog = Join-Path $StateDir 'server.out.log'
$ErrLog = Join-Path $StateDir 'server.err.log'

function Get-GitValue([string[]]$GitArgs) {
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    try {
        $output = & git -C $Root @GitArgs 2>$null
        if ($LASTEXITCODE -eq 0 -and $output) { return ([string]($output | Select-Object -First 1)).Trim() }
        return $null
    } catch {
        return $null
    } finally {
        $ErrorActionPreference = $previous
    }
}

function Get-HeadCommit {
    $head = Get-GitValue @('rev-parse', 'HEAD')
    if ($head) { return $head }
    return 'unknown'
}

function Get-BuiltCommit {
    if (Test-Path -LiteralPath $BuildStamp) { return (Get-Content -LiteralPath $BuildStamp -Raw).Trim() }
    return 'none'
}

function Get-ShortCommit([string]$Commit) {
    if ($Commit.Length -gt 9) { return $Commit.Substring(0, 9) }
    return $Commit
}

function Test-Healthy {
    try {
        $response = Invoke-WebRequest -Uri $HealthUrl -UseBasicParsing -TimeoutSec 3
        return ($response.StatusCode -eq 200 -and $response.Content -match '"status"\s*:\s*"ok"')
    } catch {
        return $false
    }
}

function Get-ServerProcess {
    if (-not (Test-Path -LiteralPath $PidFile)) { return $null }
    $serverPid = 0
    if (-not [int]::TryParse((Get-Content -LiteralPath $PidFile -Raw).Trim(), [ref]$serverPid)) { return $null }
    $proc = Get-Process -Id $serverPid -ErrorAction SilentlyContinue
    if ($proc -and $proc.ProcessName -eq 'node') { return $proc }
    return $null
}

function Test-NeedsBuild {
    $distServer = Join-Path $Root 'server\dist\index.js'
    $distUi = Join-Path $Root 'ui\dist\index.html'
    if (-not (Test-Path -LiteralPath $distServer) -or -not (Test-Path -LiteralPath $distUi)) { return $true }
    $built = Get-BuiltCommit
    $head = Get-HeadCommit
    if ($built -eq $head) { return $false }
    if ($built -ne 'none' -and $head -ne 'unknown') {
        $previous = $ErrorActionPreference
        $ErrorActionPreference = 'Continue'
        try {
            & git -C $Root diff --quiet $built $head -- . ':(exclude)doc' ':(exclude)docs' ':(exclude)*.md' ':(exclude)scripts/linux' ':(exclude)scripts/windows' 2>$null
            $unchanged = ($LASTEXITCODE -eq 0)
        } catch {
            $unchanged = $false
        } finally {
            $ErrorActionPreference = $previous
        }
        if ($unchanged) { return $false }
    }
    return $true
}

function Assert-Instance {
    if (-not (Test-Path -LiteralPath $InstanceConfig)) {
        throw "No Crewspan instance at $InstanceConfig. From $Root run: npm exec --yes --package=pnpm@9.15.4 -- pnpm paperclipai onboard --yes --bind loopback"
    }
}

function Invoke-Pnpm([string]$Title, [string[]]$PnpmArgs, [string]$LogPath) {
    Write-Host $Title
    $previous = $ErrorActionPreference
    $ErrorActionPreference = 'Continue'
    Push-Location -LiteralPath $Root
    try {
        & npm.cmd exec --yes --package=pnpm@9.15.4 -- pnpm @PnpmArgs 2>&1 | Out-File -FilePath $LogPath -Encoding utf8
        $code = $LASTEXITCODE
    } finally {
        Pop-Location
        $ErrorActionPreference = $previous
    }
    if ($code -ne 0) {
        Get-Content -LiteralPath $LogPath -Tail 40 | ForEach-Object { Write-Host $_ }
        throw "$Title failed. Full log: $LogPath"
    }
}

function Invoke-Build {
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
    Invoke-Pnpm -Title 'Installing dependencies...' -PnpmArgs @('install', '--frozen-lockfile') -LogPath (Join-Path $StateDir 'install.log')
    Invoke-Pnpm -Title 'Building Crewspan (this takes several minutes)...' -PnpmArgs @('build') -LogPath (Join-Path $StateDir 'build.log')
    $head = Get-HeadCommit
    Set-Content -LiteralPath $BuildStamp -Value $head -Encoding ascii
    Write-Host "Built $(Get-ShortCommit $head)."
}

function Wait-Healthy($proc) {
    # First start applies database migrations. Match the Linux unit's 300s start timeout.
    for ($i = 0; $i -lt 150; $i++) {
        if (Test-Healthy) { return $true }
        if ($proc.HasExited) { return $false }
        Start-Sleep -Seconds 2
    }
    return $false
}

function Start-CrewspanServer {
    if (Test-Healthy) {
        Write-Host "Crewspan is already running at $Url"
        return
    }
    Assert-Instance
    if (Test-NeedsBuild) {
        Write-Host "Checkout is at $(Get-ShortCommit (Get-HeadCommit)); last build was $(Get-ShortCommit (Get-BuiltCommit)). Rebuilding."
        Invoke-Build
    }
    $node = (Get-Command node.exe -ErrorAction Stop).Source
    $serverEnv = @{
        PAPERCLIP_HOME                 = $PaperclipHome
        PAPERCLIP_INSTANCE_ID          = 'default'
        HOST                           = '127.0.0.1'
        PORT                           = '3100'
        SERVE_UI                       = 'true'
        PAPERCLIP_UI_DEV_MIDDLEWARE    = 'false'
        PAPERCLIP_MIGRATION_AUTO_APPLY = 'true'
        DATABASE_URL                   = $null
        DATABASE_MIGRATION_URL         = $null
        PAPERCLIP_AGENT_JWT_SECRET     = $null
    }
    $saved = @{}
    foreach ($name in $serverEnv.Keys) {
        $saved[$name] = [Environment]::GetEnvironmentVariable($name, 'Process')
        [Environment]::SetEnvironmentVariable($name, $serverEnv[$name], 'Process')
    }
    New-Item -ItemType Directory -Force -Path $StateDir | Out-Null
    try {
        # Same command as the Linux unit and Start-Default.ps1 -Mode production.
        $proc = Start-Process -FilePath $node -ArgumentList '--import', './server/node_modules/tsx/dist/loader.mjs', 'server/dist/index.js' `
            -WorkingDirectory $Root -WindowStyle Hidden -RedirectStandardOutput $OutLog -RedirectStandardError $ErrLog -PassThru
    } finally {
        foreach ($name in $saved.Keys) {
            [Environment]::SetEnvironmentVariable($name, $saved[$name], 'Process')
        }
    }
    Set-Content -LiteralPath $PidFile -Value $proc.Id -Encoding ascii
    Write-Host 'Starting Crewspan...'
    if (-not (Wait-Healthy $proc)) {
        throw "Crewspan did not become healthy. See: $ErrLog and $OutLog"
    }
    Write-Host "Crewspan is running at $Url"
}

function Send-CtrlC([int]$TargetPid) {
    $helper = @'
Add-Type -Namespace CrewspanStop -Name NativeConsole -MemberDefinition @"
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool FreeConsole();
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool AttachConsole(uint processId);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool SetConsoleCtrlHandler(System.IntPtr handler, bool add);
[DllImport("kernel32.dll", SetLastError = true)] public static extern bool GenerateConsoleCtrlEvent(uint ctrlEvent, uint processGroupId);
"@
[void][CrewspanStop.NativeConsole]::FreeConsole()
if (-not [CrewspanStop.NativeConsole]::AttachConsole(__PID__)) { exit 2 }
[void][CrewspanStop.NativeConsole]::SetConsoleCtrlHandler([System.IntPtr]::Zero, $true)
$sent = [CrewspanStop.NativeConsole]::GenerateConsoleCtrlEvent(0, 0)
Start-Sleep -Milliseconds 300
[void][CrewspanStop.NativeConsole]::FreeConsole()
if ($sent) { exit 0 } else { exit 3 }
'@
    $script = $helper.Replace('__PID__', [string]$TargetPid)
    $encoded = [Convert]::ToBase64String([Text.Encoding]::Unicode.GetBytes($script))
    $powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
    $helperProc = Start-Process -FilePath $powershell -ArgumentList '-NoProfile', '-NonInteractive', '-EncodedCommand', $encoded `
        -WindowStyle Hidden -Wait -PassThru
    return ($helperProc.ExitCode -eq 0)
}

function Stop-EmbeddedPostgres {
    $dataDir = Join-Path $InstanceDir 'db'
    $pidFile = Join-Path $dataDir 'postmaster.pid'
    if (-not (Test-Path -LiteralPath $pidFile)) { return }
    $postmasterPid = 0
    $firstLine = (Get-Content -LiteralPath $pidFile -TotalCount 1 -ErrorAction SilentlyContinue)
    if (-not $firstLine -or -not [int]::TryParse($firstLine.Trim(), [ref]$postmasterPid)) { return }
    $proc = Get-Process -Id $postmasterPid -ErrorAction SilentlyContinue
    if (-not $proc -or $proc.ProcessName -ne 'postgres') { return }
    Write-Host 'Stopping embedded PostgreSQL...'
    Stop-Process -Id $postmasterPid -Force -ErrorAction SilentlyContinue
}

function Stop-CrewspanServer {
    $proc = Get-ServerProcess
    if (-not $proc) {
        Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
        if (Test-Healthy) {
            throw 'Crewspan is running, but this launcher did not start it. Stop that process, then try again.'
        }
        Write-Host 'Crewspan is not running.'
        return
    }
    Write-Host 'Stopping Crewspan...'
    $exited = $false
    if (Send-CtrlC $proc.Id) { $exited = $proc.WaitForExit(120000) }
    if (-not $exited) {
        & taskkill.exe /PID $proc.Id /T /F | Out-Null
        $proc.WaitForExit(10000) | Out-Null
        Stop-EmbeddedPostgres
    }
    Remove-Item -LiteralPath $PidFile -Force -ErrorAction SilentlyContinue
    Write-Host 'Crewspan stopped.'
}

function Show-Status {
    $state = 'stopped'
    if (Test-Healthy) { $state = 'running' } elseif (Get-ServerProcess) { $state = 'starting' }
    $branch = Get-GitValue @('branch', '--show-current')
    Write-Host "Crewspan: $state"
    Write-Host "URL:      $Url"
    Write-Host "Checkout: $Root ($branch @ $(Get-ShortCommit (Get-HeadCommit)))"
    Write-Host "Built:    $(Get-ShortCommit (Get-BuiltCommit))"
    Write-Host "Instance: $InstanceConfig"
    Write-Host "Logs:     $OutLog"
}

function Open-App {
    $browsers = @(
        (Join-Path ${env:ProgramFiles(x86)} 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path $env:ProgramFiles 'Microsoft\Edge\Application\msedge.exe'),
        (Join-Path ${env:ProgramFiles(x86)} 'Google\Chrome\Application\chrome.exe'),
        (Join-Path $env:ProgramFiles 'Google\Chrome\Application\chrome.exe')
    )
    $browser = $browsers | Where-Object { $_ -and (Test-Path -LiteralPath $_) } | Select-Object -First 1
    if ($browser) {
        Start-Process -FilePath $browser -ArgumentList "--app=$Url"
    } else {
        Start-Process -FilePath $Url
    }
}

function Show-Logs {
    $existing = @($OutLog, $ErrLog) | Where-Object { Test-Path -LiteralPath $_ }
    if ($existing.Count -eq 0) { throw "No server logs yet in $StateDir. Start Crewspan first." }
    Write-Host "Following logs in $StateDir (Ctrl+C to leave)."
    Get-Content -LiteralPath $existing -Tail 80 -Wait
}

function Show-Panel {
    while ($true) {
        $healthy = Test-Healthy
        $proc = Get-ServerProcess
        $state = 'stopped'
        if ($healthy) { $state = 'running' } elseif ($proc) { $state = 'starting' }
        if ($healthy -or $proc) {
            $actions = @(
                @{ Label = 'Open Crewspan'; Run = { Open-App } },
                @{ Label = 'View logs'; Run = { Show-Logs } },
                @{ Label = 'Restart'; Run = { Stop-CrewspanServer; Start-CrewspanServer } },
                @{ Label = 'Rebuild and restart'; Run = { Stop-CrewspanServer; Invoke-Build; Start-CrewspanServer; Open-App } },
                @{ Label = 'Stop server'; Run = { Stop-CrewspanServer } },
                @{ Label = 'Quit (server keeps running)'; Run = $null }
            )
        } else {
            $actions = @(
                @{ Label = 'Start server'; Run = { Start-CrewspanServer; Open-App } },
                @{ Label = 'Rebuild and start'; Run = { Invoke-Build; Start-CrewspanServer; Open-App } },
                @{ Label = 'View logs'; Run = { Show-Logs } },
                @{ Label = 'Quit'; Run = $null }
            )
        }
        Clear-Host
        Write-Host ''
        Write-Host '  Crewspan'
        Write-Host "  $state  $Url"
        $stale = ''
        if (Test-NeedsBuild) { $stale = '  (checkout changed, rebuild pending)' }
        Write-Host "  $(Get-GitValue @('branch', '--show-current')) @ $(Get-ShortCommit (Get-HeadCommit))$stale"
        Write-Host ''
        for ($i = 0; $i -lt $actions.Count; $i++) {
            Write-Host ('  {0}  {1}' -f ($i + 1), $actions[$i].Label)
        }
        Write-Host ''
        $raw = Read-Host '  Choose a number'
        if ($null -eq $raw) { return }
        $index = 0
        if (-not [int]::TryParse($raw.Trim(), [ref]$index) -or $index -lt 1 -or $index -gt $actions.Count) { continue }
        $action = $actions[$index - 1]
        if (-not $action.Run) { return }
        Write-Host ''
        try {
            & $action.Run
        } catch [System.Management.Automation.PipelineStoppedException] {
            # Ctrl+C while viewing logs returns to the panel.
        } catch {
            Write-Host "error: $($_.Exception.Message)"
        }
        if ($action.Label -ne 'View logs') {
            Write-Host ''
            Read-Host '  Press Enter to continue' | Out-Null
        }
    }
}

function Show-Help {
    Write-Host 'Usage: crewspan.ps1 [launch|panel|start|stop|restart|status|open|logs|build|help]'
    Write-Host '  launch   start if needed, open Crewspan, then show the panel (default)'
    Write-Host '  panel    show the panel'
    Write-Host '  start    build if the checkout changed, then start'
    Write-Host '  stop     stop the server'
    Write-Host '  restart  stop, then start'
    Write-Host '  status   print server status'
    Write-Host '  open     open Crewspan in an app window'
    Write-Host '  logs     follow server logs (Ctrl+C to leave)'
    Write-Host '  build    install dependencies and build the checkout'
}

try {
    switch ($Command) {
        'launch' {
            try { Start-CrewspanServer; Open-App } catch { Write-Host "error: $($_.Exception.Message)" }
            Show-Panel
        }
        'panel' { Show-Panel }
        'start' { Start-CrewspanServer }
        'stop' { Stop-CrewspanServer }
        'restart' { Stop-CrewspanServer; Start-CrewspanServer }
        'status' { Show-Status }
        'open' { Open-App }
        'logs' { Show-Logs }
        'build' { Invoke-Build }
        'help' { Show-Help }
    }
} catch {
    Write-Host "error: $($_.Exception.Message)"
    exit 1
}
