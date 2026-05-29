param(
  [switch]$SkipPrebuild,
  [switch]$SkipInstall
)

$ErrorActionPreference = 'Stop'
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$projectRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
Set-Location $projectRoot

# Prefer local Node 20 (portable) for React Native 0.74 build compatibility.
$localNode20Dir = Join-Path $projectRoot 'tools\node20\node-v20.20.2-win-x64'
if (Test-Path (Join-Path $localNode20Dir 'node.exe')) {
  $env:Path = "$localNode20Dir;$env:Path"
  $env:NODE_BINARY = (Join-Path $localNode20Dir 'node.exe')
}

Write-Host '=== OrionTV One-Click APK Build ===' -ForegroundColor Cyan
Write-Host "Project: $projectRoot"

function Require-Command {
  param([string]$Name)
  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Missing required command: $Name"
  }
}

Require-Command node

# Ensure Java is available for Gradle (auto-detect JDK on Windows if PATH is stale).
if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  $candidateJdks = @(
    'C:\Program Files\Eclipse Adoptium',
    'C:\Program Files\Java',
    'C:\Program Files\Microsoft\jdk'
  )
  $detectedJavaHome = $null
  foreach ($base in $candidateJdks) {
    if (Test-Path $base) {
      $jdkDir = Get-ChildItem -Path $base -Directory -ErrorAction SilentlyContinue |
        Where-Object { Test-Path (Join-Path $_.FullName 'bin\java.exe') } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1
      if ($jdkDir) {
        $detectedJavaHome = $jdkDir.FullName
        break
      }
    }
  }

  if ($detectedJavaHome) {
    Write-Host "Java not in PATH, using detected JDK: $detectedJavaHome" -ForegroundColor Yellow
    $env:JAVA_HOME = $detectedJavaHome
    $env:Path = "$detectedJavaHome\bin;$env:Path"
  }
}

if (-not (Get-Command java -ErrorAction SilentlyContinue)) {
  throw 'Java is not available. Install JDK 17 and ensure JAVA_HOME/PATH are configured.'
}

$yarnCmd = $null
if (Get-Command yarn -ErrorAction SilentlyContinue) {
  $yarnCmd = 'yarn'
} elseif (Get-Command corepack -ErrorAction SilentlyContinue) {
  Write-Host 'yarn not found, enabling via corepack...' -ForegroundColor Yellow
  corepack enable | Out-Null
  if (Get-Command yarn -ErrorAction SilentlyContinue) {
    $yarnCmd = 'yarn'
  }
}

if (-not $yarnCmd) {
  throw 'yarn is not available. Please install Node.js with Corepack enabled or install yarn globally.'
}

if (-not $SkipInstall -and -not (Test-Path (Join-Path $projectRoot 'node_modules'))) {
  Write-Host 'Installing dependencies...' -ForegroundColor Yellow
  & $yarnCmd install
  if ($LASTEXITCODE -ne 0) { throw 'Dependency installation failed.' }
}

