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
