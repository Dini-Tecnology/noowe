# Redireciona android/.gradle para fora do Desktop (evita bloqueio OneDrive/Defender no Windows).
param(
    [Parameter(ValueFromRemainingArguments = $true)]
    [string[]]$ExpoArgs
)

$ErrorActionPreference = "Stop"

$ProjectRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$AndroidDir = Join-Path $ProjectRoot "android"
$CacheDir = Join-Path $env:USERPROFILE ".gradle-project-cache\okinawa-restaurant"
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

$LocalExpo = Join-Path $ProjectRoot "node_modules\.bin\expo.cmd"
if (-not (Test-Path $LocalExpo)) {
    $LocalExpo = Join-Path $ProjectRoot "node_modules\.bin\expo"
}
if (-not (Test-Path $LocalExpo)) {
    throw "Expo CLI local nao encontrado em node_modules/.bin/expo. Rode pnpm install neste app."
}

# O cache de autolinking usa apenas o hash do package.json. Se o virtual store
# do pnpm mudar, ele pode continuar apontando para diretorios Android antigos.
$AutolinkingDir = Join-Path $AndroidDir "build\generated\autolinking"
$AutolinkingFile = Join-Path $AutolinkingDir "autolinking.json"
if (Test-Path $AutolinkingFile) {
    try {
        $Autolinking = Get-Content -Raw $AutolinkingFile | ConvertFrom-Json
        $HasMissingAndroidSource = $false

        foreach ($Dependency in $Autolinking.dependencies.PSObject.Properties) {
            $SourceDir = $Dependency.Value.platforms.android.sourceDir
            if ($SourceDir -and -not (Test-Path $SourceDir)) {
                $HasMissingAndroidSource = $true
                break
            }
        }

        if ($HasMissingAndroidSource) {
            Remove-Item -Recurse -Force $AutolinkingDir
        }
    } catch {
        # Um cache incompleto/corrompido tambem deve ser regenerado pelo Gradle.
        Remove-Item -Recurse -Force $AutolinkingDir -ErrorAction SilentlyContinue
    }
}

# O Gradle pode restaurar do build cache um classes.jar do Expo criado por uma
# instalacao anterior do pnpm. Nesse caso o fonte atual possui o wrapper, mas o
# app recebe um jar sem ReactActivityDelegateWrapper e a compilacao Kotlin falha.
$ExpoClassesJar = Join-Path $ProjectRoot "node_modules\expo\android\build\intermediates\compile_library_classes_jar\debug\bundleLibCompileToJarDebug\classes.jar"

function Test-ExpoActivityWrapper {
    if (-not (Test-Path $ExpoClassesJar)) { return $false }

    Add-Type -AssemblyName System.IO.Compression.FileSystem
    $Archive = [IO.Compression.ZipFile]::OpenRead($ExpoClassesJar)
    try {
        return $null -ne $Archive.GetEntry("expo/modules/ReactActivityDelegateWrapper.class")
    } finally {
        $Archive.Dispose()
    }
}

if (-not (Test-ExpoActivityWrapper)) {
    Write-Host "Regenerando artefato Android do Expo sem usar o build cache..."
    Push-Location $AndroidDir
    try {
        & .\gradlew.bat :expo:clean :expo:bundleLibCompileToJarDebug --no-build-cache --rerun-tasks
        if ($LASTEXITCODE -ne 0) {
            throw "Nao foi possivel regenerar o artefato Android do Expo."
        }
    } finally {
        Pop-Location
    }

    if (-not (Test-ExpoActivityWrapper)) {
        throw "O artefato Android do Expo foi gerado sem ReactActivityDelegateWrapper."
    }
}

Push-Location $ProjectRoot
try {
    # Usa o Expo local (evita o expo-cli global deprecated).
    if ($ExpoArgs.Count -gt 0) {
        & $LocalExpo run:android @ExpoArgs
    } else {
        & $LocalExpo run:android
    }
    exit $LASTEXITCODE
} finally {
    Pop-Location
}