if (-not $SkipPrebuild) {
  Write-Host 'Running Expo prebuild for Android TV...' -ForegroundColor Yellow
  $env:EXPO_TV = '1'
  $env:EXPO_USE_METRO_WORKSPACE_ROOT = '1'
  $androidDir = Join-Path $projectRoot 'android'
  if (Test-Path $androidDir) {
    & $yarnCmd expo prebuild
  } else {
    & $yarnCmd expo prebuild --clean
  }
  if ($LASTEXITCODE -ne 0) {
    Write-Host 'prebuild failed, retrying with --clean (or without --clean if locked)...' -ForegroundColor Yellow
    & $yarnCmd expo prebuild --clean
    if ($LASTEXITCODE -ne 0) {
      Write-Host 'prebuild --clean failed, retrying without --clean (often caused by Windows file lock)...' -ForegroundColor Yellow
      & $yarnCmd expo prebuild
    }
    if ($LASTEXITCODE -ne 0) { throw 'expo prebuild failed.' }
  }

  $settingsGradle = Join-Path $projectRoot 'android\settings.gradle'
  if (Test-Path $settingsGradle) {
    $settingsText = Get-Content -Raw -Path $settingsGradle
    if ($settingsText -notmatch 'maven.aliyun.com/repository/gradle-plugin') {
      $settingsText = $settingsText -replace "pluginManagement\s*\{", @"
pluginManagement {
  repositories {
    maven { url 'https://maven.aliyun.com/repository/gradle-plugin' }
    maven { url 'https://maven.aliyun.com/repository/public' }
    google()
    mavenCentral()
    gradlePluginPortal()
  }
"@
    }
    if ($settingsText -notmatch 'RepositoriesMode\.PREFER_SETTINGS') {
      $settingsText = $settingsText -replace "dependencyResolutionManagement\s*\{", @"
dependencyResolutionManagement {
  repositoriesMode.set(RepositoriesMode.PREFER_SETTINGS)
  repositories {
    maven { url 'https://maven.aliyun.com/repository/google' }
    maven { url 'https://maven.aliyun.com/repository/public' }
    maven { url 'https://maven.aliyun.com/repository/central' }
    google()
    mavenCentral()
  }
"@
    }
    [System.IO.File]::WriteAllText((Resolve-Path $settingsGradle), $settingsText, $utf8NoBom)
  }

  $gradleProps = Join-Path $projectRoot 'android\gradle.properties'
  if (Test-Path $gradleProps) {
    $props = Get-Content -Raw -Path $gradleProps
    if ($props -match '(?m)^org\.gradle\.jvmargs=') {
      $props = [regex]::Replace($props, '(?m)^org\.gradle\.jvmargs=.*$', 'org.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8')
    } else {
      $props += "`r`norg.gradle.jvmargs=-Xmx4096m -XX:MaxMetaspaceSize=1024m -Dfile.encoding=UTF-8"
    }
    if ($props -notmatch '(?m)^org\.gradle\.daemon=true$') { $props += "`r`norg.gradle.daemon=true" }
    if ($props -notmatch '(?m)^org\.gradle\.parallel=true$') { $props += "`r`norg.gradle.parallel=true" }
    if ($props -notmatch '(?m)^org\.gradle\.caching=true$') { $props += "`r`norg.gradle.caching=true" }
    [System.IO.File]::WriteAllText((Resolve-Path $gradleProps), $props, $utf8NoBom)
  }

  $xmlDir = Join-Path $projectRoot 'xml'
  $androidAppSrc = Join-Path $projectRoot 'android\app\src'
  if ((Test-Path $xmlDir) -and (Test-Path $androidAppSrc)) {
    Write-Host 'Copying xml overrides into android/app/src...' -ForegroundColor Yellow
    Copy-Item -Path (Join-Path $xmlDir '*') -Destination $androidAppSrc -Recurse -Force
  }

  $sdkPath = Join-Path $env:LOCALAPPDATA 'Android\Sdk'
  if (-not (Test-Path $sdkPath)) {
    $sdkPath = 'C:\Users\DYM\AppData\Local\Android\Sdk'
  }
  if (Test-Path $sdkPath) {
    $env:ANDROID_HOME = $sdkPath
    $env:ANDROID_SDK_ROOT = $sdkPath
    $localProps = "sdk.dir=$($sdkPath.Replace('\','\\'))"
    [System.IO.File]::WriteAllText((Join-Path $projectRoot 'android\local.properties'), $localProps, $utf8NoBom)
  }

  $appGradle = Join-Path $projectRoot 'android\app\build.gradle'
  if (Test-Path $appGradle) {
    $appGradleText = Get-Content -Raw -Path $appGradle
    if ($appGradleText -notmatch "disable 'Instantiatable'") {
      $appGradleText = $appGradleText -replace "android \{", "android {`r`n    lint {`r`n        disable 'Instantiatable'`r`n    }"
      [System.IO.File]::WriteAllText((Resolve-Path $appGradle), $appGradleText, $utf8NoBom)
    }
  }
}

$gradleWrapper = Join-Path $projectRoot 'android\gradlew.bat'
if (-not (Test-Path $gradleWrapper)) {
  throw 'Gradle wrapper not found. Ensure prebuild succeeded and android/ directory exists.'
}

Write-Host 'Building release APK (assembleRelease)...' -ForegroundColor Yellow
Push-Location (Join-Path $projectRoot 'android')
& .\gradlew.bat assembleRelease
$gradleExit = $LASTEXITCODE
Pop-Location
if ($gradleExit -ne 0) { throw 'Gradle build failed.' }

$apkPath = Join-Path $projectRoot 'android\app\build\outputs\apk\release\app-release.apk'
if (-not (Test-Path $apkPath)) {
  throw "Build finished but APK not found at: $apkPath"
}

$distDir = Join-Path $projectRoot 'dist\apk'
if (-not (Test-Path $distDir)) {
  New-Item -ItemType Directory -Path $distDir | Out-Null
}

$timestamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$targetApk = Join-Path $distDir ("OrionTV-$timestamp-release.apk")
Copy-Item -Path $apkPath -Destination $targetApk -Force

Write-Host ''
Write-Host 'Build succeeded.' -ForegroundColor Green
Write-Host "APK: $targetApk" -ForegroundColor Green
