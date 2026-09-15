# Redireciona android/.gradle para fora do Desktop (evita bloqueio OneDrive/Defender no Windows).
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExpoArgs
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $ProjectRoot "android"
$CacheDir = Join-Path $env:USERPROFILE ".gradle-project-cache\noowe"
$GradleDir = Join-Path $AndroidDir ".gradle"

New-Item -ItemType Directory -Force -Path $CacheDir | Out-Null

function Test-ReparsePoint {
    param([string]$Path)
    if (-not (Test-Path $Path)) { return $false }
    return ((Get-Item $Path -Force).Attributes -band [IO.FileAttributes]::ReparsePoint) -ne 0
}

if (Test-Path $GradleDir) {
    if (-not (Test-ReparsePoint $GradleDir)) {
        Push-Location $AndroidDir
        & .\gradlew.bat --stop 2>$null
        Pop-Location
        Remove-Item -Recurse -Force $GradleDir -ErrorAction SilentlyContinue
    }
}

if (-not (Test-Path $GradleDir)) {
    cmd /c "mklink /J `"$GradleDir`" `"$CacheDir`"" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Nao foi possivel criar junction de .gradle para $CacheDir"
    }
}

Push-Location $ProjectRoot
try {
    if ($ExpoArgs.Count -gt 0) {
        & npx expo run:android @ExpoArgs
    } else {
        & npx expo run:android
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
