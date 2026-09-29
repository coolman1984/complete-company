<#
.SYNOPSIS
  Copies the ecosystem contracts from their owner (GMES) into the applications that keep a copy, unchanged, and refreshes
  each copy's proof (Mizan: SHA-256 pin file; HR: byte-identical schema files). Run after every change in
  GMES\packages\eco-contracts, then test and commit in each repository.
.PARAMETER Check
  Change nothing; report which copies are out of date (exit code 1 when any is).
#>
[CmdletBinding()]
param([switch]$Check)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$gmes = Join-Path $root 'GMES'
$src = Join-Path $gmes 'packages\eco-contracts\src'
$schemas = Join-Path $gmes 'packages\eco-contracts\schemas'
$mizan = Join-Path $root 'Accounting-sys\apps\server\src\eco-contracts'
$hr = Join-Path $root 'hr-system\eco_schemas'
$stale = @()

function Sha([string]$Path) { (Get-FileHash -Algorithm SHA256 -LiteralPath $Path).Hash.ToLowerInvariant() }

# ---- Mizan: every .ts of src\ (byte for byte) + PIN.json
$commit = (git -C $gmes rev-parse --short HEAD).Trim()
$dirty = @(git -C $gmes status --porcelain -- packages/eco-contracts).Count
if ($dirty -and -not $Check) { throw "GMES has uncommitted changes in packages/eco-contracts: commit them there first, so the pin names a real commit." }
$files = Get-ChildItem -LiteralPath $src -Filter '*.ts' -File | Sort-Object Name
$pinFile = Join-Path $mizan 'PIN.json'
$old = if (Test-Path $pinFile) { Get-Content -LiteralPath $pinFile -Raw | ConvertFrom-Json } else { $null }
$hashes = [ordered]@{}
foreach ($f in $files) {
  $hashes[$f.Name] = Sha $f.FullName
  $dest = Join-Path $mizan $f.Name
  if (-not (Test-Path $dest) -or (Sha $dest) -ne $hashes[$f.Name]) { $stale += "Mizan: $($f.Name)"; if (-not $Check) { Copy-Item -LiteralPath $f.FullName -Destination $dest -Force } }
}
if (Test-Path $mizan) {
  foreach ($extra in (Get-ChildItem -LiteralPath $mizan -Filter '*.ts' -File | Where-Object { -not $hashes.Contains($_.Name) })) {
    $stale += "Mizan: $($extra.Name) no longer exists in GMES"; if (-not $Check) { Remove-Item -LiteralPath $extra.FullName -Force }
  }
}
if (-not $Check) {
  $pin = [ordered]@{
    source = [ordered]@{
      repo = 'coolman1984/GMES'; path = 'packages/eco-contracts/src'; baseCommit = $commit; copiedAt = (Get-Date -Format 'yyyy-MM-dd')
      note = "Byte-identical copy of GMES main at $commit. Never edit these files here: copy them again from GMES (scripts\Refresh-Contracts.ps1 in complete-company) and update this pin."
    }
    files = $hashes
  }
  ($pin | ConvertTo-Json -Depth 5) + "`n" | Set-Content -LiteralPath $pinFile -Encoding utf8 -NoNewline
}

# ---- HR: only the schema files HR already holds (it takes a new one when it starts using that contract)
foreach ($f in (Get-ChildItem -LiteralPath $hr -Filter '*.schema.json' -File)) {
  $from = Join-Path $schemas $f.Name
  if (-not (Test-Path $from)) { $stale += "HR: $($f.Name) no longer exists in GMES"; continue }
  if ((Sha $from) -ne (Sha $f.FullName)) { $stale += "HR: $($f.Name)"; if (-not $Check) { Copy-Item -LiteralPath $from -Destination $f.FullName -Force } }
}
$vec = Join-Path $gmes 'packages\eco-contracts\vectors\canonical-v1.json'
$hrVec = Join-Path $hr 'canonical-v1.json'
if ((Test-Path $vec) -and (Test-Path $hrVec) -and (Sha $vec) -ne (Sha $hrVec)) { $stale += 'HR: canonical-v1.json'; if (-not $Check) { Copy-Item -LiteralPath $vec -Destination $hrVec -Force } }

if ($stale) {
  $stale | ForEach-Object { Write-Host "  $($(if ($Check) { 'out of date' } else { 'refreshed' })): $_" }
  if ($Check) { exit 1 }
} else { Write-Host 'All copies match GMES.' -ForegroundColor Green }
