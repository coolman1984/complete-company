<#
.SYNOPSIS
  Is this installation ready for real data? Asks each running application: answering, demonstration passwords refused,
  one company id, paired, nothing refused or waiting. Add -Backup to make and rehearse a backup in each (the only thing it changes).
.EXAMPLE
  pwsh -File scripts\Check-Ready.ps1 -User admin -Password '...'            # the real ports from apps.json
  pwsh -File scripts\Check-Ready.ps1 -User admin -Password '...' -Backup
#>
param([Parameter(Mandatory)][string]$User, [Parameter(Mandatory)][string]$Password, [switch]$Backup, [switch]$Demo)
$ErrorActionPreference = 'Stop'
. "$PSScriptRoot\apps.ps1"
$apps = @(Get-PackageApps -Demo:$Demo)
$arg = @()
foreach ($a in $apps) { $arg += @("--$($a.Key)", "http://127.0.0.1:$($a.Port)") }
$env:READY_USER = $User; $env:READY_PASSWORD = $Password
if ($Backup) { $arg += '--backup' }
& (Get-Command node).Source (Join-Path $script:PackageRoot 'ready\check.mjs') @arg
exit $LASTEXITCODE
