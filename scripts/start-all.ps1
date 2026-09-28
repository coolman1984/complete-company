<#
.SYNOPSIS
  Starts the whole package — Mizan, GMES, HR-System, Space Planner — and the portal that links them.
  Each application keeps its own window, data folder and sign-in; closing a window stops that application only.
.PARAMETER Demo
  Start the demonstration copies (their own data folders and ports; sign in with admin / 123 everywhere).
  Real data is never touched.
.PARAMETER NoBrowser
  Do not open the portal in the browser.
.PARAMETER PortalPort
  Port of the portal page (default 4500).
#>
[CmdletBinding()]
param(
  [switch]$Demo,
  [switch]$NoBrowser,
  [int]$PortalPort = 4500
)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\apps.ps1"

function Find-Python {
  foreach ($c in @($env:PYTHON, 'python', 'py')) {
    if ($c -and (Get-Command $c -ErrorAction SilentlyContinue)) {
      $v = & $c -c 'import sys; print(sys.version_info[0] * 100 + sys.version_info[1])' 2>$null
      if ($LASTEXITCODE -eq 0 -and [int]$v -ge 310) { return (Get-Command $c).Source }
    }
  }
  return $null
}

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
  Write-Host 'Node.js 22.13 or newer is needed (https://nodejs.org). Mizan, GMES and Space Planner run on it.' -ForegroundColor Red
  exit 1
}

$mode = $(if ($Demo) { 'DEMONSTRATION' } else { 'REAL' })
Write-Host "Complete Company — starting the $mode installation" -ForegroundColor Cyan
$started = @()
foreach ($app in Get-PackageApps -Demo:$Demo) {
  $label = '{0,-14}' -f $app.Name
  if (-not (Test-Path -LiteralPath $app.Folder)) {
    Write-Host "  $label not found at $($app.Folder) — clone it next to complete-company. Skipped." -ForegroundColor Yellow
    continue
  }
  if (Test-PortOpen $app.Port) {
    Write-Host "  $label already running on port $($app.Port)" -ForegroundColor DarkGray
    continue
  }
  if ($app.Launcher -like '*.py') {
    # HR-System from source (the installed HR-System.exe starts with Windows on its own)
    $installed = Join-Path ${env:ProgramFiles} 'HR-System\HR-System.exe'
    if (Test-Path -LiteralPath $installed) {
      Start-Process -FilePath $installed -WindowStyle Minimized
    } else {
      $python = Find-Python
      if (-not $python) { Write-Host "  $label needs Python 3.10+ (or install HR-System-Setup.exe). Skipped." -ForegroundColor Yellow; continue }
      $env:PYTHONPATH = Join-Path $app.Folder 'vendor.zip'
      Start-Process -FilePath $python -ArgumentList "hr_main.py --port $($app.Port)" -WorkingDirectory $app.Folder -WindowStyle Minimized
    }
  } else {
    # cmd.exe mangles a quoted path followed by arguments; the launcher is run by name from its own folder instead.
    $argLine = (@('/c', $app.Launcher) + $app.Arguments) -join ' '
    Start-Process -FilePath $env:ComSpec -ArgumentList $argLine -WorkingDirectory $app.Folder -WindowStyle Minimized
  }
  Write-Host "  $label starting on port $($app.Port)" -ForegroundColor Green
  $started += $app
}

# The portal: one page with the four applications and their health, served by a tiny Node server
# (a browser page alone cannot read the other applications' health across ports).
if (-not (Test-PortOpen $PortalPort)) {
  # Start-Process joins an argument array without quoting, so a path with spaces is quoted here by hand.
  $portalArgs = "`"$(Join-Path $script:PackageRoot 'portal\server.mjs')`" --port $PortalPort" + $(if ($Demo) { ' --demo' } else { '' })
  Start-Process -FilePath (Get-Command node).Source -ArgumentList $portalArgs -WorkingDirectory $script:PackageRoot -WindowStyle Minimized
}
$portal = "http://127.0.0.1:$PortalPort/"
Write-Host ''
Write-Host "Portal: $portal" -ForegroundColor Cyan
if ($Demo) { Write-Host '  Demo sign-in in every application: admin / 123' -ForegroundColor Cyan }
if ($started.Count) { Write-Host '  The first start of an application builds it; its light turns green when it answers (up to a few minutes).' }

if (-not $NoBrowser) {
  $deadline = (Get-Date).AddSeconds(15)
  while (-not (Test-PortOpen $PortalPort) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 300 }
  Start-Process $portal
}
