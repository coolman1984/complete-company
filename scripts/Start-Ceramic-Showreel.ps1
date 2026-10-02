<#
.SYNOPSIS
  The showreel: Mizan (accounting), Itqan (manufacturing) and HR-System running together on the whole history of one invented company,
  Demo Ceramics Co. (July to 2 October 2026), connected to each other, every application signed in with  admin / 123.
.DESCRIPTION
  First run (about 4 minutes): plays the company's three months through the applications' own APIs (orders, planning, purchasing, receiving
  and inspection, production by lot, delivery, invoices, collections, hiring, leave, overtime, three monthly pay runs HR calculates and Mizan books),
  checks that the three applications agree, gives the demo accounts the short sign-in, then starts the three servers and the portal.
  Later runs only start them. Data lives in ..\_ceramic-live (outside every repository); real data is never touched.
  Everything here is SAMPLE data: invented company, invented people, invented salaries.
.PARAMETER Rebuild   Throw the demo data away and play the company again.
.PARAMETER NoBrowser Do not open the portal in the browser.
#>
[CmdletBinding()]
param([switch]$Rebuild, [switch]$NoBrowser)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-stack.ps1"
. "$PSScriptRoot\apps.ps1"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$pkg = Join-Path $root 'complete-company'
$data = Join-Path $root '_ceramic-live'
$marker = Join-Path $data 'built.json'
$ports = @{ mizan = 4810; gmes = 4701; hr = 8790 }
$password = '123'
$node = (Get-Command node -ErrorAction SilentlyContinue).Source
if (-not $node) { Write-Host 'Node.js 22.13 or newer is needed (https://nodejs.org).' -ForegroundColor Red; exit 1 }
$python = Find-PythonExe
if (-not $python) { Write-Host 'Python 3.10 or newer is needed for HR-System (https://www.python.org/downloads/).' -ForegroundColor Red; exit 1 }
function Test-Port([int]$Port) { [bool](Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue) }
if ((Test-Port 4501) -and -not (Test-PackagePortal -Port 4501 -Demo $true)) { throw 'Port 4501 is occupied by another service or portal mode.' }

# ---- what each application needs once
foreach ($name in 'Accounting-sys', 'GMES') {
  if (-not (Test-Path (Join-Path $root "$name\node_modules"))) { Write-Host "Installing packages for $name ..." -ForegroundColor Cyan; Push-Location (Join-Path $root $name); try { npm install --no-audit --no-fund | Out-Null } finally { Pop-Location } }
}
if (-not (Test-Path (Join-Path $root 'Accounting-sys\apps\server\dist\main.js')) -or -not (Test-Path (Join-Path $root 'Accounting-sys\apps\web\dist\index.html'))) {
  Write-Host 'Building Mizan ...' -ForegroundColor Cyan; Push-Location (Join-Path $root 'Accounting-sys'); try { npm run build | Out-Null } finally { Pop-Location }
}

$busy = @($ports.Values | Where-Object { Test-Port $_ })
$built = Test-Path -LiteralPath $marker
if ($busy.Count -gt 0 -and ($Rebuild -or -not $built)) { Write-Host "Ports $($busy -join ', ') are in use: close the running demo first (the minimised windows)." -ForegroundColor Red; exit 1 }

if ($Rebuild -and (Test-Path -LiteralPath $data)) {
  $resolved = (Resolve-Path -LiteralPath $data).Path
  if ($resolved -ne [IO.Path]::GetFullPath($data) -or ((Get-Item -LiteralPath $resolved).Attributes -band [IO.FileAttributes]::ReparsePoint)) { throw "Refusing unexpected cleanup target: $resolved" }
  Remove-Item -LiteralPath $resolved -Recurse -Force
  $built = $false
}

