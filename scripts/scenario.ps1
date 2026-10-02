<#
.SYNOPSIS
  The Nile Vision scenario: builds the four demonstration data folders by playing the days through the applications'
  own HTTP APIs, verifies them across applications, and packs the result.
.PARAMETER Action
  build  plays the window (default 2026-07-01..2026-09-28) and verifies; writes scenario\out\<name>\ (Mizan, GMES, HR data, build.log, manifest.json)
  mini   five days, one model: the quick proof the test script runs
  ceramic       Demo Ceramics Co.: 95 days of tiles with about 176 people, sample salaries and three monthly pay runs; writes scenario\out\demo-ceramics\
  ceramic-mini  fifteen days across a month end (pay run included), one tile: the quick proof of the ceramic book
  show   prints the build log and manifest of the last run
  pack   zips the last run into scenario\out\<name>.zip
.PARAMETER Scale
  Share of the plant's real volumes that is played (1 = all, 0.04 = one set in 25). People, machines and lead times do not scale.
#>
param(
  [ValidateSet('build', 'mini', 'ceramic', 'ceramic-mini', 'show', 'pack')][string]$Action = 'build',
  [string]$From, [string]$To, [double]$Scale = 0.04, [string]$Models, [string]$Name = 'nile-vision', [switch]$NoHr
)
$ErrorActionPreference = 'Stop'
$pkg = Split-Path -Parent $PSScriptRoot
$root = Split-Path -Parent $pkg
$out = Join-Path $pkg "scenario\out\$Name"
$mesServer = Join-Path $root 'GMES\apps\mes-server'
$engine = Join-Path $pkg 'scenario\engine\main.mjs'

switch ($Action) {
  'show' {
    Get-Content -LiteralPath (Join-Path $out 'build.log')
    Get-Content -LiteralPath (Join-Path $out 'manifest.json') -Raw
    return
  }
  'pack' {
    $zip = "$out.zip"
    if (Test-Path -LiteralPath $zip) { Remove-Item -LiteralPath $zip }
    Compress-Archive -Path (Join-Path $out '*') -DestinationPath $zip
    Write-Host "packed $zip"
    return
  }
}

# Mizan runs from its built JavaScript: the same files the installed program runs
$dist = Join-Path $root 'Accounting-sys\apps\server\dist\app.js'
if (-not (Test-Path -LiteralPath $dist)) { throw "Mizan is not built ($dist): run 'npm run build' in Accounting-sys\apps\server" }
if (-not (Test-Path -LiteralPath (Join-Path $root 'GMES\node_modules'))) { throw "GMES packages are not installed: run 'npm install' in $mesServer" }

$engineArgs = @()
if ($Action -eq 'mini') {
  $out = Join-Path $pkg 'scenario\out\mini'
  $engineArgs += @('--from', '2026-07-06', '--to', '2026-07-10', '--scale', '0.05', '--models', 'NV-43U')
} elseif ($Action -eq 'ceramic-mini') {
  $out = Join-Path $pkg 'scenario\out\ceramic-mini'
  $engineArgs += @('--book', 'ceramic', '--from', '2026-07-20', '--to', '2026-08-03', '--models', 'TL-6060-WHT')
} elseif ($Action -eq 'ceramic') {
  $out = Join-Path $pkg 'scenario\out\demo-ceramics'
  $engineArgs += @('--book', 'ceramic')
  if ($From) { $engineArgs += @('--from', $From) }
  if ($To) { $engineArgs += @('--to', $To) }
  if ($Models) { $engineArgs += @('--models', $Models) }
} else {
  if ($From) { $engineArgs += @('--from', $From) }
  if ($To) { $engineArgs += @('--to', $To) }
  $engineArgs += @('--scale', "$Scale")
  if ($Models) { $engineArgs += @('--models', $Models) }
}
if ($NoHr) { $engineArgs += '--no-hr' }
$engineArgs += @('--out', $out)

Push-Location $mesServer   # tsx lives here: GMES is TypeScript
try {
  & node --disable-warning=ExperimentalWarning --import tsx $engine @engineArgs
  exit $LASTEXITCODE
} finally { Pop-Location }
