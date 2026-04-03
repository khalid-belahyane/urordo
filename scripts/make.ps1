# ============================================================================
# urordo - Production Build and Installer Script
# Usage:
#   .\scripts\make.ps1                  # Debug build
#   .\scripts\make.ps1 -Production      # Release build (NSIS + MSI installers)
#   .\scripts\make.ps1 -Clean           # Wipe dist + target bundles before building
#   .\scripts\make.ps1 -Production -Version "0.2.0"
# ============================================================================

param(
    [switch]$Clean = $false,
    [switch]$Production = $false,
    [string]$Version = ""
)

$ErrorActionPreference = "Stop"
$Root = Join-Path $PSScriptRoot ".."

function Step($Message) { Write-Host "`n>> $Message" -ForegroundColor Cyan }
function Ok($Message) { Write-Host "   $Message" -ForegroundColor Green }
function Fail($Message) { Write-Host "   ERROR: $Message" -ForegroundColor Red; exit 1 }

function Require-Tool($CommandName) {
    $tool = Get-Command $CommandName -ErrorAction SilentlyContinue
    if (-not $tool) {
        Fail "'$CommandName' not found in PATH. Install it and try again."
    }
    Ok "$CommandName found - $($tool.Source)"
}

Step "Validating environment"
Require-Tool "node"
Require-Tool "npm.cmd"
Require-Tool "npx.cmd"
Require-Tool "cargo"
Require-Tool "rustc"

Step "Reading version"
$confPath = Join-Path $Root "src-tauri\tauri.conf.json"
$conf = Get-Content $confPath -Raw | ConvertFrom-Json

if ($Version) {
    Ok "Overriding version to $Version"
    $conf.version = $Version
    $conf | ConvertTo-Json -Depth 20 | Set-Content $confPath -Encoding UTF8

    $pkgPath = Join-Path $Root "package.json"
    $pkg = Get-Content $pkgPath -Raw | ConvertFrom-Json
    $pkg.version = $Version
    $pkg | ConvertTo-Json -Depth 10 | Set-Content $pkgPath -Encoding UTF8

    $cargoPath = Join-Path $Root "src-tauri\Cargo.toml"
    $cargoContent = Get-Content $cargoPath -Raw
    $cargoContent = $cargoContent -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$Version`""
    Set-Content $cargoPath $cargoContent -Encoding UTF8

    Ok "Version synced to $Version across all manifests"
} else {
    Ok "Building version $($conf.version) (from tauri.conf.json)"
}

if ($Clean) {
    Step "Cleaning previous build artifacts"
    $dirs = @(
        (Join-Path $Root "dist"),
        (Join-Path $Root "src-tauri\target\release\bundle"),
        (Join-Path $Root "src-tauri\target\debug\bundle")
    )

    foreach ($dir in $dirs) {
        if (Test-Path $dir) {
            try {
                Remove-Item -LiteralPath $dir -Recurse -Force -ErrorAction Stop
                Ok "Removed $dir"
            } catch {
                Write-Host "   Skipped cleaning $dir because it is locked by another process." -ForegroundColor Yellow
            }
        }
    }
}

Push-Location $Root
try {
    Step "Installing npm dependencies"
    if (Test-Path (Join-Path $Root "package-lock.json")) {
        & npm.cmd ci
        if ($LASTEXITCODE -ne 0) { Fail "npm ci failed" }
        Ok "Dependencies installed with npm ci"
    } else {
        & npm.cmd install
        if ($LASTEXITCODE -ne 0) { Fail "npm install failed" }
        Ok "Dependencies installed with npm install"
    }

    if ($Production) {
        Step "Building release installers (NSIS + MSI)"
        & npx.cmd tauri build
    } else {
        Step "Building debug binary"
        & npx.cmd tauri build --debug
    }
    if ($LASTEXITCODE -ne 0) { Fail "Tauri build failed - check output above" }

    Step "Build complete"
    $profile = if ($Production) { "release" } else { "debug" }
    $bundleRoot = Join-Path $Root "src-tauri\target\$profile\bundle"

    if (Test-Path $bundleRoot) {
        $installers = Get-ChildItem -Recurse $bundleRoot -Include "*.exe", "*.msi" | Sort-Object LastWriteTime -Descending
        if ($installers.Count -gt 0) {
            Ok "Installers produced:"
            foreach ($installer in $installers) {
                $size = [math]::Round($installer.Length / 1MB, 1)
                Ok "  $($installer.FullName) ($size MB)"
            }
        } else {
            Ok "Bundle directory exists but no installer files were found yet."
        }
    } else {
        Write-Host "   Bundle directory not found at $bundleRoot" -ForegroundColor Yellow
    }
}
finally {
    Pop-Location
}

Write-Host "`nurordo v$($conf.version) build finished.`n" -ForegroundColor Cyan