if (-not $built) {
  Write-Host 'Playing the history of Demo Ceramics Co. through the applications (first time only, about 4 minutes) ...' -ForegroundColor Cyan
  $log = Join-Path $root '_ceramic-live-build.log'
  & (Join-Path $PSScriptRoot 'scenario.ps1') -Action ceramic -DataDir $data 2>&1 | Tee-Object -FilePath $log | ForEach-Object { if ($_ -match '^\s{2}(ok|FAIL)|SCENARIO|VERIFY|payroll |STOPPED') { Write-Host $_ } }
  if (-not (Select-String -Path $log -Pattern 'SCENARIO: PASSED' -Quiet)) { Write-Host "The company did not play through cleanly: see $log" -ForegroundColor Red; exit 1 }
  Write-Host 'Giving the demo accounts the sign-in admin / 123 ...' -ForegroundColor Cyan
  Push-Location (Join-Path $root 'GMES\apps\mes-server')
  try { & $node --disable-warning=ExperimentalWarning --import tsx (Join-Path $pkg 'scenario\ceramic\set-logins.mjs') $data; if ($LASTEXITCODE -ne 0) { throw 'could not set the Mizan and Itqan sign-in' } } finally { Pop-Location }
  & $python (Join-Path $pkg 'scenario\ceramic\set-logins.py') $data
  if ($LASTEXITCODE -ne 0) { throw 'could not set the HR sign-in' }
  Get-Content -LiteralPath (Join-Path $data 'company.json') -Raw | Out-Null
  @{ built = (Get-Date -Format o); password = $password } | ConvertTo-Json | Set-Content -LiteralPath $marker -Encoding utf8
}

$company = (Get-Content -LiteralPath (Join-Path $data 'company.json') -Raw | ConvertFrom-Json).company
if ($busy.Count -lt $ports.Count) {
  Write-Host 'Starting Mizan, Itqan and HR-System ...' -ForegroundColor Cyan
  Start-StackServers -Root $root -DataRoot $data -Ports $ports -Company $company -LogDir (Join-Path $data 'logs') -PersonOwner hr -Visible | Out-Null
}
Wait-Up "http://127.0.0.1:$($ports.mizan)/api/health" 90
Wait-Up "http://127.0.0.1:$($ports.gmes)/api/health" 90
Wait-Up "http://127.0.0.1:$($ports.hr)/api/info" 90
$running = (Invoke-RestMethod "http://127.0.0.1:$($ports.gmes)/api/health").company
if ($running -ne $company) { Write-Host 'Another company is running on these ports: close its windows first, then start this again.' -ForegroundColor Red; exit 1 }

# the addresses the applications keep for each other were those of the build run: point them at these servers (keys are made again, the old ones retired)
$urls = @{ mizan = "http://127.0.0.1:$($ports.mizan)"; gmes = "http://127.0.0.1:$($ports.gmes)"; hr = "http://127.0.0.1:$($ports.hr)" }
$logins = @{ mizan = @{ user = 'admin'; password = $password }; gmes = @{ user = 'admin'; password = $password }; hr = @{ user = 'admin'; password = $password } }
Invoke-Pairing -Root $root -InputJson (@{ urls = $urls; logins = $logins } | ConvertTo-Json -Depth 5 -Compress)

if (-not (Test-Port 4501)) {
  Start-Process -FilePath $node -ArgumentList "`"$(Join-Path $pkg 'portal\server.mjs')`" --port 4501 --demo" -WorkingDirectory $pkg -WindowStyle Minimized | Out-Null
  Start-Sleep -Seconds 1
}
Write-Host ''
Write-Host 'Demo Ceramics Co. is running (sample data only).' -ForegroundColor Green
Write-Host "  Portal   http://127.0.0.1:4501/" -ForegroundColor Cyan
Write-Host "  Mizan    $($urls.mizan)/     Itqan  $($urls.gmes)/     HR  $($urls.hr)/" -ForegroundColor Cyan
Write-Host '  Sign in to every application with   admin / 123      (HR also: hr.officer / 123 enters and calculates pay, hr.approver / 123 approves it)' -ForegroundColor Cyan
if (-not $NoBrowser) { Open-PackageChrome 'http://127.0.0.1:4501/' }
