# Builds signed release APK + AAB and copies them to mobile/dist.

$ErrorActionPreference = "Stop"
$mobile = Split-Path $PSScriptRoot -Parent
$android = Join-Path $mobile "android"

$jdk21 = Join-Path $env:LOCALAPPDATA "Java\jdk-21"
$sdk = Join-Path $env:LOCALAPPDATA "Android\Sdk"

if (-not (Test-Path (Join-Path $jdk21 "bin\java.exe"))) {
  throw "JDK 21 missing at $jdk21 — see docs/android-stores.md"
}
if (-not (Test-Path $sdk)) {
  throw "Android SDK missing at $sdk — see docs/android-stores.md"
}
if (-not (Test-Path (Join-Path $android "gradlew.bat"))) {
  throw "Android project missing at $android — run npx cap add android"
}

$env:JAVA_HOME = $jdk21
$env:ANDROID_HOME = $sdk
$env:ANDROID_SDK_ROOT = $sdk
$env:Path = "$jdk21\bin;$sdk\platform-tools;$env:Path"

Set-Location $android
& .\gradlew.bat assembleRelease bundleRelease --no-daemon
if ($LASTEXITCODE -ne 0) { throw "Gradle build failed ($LASTEXITCODE)" }

$dist = Join-Path $mobile "dist"
New-Item -ItemType Directory -Force -Path $dist | Out-Null

$gradle = Get-Content (Join-Path $android "app\build.gradle") -Raw
if ($gradle -match 'versionName\s+"([^"]+)"') {
  $ver = $Matches[1]
} else {
  $ver = "release"
}

Copy-Item (Join-Path $android "app\build\outputs\apk\release\app-release.apk") (Join-Path $dist "leseno-$ver.apk") -Force
Copy-Item (Join-Path $android "app\build\outputs\bundle\release\app-release.aab") (Join-Path $dist "leseno-$ver.aab") -Force

Write-Host "OK:"
Get-ChildItem $dist | ForEach-Object {
  Write-Host " - $($_.FullName) ($([math]::Round($_.Length / 1MB, 2)) MB)"
}
