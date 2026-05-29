param(
  [switch]$SkipPrebuild,
  [switch]$SkipInstall
)

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$logDir = Join-Path $projectRoot 'dist\logs'
if (-not (Test-Path $logDir)) { New-Item -ItemType Directory -Path $logDir | Out-Null }
$ts = Get-Date -Format 'yyyyMMdd-HHmmss'
$logFile = Join-Path $logDir ("build-apk-$ts.log")

$buildScript = Join-Path $projectRoot 'scripts\build-apk.ps1'
$argLine = "-NoProfile -ExecutionPolicy Bypass -File `"$buildScript`""
if ($SkipPrebuild) { $argLine += ' -SkipPrebuild' }
if ($SkipInstall) { $argLine += ' -SkipInstall' }
$cmdArgs = "/c powershell $argLine > `"$logFile`" 2>&1"

$proc = Start-Process -FilePath 'cmd.exe' -ArgumentList $cmdArgs -WindowStyle Hidden -PassThru

Write-Host "Build started in background. PID: $($proc.Id)"
Write-Host "Log file: $logFile"
