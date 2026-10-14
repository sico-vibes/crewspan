<#
.SYNOPSIS
    Installs the Crewspan Desktop and Start menu shortcuts.

.DESCRIPTION
    Creates Crewspan shortcuts that run scripts/windows/crewspan.ps1 with the
    Paperclip icon. Use -Uninstall to remove the shortcuts and icon.
    Instance data in %USERPROFILE%\.paperclip is left untouched.
#>
[CmdletBinding()]
param(
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$Root = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$Launcher = Join-Path $PSScriptRoot 'crewspan.ps1'
$Artwork = Join-Path $Root 'ui\public\android-chrome-512x512.png'
$IconDir = Join-Path $env:USERPROFILE '.paperclip\icons'
$IconFile = Join-Path $IconDir 'crewspan.ico'
$PowerShellExe = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$DesktopShortcut = Join-Path ([Environment]::GetFolderPath('Desktop')) 'Crewspan.lnk'
$StartShortcut = Join-Path ([Environment]::GetFolderPath('Programs')) 'Crewspan.lnk'

function Remove-CrewspanShortcuts {
    Remove-Item -LiteralPath $DesktopShortcut, $StartShortcut, $IconFile -Force -ErrorAction SilentlyContinue
    Write-Host "Crewspan shortcuts removed. Instance data in $(Join-Path $env:USERPROFILE '.paperclip') was left untouched."
}

if ($Uninstall) {
    Remove-CrewspanShortcuts
    return
}

if (-not (Get-Command node.exe -ErrorAction SilentlyContinue)) {
    throw 'node not found. Install Node >= 24.11 first.'
}
if (-not (Test-Path -LiteralPath $Artwork)) {
    throw "Paperclip icon not found: $Artwork"
}

# Explorer draws PNG-compressed icon frames as a generic document, so the
# frames are uncompressed 32-bit bitmaps at 16, 32, 48, and 256 px.
function New-CrewspanIcon([string]$SourcePng, [string]$IconPath) {
    Add-Type -AssemblyName System.Drawing
    $source = [System.Drawing.Image]::FromFile($SourcePng)
    $frames = @()
    try {
        foreach ($size in 16, 32, 48, 256) {
            $bitmap = New-Object System.Drawing.Bitmap -ArgumentList $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
            $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
            try {
                $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
                $graphics.DrawImage($source, 0, 0, $size, $size)
            } finally {
                $graphics.Dispose()
            }
            $stream = New-Object System.IO.MemoryStream
            $writer = New-Object System.IO.BinaryWriter -ArgumentList $stream
            try {
                $writer.Write([uint32]40)
                $writer.Write([int32]$size)
                $writer.Write([int32]($size * 2))
                $writer.Write([uint16]1)
                $writer.Write([uint16]32)
                $writer.Write([uint32]0)
                $writer.Write([uint32]0)
                $writer.Write([int32]0)
                $writer.Write([int32]0)
                $writer.Write([uint32]0)
                $writer.Write([uint32]0)
                for ($y = $size - 1; $y -ge 0; $y--) {
                    for ($x = 0; $x -lt $size; $x++) {
                        $c = $bitmap.GetPixel($x, $y)
                        $writer.Write([byte]$c.B)
                        $writer.Write([byte]$c.G)
                        $writer.Write([byte]$c.R)
                        $writer.Write([byte]$c.A)
                    }
                }
                $maskBytes = [int][Math]::Ceiling($size / 32.0) * 4 * $size
                $writer.Write((New-Object byte[] $maskBytes))
                $writer.Flush()
                $frames += [pscustomobject]@{ Size = $size; Data = $stream.ToArray() }
            } finally {
                $writer.Dispose()
                $stream.Dispose()
                $bitmap.Dispose()
            }
        }
    } finally {
        $source.Dispose()
    }

    $file = New-Object System.IO.MemoryStream
    $writer = New-Object System.IO.BinaryWriter -ArgumentList $file
    try {
        $writer.Write([uint16]0)
        $writer.Write([uint16]1)
        $writer.Write([uint16]$frames.Count)
        $offset = 6 + (16 * $frames.Count)
        foreach ($frame in $frames) {
            $dimension = 0
            if ($frame.Size -lt 256) { $dimension = $frame.Size }
            $writer.Write([byte]$dimension)
            $writer.Write([byte]$dimension)
            $writer.Write([byte]0)
            $writer.Write([byte]0)
            $writer.Write([uint16]1)
            $writer.Write([uint16]32)
            $writer.Write([uint32]$frame.Data.Length)
            $writer.Write([uint32]$offset)
            $offset += $frame.Data.Length
        }
        foreach ($frame in $frames) { $writer.Write([byte[]]$frame.Data) }
        $writer.Flush()
        [System.IO.File]::WriteAllBytes($IconPath, $file.ToArray())
    } finally {
        $writer.Dispose()
        $file.Dispose()
    }
}

function New-CrewspanShortcut([string]$Path) {
    $shell = New-Object -ComObject WScript.Shell
    try {
        $link = $shell.CreateShortcut($Path)
        $link.TargetPath = $PowerShellExe
        $link.Arguments = "-NoProfile -ExecutionPolicy Bypass -File `"$Launcher`""
        $link.WorkingDirectory = $Root
        $link.IconLocation = "$IconFile,0"
        $link.Description = 'Start and open the local Crewspan server'
        $link.WindowStyle = 1
        $link.Save()
    } finally {
        [void][Runtime.InteropServices.Marshal]::ReleaseComObject($shell)
    }
}

New-Item -ItemType Directory -Force -Path $IconDir | Out-Null
New-CrewspanIcon -SourcePng $Artwork -IconPath $IconFile
New-CrewspanShortcut -Path $DesktopShortcut
New-CrewspanShortcut -Path $StartShortcut

Write-Host "Crewspan shortcuts installed for $Root"
Write-Host "  desktop:  $DesktopShortcut"
Write-Host "  start:    $StartShortcut"
Write-Host "  command:  $Launcher"
Write-Host "  icon:     $IconFile"
