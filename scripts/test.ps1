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
foreach ($f in @('agent\cdp.mjs', 'agent\stage.mjs', 'agent\skills\mizan.mjs', 'agent\try-journal.mjs', 'agent\studio\record.mjs', 'agent\studio\audio.mjs', 'agent\studio\render.mjs', 'agent\studio\shoot-journal.mjs')) {
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
} finally { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue }

Write-Host ''
if ($failures.Count) { Write-Host "$($failures.Count) FAILED" -ForegroundColor Red; exit 1 }
Write-Host 'ALL GREEN' -ForegroundColor Green
