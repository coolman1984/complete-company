<#
  Shared by Test-Pairing.ps1 and Start-IntegratedDemo.ps1: starts Mizan, GMES and HR-System on given ports and data
  folders, sets them up under ONE company id (Mizan is the owner), and hands back their addresses and logins.
  Dot-source it:  . "$PSScriptRoot\lib-stack.ps1"
#>

function Wait-Up([string]$Url, [int]$Seconds = 120) {
  $end = (Get-Date).AddSeconds($Seconds)
  while ((Get-Date) -lt $end) {
    try { if ((Invoke-WebRequest -Uri $Url -TimeoutSec 3 -UseBasicParsing).StatusCode -lt 500) { return } } catch { Start-Sleep -Milliseconds 700 }
  }
  throw "no answer from $Url after $Seconds s"
}

function Call-Api([string]$Method, [string]$Url, $Body, $Session) {
  $a = @{ Method = $Method; Uri = $Url; ContentType = 'application/json'; TimeoutSec = 30; WebSession = $Session; Headers = @{ Origin = ([uri]$Url).GetLeftPart('Authority') } }
  if ($null -ne $Body) { $a.Body = ($Body | ConvertTo-Json -Depth 10 -Compress) } elseif ($Method -ne 'GET') { $a.Body = '{}' }
  Invoke-RestMethod @a
}

function Check([string]$Name, [bool]$Ok, $Detail) {
  if ($Ok) { Write-Host "  ok  $Name" -ForegroundColor Green } else { Write-Host "  FAIL $Name  $Detail" -ForegroundColor Red; throw "failed: $Name" }
}

function Find-PythonExe {
  foreach ($c in @($env:PYTHON, 'python', 'py')) {
    if ($c -and (Get-Command $c -ErrorAction SilentlyContinue)) {
      $v = & $c -c 'import sys; print(sys.version_info[0] * 100 + sys.version_info[1])' 2>$null
      if ($LASTEXITCODE -eq 0 -and [int]$v -ge 310) { return (Get-Command $c).Source }
    }
  }
  return $null
}

<#
  Starts the three servers. -Visible: minimised windows that stay after this script ends (the demo); otherwise hidden
  with their output in $LogDir (the test). Returns the started processes.
#>
function Start-StackServers {
  param([string]$Root, [string]$DataRoot, [hashtable]$Ports, [string]$Company, [string]$LogDir, [switch]$Visible, [switch]$SkipHr, [switch]$SkipMizan)
  $node = (Get-Command node).Source
  $procs = @()
  $start = { param($file, $argLine, $dir, $tag)
    $p = @{ FilePath = $file; ArgumentList = $argLine; WorkingDirectory = $dir; PassThru = $true }
    if ($Visible) { $p.WindowStyle = 'Minimized' } else { $p.WindowStyle = 'Hidden'; $p.RedirectStandardOutput = Join-Path $LogDir "$tag.out"; $p.RedirectStandardError = Join-Path $LogDir "$tag.err" }
    Start-Process @p }

  if (-not $SkipMizan) {
    $env:MIZAN_DATA_DIR = Join-Path $DataRoot 'mizan'; $env:MIZAN_PORT = [string]$Ports.mizan; $env:MIZAN_HOST = '127.0.0.1'
    $procs += & $start $node 'apps/server/dist/main.js' (Join-Path $Root 'Accounting-sys') 'mizan'
  }

  if ($Company) {
    $env:GMES_DATA_DIR = Join-Path $DataRoot 'gmes'; $env:GMES_PORT = [string]$Ports.gmes; $env:GMES_HOST = '127.0.0.1'; $env:GMES_COMPANY_ID = $Company
    $env:GMES_OWNER = 'mizan'; $env:GMES_PERSON_OWNER = 'none'; $env:GMES_SECRETS = 'plain'
    $procs += & $start $node '--disable-warning=ExperimentalWarning --import tsx src/main.ts' (Join-Path $Root 'GMES\apps\mes-server') 'gmes'
  }
  if (-not $SkipHr) {
    $python = Find-PythonExe
    if ($python) {
      $env:HR_HOME = Join-Path $DataRoot 'hr'; $env:PYTHONPATH = Join-Path $Root 'hr-system\vendor.zip'
      $procs += & $start $python "hr_main.py --port $($Ports.hr) --background" (Join-Path $Root 'hr-system') 'hr'
    }
  }
  return $procs
}

<#
  Fresh installation: Mizan first (it owns the company id), then GMES and HR under that id. Returns
  @{ Urls; Logins; Company; Procs; Json } where Json is what the pairing code and the chain runner read.
