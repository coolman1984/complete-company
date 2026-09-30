<#
.SYNOPSIS
  End-to-end smoke test of the package: starts FRESH copies of Mizan, GMES and HR-System (when Python 3.10+ is found)
  in a temporary folder on spare ports, sets them up under one company, pairs them with the portal's pairing code, then
  follows one order or, with -Chain, the whole chain (scenario\chain\run.mjs). Everything is stopped and the temporary
  folder removed at the end. Real and demo data are never touched.
.PARAMETER Chain
  After pairing, run the whole chain instead of the short order check.
.PARAMETER Keep
  Keep the temporary folder (for looking at the databases after a failure).
#>
[CmdletBinding()]
param([switch]$Keep, [switch]$Chain)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\lib-stack.ps1"
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cc-pair-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$stack = $null

try {
  $stack = New-Stack -Root $root -DataRoot $tmp -Ports @{ mizan = 4831; gmes = 4731; hr = 8831 } -Password 'Smoke-2026!' -LogDir $tmp
  Invoke-Pairing -Root $root -InputJson $stack.Json
  $node = (Get-Command node).Source
  if ($Chain) {
    $env:CHAIN_PAIRED = '1'; $env:CHAIN_INPUT = $stack.Json
    & $node (Join-Path $root 'complete-company\scenario\chain\run.mjs')
    if ($LASTEXITCODE -ne 0) { throw 'the chain did not pass' }
    Write-Host 'CHAIN SCENARIO: PASSED' -ForegroundColor Green
  } else {
    $mz = $stack.Urls.mizan; $gm = $stack.Urls.gmes
    $ms = New-Object Microsoft.PowerShell.Commands.WebRequestSession; $gs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Call-Api POST "$mz/api/auth/login" @{ username = 'admin'; password = 'Smoke-2026!' } $ms | Out-Null
    Call-Api POST "$gm/api/auth/login" @{ login = 'admin'; password = 'Smoke-2026!' } $gs | Out-Null
    $customer = (Call-Api POST "$mz/api/parties" @{ kind = 'customer'; name = 'B.TECH' } $ms).id
    $tv = (Call-Api POST "$mz/api/items" @{ sku = 'TV55'; nameEn = 'TV 55'; nameAr = 'تلفزيون 55'; kind = 'product'; unit = 'PCS'; salePrice = 1500000; materialType = 'raw'; leadTimeDays = 3 } $ms).id
    Call-Api POST "$mz/api/sales/orders" @{ customerId = $customer; orderDate = (Get-Date).ToString('yyyy-MM-dd'); confirm = $true; lines = @(@{ itemId = $tv; quantity = 12000; requestedDate = (Get-Date).AddDays(20).ToString('yyyy-MM-dd') }) } $ms | Out-Null
    Call-Api POST "$mz/api/eco/sync" $null $ms | Out-Null
    $mirrored = Call-Api GET "$gm/api/sales-orders" $null $gs
    Check 'the sales order is mirrored in GMES' (@($mirrored).Count -eq 1 -and $mirrored[0].open_qty -eq '12') ($mirrored | ConvertTo-Json -Compress)
    $run = Call-Api POST "$gm/api/pln/runs" $null $gs
    Check 'GMES planning runs' ([bool]$run.code) ''
    $reqs = Call-Api GET "$gm/api/pln/requisitions" $null $gs
    Check 'planning asks to buy the TV (a bought item without a BOM)' (@($reqs).Count -eq 1 -and $reqs[0].qty -eq '12') ($reqs | ConvertTo-Json -Compress -Depth 4)
    $push = Call-Api POST "$gm/api/eco/push" $null $gs
    Check 'GMES pushes to Mizan without errors' (-not ($push.peers | Where-Object { $_.error })) ($push | ConvertTo-Json -Compress)
    $inMizan = Call-Api GET "$mz/api/purchase-requisitions" $null $ms
    Check 'the requisition arrives in Mizan' (@($inMizan).Count -ge 1) ($inMizan | ConvertTo-Json -Compress -Depth 3)
  }
  Write-Host 'PAIRING SMOKE TEST: PASSED' -ForegroundColor Green
}
finally {
  if ($stack) { foreach ($p in $stack.Procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } } }
  Start-Sleep -Milliseconds 500
  if ($Keep) { Write-Host "kept: $tmp" } else { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
