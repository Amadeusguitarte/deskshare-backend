$ErrorActionPreference = "Stop"

$7za = ".\node_modules\7zip-bin\win\x64\7za.exe"
$sfxUrl = "https://github.com/develar/7zip-bin/raw/master/win/x64/7zS.sfx"
$sfxPath = ".\7zS.sfx"
$payload = ".\payload.7z"
$output = ".\DeskShareSetup.exe"
$finalDest = "..\backend\public\downloads\DeskShareSetup.exe"

# Start
Write-Host "1. Using Local SFX Module..."
if (Test-Path "lzma_sdk\bin\7zSD.sfx") {
    Copy-Item "lzma_sdk\bin\7zSD.sfx" $sfxPath -Force
    Write-Host "   Copied from lzma_sdk."
}
elseif (Test-Path "installer.sfx") {
    Copy-Item "installer.sfx" $sfxPath -Force
    Write-Host "   Using existing installer.sfx"
}
else {
    Write-Error "No local SFX module found!"
}

Write-Host "2. Cleaning old artifacts..."
if (Test-Path $payload) { Remove-Item $payload }
if (Test-Path $output) { Remove-Item $output }

Write-Host "3. Compressing Application Payload..."
# Check if app folder exists
if (-not (Test-Path ".\dist-packager\app")) {
    Write-Error "Error: dist-packager\app does not exist. Did you rename it?"
}
# Compress contents of 'app' so they are root in 7z
& $7za a $payload ".\dist-packager\app\*" -mx5

Write-Host "4. Creating SFX Installer..."
cmd /c "copy /b 7zS.sfx + config.txt + payload.7z DeskShareSetup.exe"

Write-Host "5. Moving to Backend..."
Move-Item $output $finalDest -Force

Write-Host "SUCCESS: DeskShareSetup.exe created and moved!"