#>
function New-Stack {
  param([string]$Root, [string]$DataRoot, [hashtable]$Ports, [string]$Password, [string]$LogDir, [string]$CompanyName = 'Smoke Co', [string]$CompanyCode = 'SMOKE', [switch]$Visible)
  New-Item -ItemType Directory -Force -Path $DataRoot | Out-Null
  $procs = @(Start-StackServers -Root $Root -DataRoot $DataRoot -Ports $Ports -Company '' -LogDir $LogDir -Visible:$Visible -SkipHr)
  $mz = "http://127.0.0.1:$($Ports.mizan)"
  Wait-Up "$mz/api/health"
  $ms = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Call-Api POST "$mz/api/setup" @{ company = @{ name = $CompanyName; baseCurrency = 'EGP'; moneyScale = 2 }; fiscalYearStart = '2026-01-01'; admin = @{ username = 'admin'; displayName = 'Admin'; password = $Password }; locale = 'en'; seedChartOfAccounts = $true; vatRateBp = 1400 } $ms | Out-Null
  Call-Api POST "$mz/api/auth/login" @{ username = 'admin'; password = $Password } $ms | Out-Null
  $company = (Call-Api GET "$mz/api/eco/company" $null $ms).companyId
  Check 'Mizan is up with a company id' ([bool]$company) ''

  # GMES and HR are started now, with Mizan's company id
  $procs += @(Start-StackServers -Root $Root -DataRoot $DataRoot -Ports $Ports -Company $company -LogDir $LogDir -Visible:$Visible -SkipMizan)
  $gm = "http://127.0.0.1:$($Ports.gmes)"
  Wait-Up "$gm/api/health"
  $gs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  Call-Api POST "$gm/api/setup" @{ login = 'admin'; name = 'Admin'; password = $Password; language = 'en' } $gs | Out-Null
  Call-Api POST "$gm/api/auth/login" @{ login = 'admin'; password = $Password } $gs | Out-Null
  Check 'GMES is up with the same company id' ((Invoke-RestMethod "$gm/api/health").company -eq $company) ''

  $hr = $null; $hrPassword = $Password
  if (Find-PythonExe) {
    $hr = "http://127.0.0.1:$($Ports.hr)"
    try { Wait-Up "$hr/api/info" 60 } catch { Write-Host '  (HR-System did not start; continuing without it)' -ForegroundColor Yellow; $hr = $null }
  }
  if ($hr) {
    $hs = New-Object Microsoft.PowerShell.Commands.WebRequestSession
    Call-Api POST "$hr/api/setup/install" @{ company = @{ source = 'owner'; owner_app = 'mizan'; id = $company; code = $CompanyCode; name = $CompanyName }; admin = @{ username = 'admin'; display_name = 'Admin'; password = $Password } } $hs | Out-Null
    Call-Api POST "$hr/api/login" @{ username = 'admin'; password = $Password } $hs | Out-Null
    # a first sign-in asks for a new password: change it, then back to the shared one when the product allows it
    try {
      Call-Api POST "$hr/api/password" @{ old = $Password; new = $Password + 'x' } $hs | Out-Null; $hrPassword = $Password + 'x'
      Call-Api POST "$hr/api/password" @{ old = $Password + 'x'; new = $Password } $hs | Out-Null; $hrPassword = $Password
    } catch { }
    Check 'HR-System is set up under the same company' $true ''
  }

  $logins = @{ mizan = @{ user = 'admin'; password = $Password }; gmes = @{ user = 'admin'; password = $Password } }
  if ($hr) { $logins.hr = @{ user = 'admin'; password = $hrPassword } }
  return @{ Urls = @{ mizan = $mz; gmes = $gm; hr = $hr }; Logins = $logins; Company = $company; Procs = $procs;
            Json = (@{ urls = @{ mizan = $mz; gmes = $gm; hr = $hr }; logins = $logins } | ConvertTo-Json -Depth 5 -Compress) }
}

function Invoke-Pairing {
  param([string]$Root, [string]$InputJson)
  $node = (Get-Command node).Source
  $pairJs = (Join-Path $Root 'complete-company\portal\pair.mjs').Replace('\', '/')
  $env:PAIR_INPUT = $InputJson
  $out = & $node --input-type=module -e "import { pair } from 'file:///$pairJs'; const r = await pair(JSON.parse(process.env.PAIR_INPUT)); console.log(JSON.stringify(r));" | ConvertFrom-Json
  foreach ($s in $out.steps) { Check "pairing: $($s.step)" $s.ok $s.detail }
}
