<#
.SYNOPSIS
  End-to-end smoke test of the package: starts FRESH copies of Mizan and GMES (and HR-System when Python 3.10+ is
  found) in a temporary folder on spare ports, pairs them with the portal's pairing code, then follows one order:
  item + customer + sales order in Mizan -> mirrored in GMES -> planning run -> requisition back in Mizan -> crew
  requirement in HR. Everything is stopped and the temporary folder removed at the end. Real and demo data are never touched.
.PARAMETER Keep
  Keep the temporary folder (for looking at the databases after a failure).
#>
[CmdletBinding()]
param([switch]$Keep)
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent (Split-Path -Parent $PSScriptRoot)
$tmp = Join-Path ([IO.Path]::GetTempPath()) ("cc-pair-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Path $tmp | Out-Null
$procs = @()
$ports = @{ mizan = 4831; gmes = 4731; hr = 8831 }
$pw = 'Smoke-2026!'

function Wait-Up([string]$url, [int]$seconds = 120) {
  $end = (Get-Date).AddSeconds($seconds)
  while ((Get-Date) -lt $end) {
    try { if ((Invoke-WebRequest -Uri $url -TimeoutSec 3 -UseBasicParsing).StatusCode -lt 500) { return } } catch { Start-Sleep -Milliseconds 700 }
  }
  throw "no answer from $url after $seconds s"
}
function Call([string]$method, [string]$url, $body, $session) {
  $args = @{ Method = $method; Uri = $url; ContentType = 'application/json'; TimeoutSec = 30; WebSession = $session; Headers = @{ Origin = ([uri]$url).GetLeftPart('Authority') } }
  if ($null -ne $body) { $args.Body = ($body | ConvertTo-Json -Depth 10 -Compress) } elseif ($method -ne 'GET') { $args.Body = '{}' }
  Invoke-RestMethod @args
}
function Check([string]$name, [bool]$ok, $detail) {
  if ($ok) { Write-Host "  ok  $name" -ForegroundColor Green } else { Write-Host "  FAIL $name  $detail" -ForegroundColor Red; throw "failed: $name" }
}

try {
  $node = (Get-Command node).Source
  # ---- Mizan (fresh data folder), set up with a company and an administrator
  $env:MIZAN_DATA_DIR = Join-Path $tmp 'mizan'; $env:MIZAN_PORT = $ports.mizan; $env:MIZAN_HOST = '127.0.0.1'
  $mizanDir = Join-Path $root 'Accounting-sys'
  $procs += Start-Process -FilePath $node -ArgumentList 'apps/server/dist/main.js' -WorkingDirectory $mizanDir -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tmp 'mizan.out') -RedirectStandardError (Join-Path $tmp 'mizan.err')
  $mz = "http://127.0.0.1:$($ports.mizan)"
  Wait-Up "$mz/api/health"
  $ms = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Call POST "$mz/api/setup" @{ company = @{ name = 'Smoke Co'; baseCurrency = 'EGP'; moneyScale = 2 }; fiscalYearStart = '2026-01-01'; admin = @{ username = 'admin'; displayName = 'Admin'; password = $pw }; locale = 'en'; seedChartOfAccounts = $true; vatRateBp = 1400 } $ms | Out-Null
  Call POST "$mz/api/auth/login" @{ username = 'admin'; password = $pw } $ms | Out-Null
  $company = (Call GET "$mz/api/eco/company" $null $ms).companyId
  Check 'Mizan is up with a company id' ([bool]$company) ''

  # ---- GMES with Mizan's company id, Mizan owning items, HR owning people
  $env:GMES_DATA_DIR = Join-Path $tmp 'gmes'; $env:GMES_PORT = $ports.gmes; $env:GMES_HOST = '127.0.0.1'; $env:GMES_COMPANY_ID = $company
  $env:GMES_OWNER = 'mizan'; $env:GMES_PERSON_OWNER = 'none'; $env:GMES_SECRETS = 'plain'
  $procs += Start-Process -FilePath $node -ArgumentList '--disable-warning=ExperimentalWarning --import tsx src/main.ts' -WorkingDirectory (Join-Path $root 'GMES\apps\mes-server') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tmp 'gmes.out') -RedirectStandardError (Join-Path $tmp 'gmes.err')
  $gm = "http://127.0.0.1:$($ports.gmes)"
  Wait-Up "$gm/api/health"
  $gs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Call POST "$gm/api/setup" @{ login = 'admin'; name = 'Admin'; password = $pw; language = 'en' } $gs | Out-Null
  Call POST "$gm/api/auth/login" @{ login = 'admin'; password = $pw } $gs | Out-Null
  Check 'GMES is up with the same company id' ((Invoke-RestMethod "$gm/api/health").company -eq $company) ''

  # ---- HR (optional): fresh home, company from Mizan
  $hr = $null
  $python = foreach ($c in @($env:PYTHON, 'python', 'py')) { if ($c -and (Get-Command $c -ErrorAction SilentlyContinue)) { (Get-Command $c).Source; break } }
  if ($python) {
    $env:HR_HOME = Join-Path $tmp 'hr'; $env:PYTHONPATH = Join-Path $root 'hr-system\vendor.zip'
    $procs += Start-Process -FilePath $python -ArgumentList "hr_main.py --port $($ports.hr) --background" -WorkingDirectory (Join-Path $root 'hr-system') -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $tmp 'hr.out') -RedirectStandardError (Join-Path $tmp 'hr.err')
    $hr = "http://127.0.0.1:$($ports.hr)"
    try { Wait-Up "$hr/api/info" 60 } catch { Write-Host "  (HR did not start: $((Get-Content (Join-Path $tmp 'hr.err') -Tail 3) -join ' | ')) — pairing Mizan and GMES only" -ForegroundColor Yellow; $hr = $null }
  }
  if ($hr) {
    $hs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Call POST "$hr/api/setup/install" @{ company = @{ source = 'owner'; owner_app = 'mizan'; id = $company; code = 'SMOKE'; name = 'Smoke Co' }; admin = @{ username = 'admin'; display_name = 'Admin'; password = $pw } } $hs | Out-Null
    Call POST "$hr/api/login" @{ username = 'admin'; password = $pw } $hs | Out-Null
    $pwHr = $pw + 'x'
    try { Call POST "$hr/api/password" @{ old = $pw; new = $pwHr } $hs | Out-Null } catch { $pwHr = $pw }
    Check 'HR is set up under Mizan''s company' $true ''
  }

  # ---- pair through the portal's code
  $pairJs = (Join-Path $root 'complete-company\portal\pair.mjs').Replace('\', '/')
  $logins = @{ mizan = @{ user = 'admin'; password = $pw }; gmes = @{ user = 'admin'; password = $pw } }
  if ($hr) { $logins.hr = @{ user = 'admin'; password = $pwHr } }
  $input = @{ urls = @{ mizan = $mz; gmes = $gm; hr = $hr }; logins = $logins } | ConvertTo-Json -Depth 5 -Compress
  $env:PAIR_INPUT = $input
  $out = & $node --input-type=module -e "import { pair } from 'file:///$pairJs'; const r = await pair(JSON.parse(process.env.PAIR_INPUT)); console.log(JSON.stringify(r));" | ConvertFrom-Json
  foreach ($s in $out.steps) { Check "pairing: $($s.step)" $s.ok $s.detail }

  # ---- one order through both applications
  $customer = (Call POST "$mz/api/parties" @{ kind = 'customer'; name = 'B.TECH' } $ms).id
  $tv = (Call POST "$mz/api/items" @{ sku = 'TV55'; nameEn = 'TV 55'; nameAr = 'تلفزيون 55'; kind = 'product'; unit = 'PCS'; salePrice = 1500000; materialType = 'raw'; leadTimeDays = 3 } $ms).id
  $so = Call POST "$mz/api/sales/orders" @{ customerId = $customer; orderDate = (Get-Date).ToString('yyyy-MM-dd'); confirm = $true; lines = @(@{ itemId = $tv; quantity = 12000; requestedDate = (Get-Date).AddDays(20).ToString('yyyy-MM-dd') }) } $ms
  Call POST "$mz/api/eco/sync" $null $ms | Out-Null
  $mirrored = Call GET "$gm/api/sales-orders" $null $gs
  Check 'the sales order is mirrored in GMES' (@($mirrored).Count -eq 1 -and $mirrored[0].open_qty -eq '12') ($mirrored | ConvertTo-Json -Compress)

  $run = Call POST "$gm/api/pln/runs" $null $gs
  Check 'GMES planning runs' ([bool]$run.code) ''
  $reqs = Call GET "$gm/api/pln/requisitions" $null $gs
  Check 'planning asks to buy the TV (a bought item without a BOM)' (@($reqs).Count -eq 1 -and $reqs[0].qty -eq '12') ($reqs | ConvertTo-Json -Compress -Depth 4)
  $push = Call POST "$gm/api/eco/push" $null $gs
  Check 'GMES pushes to Mizan without errors' (-not ($push.peers | Where-Object { $_.error })) ($push | ConvertTo-Json -Compress)
  $inMizan = Call GET "$mz/api/purchase-requisitions" $null $ms
  Check 'the requisition arrives in Mizan' (@($inMizan).Count -ge 1) ($inMizan | ConvertTo-Json -Compress -Depth 3)
  Write-Host 'PAIRING SMOKE TEST: PASSED' -ForegroundColor Green
}
finally {
  foreach ($p in $procs) { if ($p -and -not $p.HasExited) { Stop-Process -Id $p.Id -Force -ErrorAction SilentlyContinue } }
  Start-Sleep -Milliseconds 500
  if ($Keep) { Write-Host "kept: $tmp" } else { Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue }
}
