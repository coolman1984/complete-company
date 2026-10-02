# Reads apps.json (the one list of the package's applications, also read by the portal) and resolves each
# application's folder, port and launcher for the real or the demonstration installation.

$script:PackageRoot = Split-Path -Parent $PSScriptRoot          # ...\complete-company
$script:AppsRoot = Split-Path -Parent $script:PackageRoot       # ...\Complete Company (the four clones sit here)

function Get-PackageApps {
  param([switch]$Demo)
  $list = (Get-Content -LiteralPath (Join-Path $script:PackageRoot 'apps.json') -Raw -Encoding utf8 | ConvertFrom-Json).apps
  foreach ($a in $list) {
    $m = $(if ($Demo) { $a.demo } else { $a.real })
    [pscustomobject]@{
      Key = $a.key; Name = $a.name; Folder = Join-Path $script:AppsRoot $a.folder; Health = $a.health
      Port = [int]$m.port; Launcher = $m.launcher; Arguments = @($m.arguments)
    }
  }
}

function Test-PortOpen {
  param([int]$Port)
  $client = [System.Net.Sockets.TcpClient]::new()
  try { return $client.ConnectAsync('127.0.0.1', $Port).Wait(400) -and $client.Connected }
  catch { return $false }
  finally { $client.Dispose() }
}

function Test-PackagePortal {
  param([int]$Port, [bool]$Demo)
  try {
    $identity = Invoke-RestMethod "http://127.0.0.1:$Port/api/identity" -TimeoutSec 3
    return $identity.application -eq 'complete-company' -and $identity.demo -eq $Demo
  } catch { return $false }
}

function Open-PackageChrome {
  param([string]$Url)
  $helpers = @('d:\WORK\Software Development\GitHub\AI CREW\Mandatory To Use Skills\windows-chrome-launcher\scripts\open_chrome.py', "$env:USERPROFILE\.codex\skills\windows-chrome-launcher\scripts\open_chrome.py")
  $helper = $helpers | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
  if (-not $helper) { throw 'The required Chrome launcher helper was not found. The portal URL is printed above.' }
  & python $helper $Url
  if ($LASTEXITCODE -ne 0) { throw 'The Chrome launcher failed. The portal URL is printed above.' }
}
