<#
.SYNOPSIS
  Checks the package repository: apps.json is valid and complete, every launcher it names exists in the sibling
  application folders, real and demo ports never collide (except Space Planner, which has one copy), and the portal
  answers /api/status with one entry per application.
#>
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\apps.ps1"
$failures = @()
function Check($ok, $what) { if ($ok) { Write-Host "  ok    $what" -ForegroundColor Green } else { Write-Host "  FAIL  $what" -ForegroundColor Red; $script:failures += $what } }

Write-Host '== apps.json'
$raw = (Get-Content -LiteralPath (Join-Path $script:PackageRoot 'apps.json') -Raw -Encoding utf8 | ConvertFrom-Json).apps
Check ($raw.Count -eq 4) 'four applications'
Check ((@($raw.key) | Sort-Object -Unique).Count -eq 4) 'keys are unique'
foreach ($a in $raw) { Check ($a.name -and $a.nameAr -and $a.role -and $a.roleAr -and $a.health) "$($a.key): names and roles in both languages, health address" }

foreach ($demo in $false, $true) {
  $mode = $(if ($demo) { 'demo' } else { 'real' })
  $apps = @(Get-PackageApps -Demo:$demo)
  Check ((@($apps.Port) | Sort-Object -Unique).Count -eq 4) "$mode ports are unique"
  foreach ($a in $apps) {
    if (Test-Path -LiteralPath $a.Folder) { Check (Test-Path -LiteralPath (Join-Path $a.Folder $a.Launcher)) "$mode $($a.Key): launcher $($a.Launcher) exists" }
    else { Write-Host "  skip  $mode $($a.Key): $($a.Folder) not cloned here" -ForegroundColor Yellow }
  }
}
$real = @(Get-PackageApps); $demoApps = @(Get-PackageApps -Demo)
foreach ($r in $real) {
  $d = $demoApps | Where-Object Key -eq $r.Key
  if ($r.Key -ne 'space') { Check ($r.Port -ne $d.Port) "$($r.Key): demo port differs from the real one" }
}

Write-Host '== demo companies'
foreach ($d in @(@{ bat = 'Start-Integrated-Demo.bat'; chain = 'scenario\chain\run.mjs' }, @{ bat = 'Start-Ceramic-Demo.bat'; chain = 'scenario\ceramic\run.mjs' })) {
  Check (Test-Path -LiteralPath (Join-Path $script:PackageRoot $d.bat)) "$($d.bat) exists"
  & (Get-Command node).Source --check (Join-Path $script:PackageRoot $d.chain) 2>$null
  Check ($LASTEXITCODE -eq 0) "$($d.chain) is valid JavaScript"
}
Check ((Get-Content -LiteralPath (Join-Path $script:PackageRoot 'Start-Ceramic-Demo.bat') -Raw) -match '-Scenario ceramic') 'the ceramic launcher asks for the ceramic scenario'
foreach ($f in @('agent\cdp.mjs', 'agent\stage.mjs', 'agent\skills\mizan.mjs', 'agent\try-journal.mjs', 'agent\studio\record.mjs', 'agent\studio\audio.mjs', 'agent\studio\render.mjs', 'agent\studio\shoot-journal.mjs', 'agent\skills\gmes.mjs', 'agent\skills\space.mjs', 'agent\studio\shoot-floor-to-container.mjs', 'agent\studio\sets\gmes-tile-line.mjs', 'agent\studio\shoot-line-day.mjs', 'agent\studio\shoot-month-end.mjs', 'agent\studio\sets\mizan-ceramic-quarter.mjs', 'agent\studio\shoot-order-to-po.mjs', 'agent\studio\sets\order-to-po.mjs', 'agent\studio\measure.mjs')) {
  & (Get-Command node).Source --check (Join-Path $script:PackageRoot $f) 2>$null
  Check ($LASTEXITCODE -eq 0) "$f is valid JavaScript"
}

