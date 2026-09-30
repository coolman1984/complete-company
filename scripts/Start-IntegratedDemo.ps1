<#
.SYNOPSIS
  The whole package, connected, with a company that already did some business: Mizan, GMES and HR-System share ONE
  company id, are paired with each other, and hold the result of the chain scenario (an S&OP plan and a sales order,
  planning, purchase order, goods receipt with lots, incoming inspection with a partly rejected lot, serial production,
  packing, dispatch, delivery, invoice and payment). Built the first time (about two minutes), then just started.
  The data lives in ..\_integrated-demo (outside every repository); real data is never touched.
.PARAMETER Scenario
  Which demo company: 'tv' (default, Nile Vision Electronics, scenario\chain) or 'ceramic' (Demo Ceramics Co., one tile
  order end to end, scenario\ceramic; plan\60-CERAMIC-PITCH.md). Each has its own data folder; they use the same ports,
  so run one at a time.
.PARAMETER Rebuild
  Throw the demo data away and build it again.
.PARAMETER NoBrowser
  Do not open the portal in the browser.
#>
[CmdletBinding()]
param([ValidateSet('tv', 'ceramic')][string]$Scenario = 'tv', [switch]$Rebuild, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-stack.ps1"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$demo = @{
  tv      = @{ Folder = '_integrated-demo'; Company = 'Nile Vision Electronics'; Code = 'NILE'; Chain = 'scenario\chain\run.mjs' }
  ceramic = @{ Folder = '_ceramic-demo';    Company = 'Demo Ceramics Co.';       Code = 'DCER'; Chain = 'scenario\ceramic\run.mjs' }
}[$Scenario]
$data = Join-Path $root $demo.Folder
$marker = Join-Path $data 'built.json'
$ports = @{ mizan = 4810; gmes = 4701; hr = 8790 }
$password = 'Demo-2026!'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'Node.js 22.13 or newer is needed (https://nodejs.org).' -ForegroundColor Red; exit 1 }

function Test-Port([int]$Port) { [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }

# ---- what each application needs once (installed packages, Mizan built)
foreach ($app in @(@{ n = 'Accounting-sys'; probe = 'node_modules' }, @{ n = 'GMES'; probe = 'node_modules' })) {
  $dir = Join-Path $root $app.n
  if (-not (Test-Path (Join-Path $dir $app.probe))) { Write-Host "Installing packages for $($app.n) ..." -ForegroundColor Cyan; Push-Location $dir; try { npm install --no-audit --no-fund | Out-Null } finally { Pop-Location } }
}
if (-not (Test-Path (Join-Path $root 'Accounting-sys\apps\server\dist\main.js'))) {
  Write-Host 'Building Mizan ...' -ForegroundColor Cyan; Push-Location (Join-Path $root 'Accounting-sys'); try { npm run build | Out-Null } finally { Pop-Location }
}

$busy = @($ports.Values | Where-Object { Test-Port $_ })
if ($busy.Count -gt 0 -and ($Rebuild -or -not (Test-Path $marker))) {
  Write-Host "Ports $($busy -join ', ') are in use: close the running demo first." -ForegroundColor Red; exit 1
}

if ($Rebuild -and (Test-Path $data)) { Remove-Item -LiteralPath $data -Recurse -Force }

if (-not (Test-Path $marker)) {
  Write-Host 'Building the integrated demo company (first time only) ...' -ForegroundColor Cyan
  $logs = Join-Path $data 'logs'; New-Item -ItemType Directory -Force -Path $logs | Out-Null
  $stack = $null
  try {
    $stack = New-Stack -Root $root -DataRoot $data -Ports $ports -Password $password -LogDir $logs -CompanyName $demo.Company -CompanyCode $demo.Code -Visible
    Invoke-Pairing -Root $root -InputJson $stack.Json
    $env:CHAIN_PAIRED = '1'; $env:CHAIN_INPUT = $stack.Json
    & $node (Join-Path $root "complete-company\$($demo.Chain)")
    if ($LASTEXITCODE -ne 0) { throw 'the demo scenario did not pass; see the messages above' }
    @{ scenario = $Scenario; company = $stack.Company; built = (Get-Date -Format o); password = $password; hrPassword = $stack.Logins.hr.password } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
  } catch {
    if ($stack) { foreach ($p in $stack.Procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } }
    Start-Sleep -Seconds 1
    Remove-Item -LiteralPath $data -Recurse -Force -ErrorAction SilentlyContinue
    throw
  }
} else {
  $built = Get-Content -LiteralPath $marker -Raw | ConvertFrom-Json
  if (-not ($busy.Count -eq $ports.Count)) {
    Write-Host 'Starting the integrated demo ...' -ForegroundColor Cyan
    Start-StackServers -Root $root -DataRoot $data -Ports $ports -Company $built.company -LogDir (Join-Path $data 'logs') -Visible | Out-Null
  }
  Wait-Up "http://127.0.0.1:$($ports.mizan)/api/health" 90
  Wait-Up "http://127.0.0.1:$($ports.gmes)/api/health" 90
  # the two demo companies share the ports: never show one while the other is running
  $running = (Invoke-RestMethod "http://127.0.0.1:$($ports.gmes)/api/health").company
  if ($running -ne $built.company) {
    Write-Host 'Another demo company is running on these ports: close its windows first, then start this one again.' -ForegroundColor Red; exit 1
  }
}

# ---- the portal
if (-not (Test-Port 4500)) {
  $portalArgs = "`"$(Join-Path $root 'complete-company\portal\server.mjs')`" --port 4500 --demo"
  Start-Process -FilePath $node -ArgumentList $portalArgs -WorkingDirectory (Join-Path $root 'complete-company') -WindowStyle Minimized | Out-Null
  Start-Sleep -Seconds 1
}
Write-Host ''
Write-Host 'Portal:  http://127.0.0.1:4500/' -ForegroundColor Cyan
Write-Host "Sign in to every application with  admin / $password" -ForegroundColor Cyan
if (-not $NoBrowser) { Start-Process 'http://127.0.0.1:4500/' }