Write-Host '== portal'
$port = 45990
$p = Start-Process -FilePath (Get-Command node).Source -ArgumentList "`"$(Join-Path $script:PackageRoot 'portal\server.mjs')`" --port $port --demo" -PassThru -WindowStyle Hidden
try {
  $deadline = (Get-Date).AddSeconds(10)
  while (-not (Test-PortOpen $port) -and (Get-Date) -lt $deadline) { Start-Sleep -Milliseconds 200 }
  $s = Invoke-RestMethod "http://127.0.0.1:$port/api/status"
  Check ($s.demo -eq $true) 'status says demo when started with --demo'
  Check (@($s.apps).Count -eq 4) 'status lists four applications'
  Check ((@($s.apps | Where-Object { $_.port -and $null -ne $_.ok })).Count -eq 4) 'each entry has a port and a health result'
  $html = Invoke-WebRequest "http://127.0.0.1:$port/" -UseBasicParsing
  Check ($html.Content -match 'admin / 123') 'page shows the demo sign-in'
  Check ($html.Content -match 'dir' -and $html.Content -match 'العربية') 'page has the Arabic switch'
  $nf = try { (Invoke-WebRequest "http://127.0.0.1:$port/../apps.json" -UseBasicParsing).StatusCode } catch { $_.Exception.Response.StatusCode.value__ }
  Check ($nf -eq 404) 'nothing but the page and the status is served'
  $sc = Invoke-WebRequest "http://127.0.0.1:$port/scenario" -UseBasicParsing
  Check ($sc.StatusCode -eq 200 -and $sc.Content -match 'Nile Vision') 'the Scenario page is served'
  $sj = Invoke-RestMethod "http://127.0.0.1:$port/api/scenario"
  Check ($null -ne $sj.built) 'the Scenario data answers (built or not yet)'
} finally { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }

Write-Host '== verifier (fake applications, no network)'
$vt = & (Get-Command node).Source --test (Join-Path $script:PackageRoot 'scenario\verify\verify.test.mjs') 2>&1
Check ($LASTEXITCODE -eq 0) 'the verifier fails when the applications disagree and passes when they agree'
$bt = & (Get-Command node).Source --test (Join-Path $script:PackageRoot 'portal\backup.test.mjs') 2>&1
Check ($LASTEXITCODE -eq 0) 'back up everything counts only a rehearsed backup and names the application that failed'

Write-Host '== scenario engine (mini run: five days, one model, the real applications)'
$mesServer = Join-Path (Split-Path -Parent $script:PackageRoot) 'GMES\apps\mes-server'
$mizanDist = Join-Path (Split-Path -Parent $script:PackageRoot) 'Accounting-sys\apps\server\dist\app.js'
if ((Test-Path -LiteralPath (Join-Path (Split-Path -Parent (Split-Path -Parent $mesServer)) 'node_modules')) -and (Test-Path -LiteralPath $mizanDist)) {
  $mini = & (Join-Path $PSScriptRoot 'scenario.ps1') -Action mini 2>&1
  Check ($LASTEXITCODE -eq 0 -and ($mini -match 'SCENARIO: PASSED')) 'the mini scenario plays, reconciles across the applications and backs them up'
  if ($LASTEXITCODE -ne 0) { $mini | Select-Object -Last 15 | ForEach-Object { Write-Host "    $_" } }
} else { Write-Host '  skip  GMES packages or Mizan build missing' -ForegroundColor Yellow }

Write-Host '== master-data importer (CSV folder -> Mizan and Itqan)'
$it = & (Get-Command node).Source --test (Join-Path $script:PackageRoot 'import\masters.test.mjs') 2>&1
Check ($LASTEXITCODE -eq 0) 'the importer names every mistake with its file and line, and accepts the templates'
$gmesRoot = Join-Path (Split-Path -Parent $script:PackageRoot) 'GMES'
if ((Test-Path -LiteralPath (Join-Path $gmesRoot 'node_modules')) -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $script:PackageRoot) 'Accounting-sys\apps\server\dist\app.js'))) {
  Push-Location (Join-Path $gmesRoot 'apps\mes-server')
  try { $smoke = & (Get-Command node).Source --disable-warning=ExperimentalWarning --import tsx (Join-Path $script:PackageRoot 'import\apply-smoke.mjs') 2>&1 } finally { Pop-Location }
  Check ($smoke -match 'IMPORT SMOKE: PASSED') 'the importer enters the templates in the real applications, and running it again creates nothing'
  if ($smoke -notmatch 'IMPORT SMOKE: PASSED') { $smoke | Select-Object -Last 12 | ForEach-Object { Write-Host "    $_" } }
} else { Write-Host '  skip  GMES packages or Mizan build missing' -ForegroundColor Yellow }
Write-Host '== readiness check (is an installation ready for real data?)'
if ((Test-Path -LiteralPath (Join-Path $gmesRoot 'node_modules')) -and (Test-Path -LiteralPath (Join-Path (Split-Path -Parent $script:PackageRoot) 'Accounting-sys\apps\server\dist\app.js'))) {
  Push-Location (Join-Path $gmesRoot 'apps\mes-server')
  try { $ready = & (Get-Command node).Source --disable-warning=ExperimentalWarning --import tsx (Join-Path $script:PackageRoot 'ready\check-smoke.mjs') 2>&1 } finally { Pop-Location }
  Check ($ready -match 'READY SMOKE: PASSED') 'an installation on a demonstration password is not ready; one with its own password, paired, is ready'
  if ($ready -notmatch 'READY SMOKE: PASSED') { $ready | Select-Object -Last 12 | ForEach-Object { Write-Host "    $_" } }
} else { Write-Host '  skip  GMES packages or Mizan build missing' -ForegroundColor Yellow }
Write-Host ''
if ($failures.Count) { Write-Host "$($failures.Count) FAILED" -ForegroundColor Red; exit 1 }
Write-Host 'ALL GREEN' -ForegroundColor Green

