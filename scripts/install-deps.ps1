# Instala dependências de backend, mobile (Expo) e site.
# Uso: .\scripts\install-deps.ps1

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)

function Install-Package {
    param(
        [string]$Name,
        [string]$Path,
        [string[]]$NpmArgs = @("install")
    )

    Write-Host ""
    Write-Host "==> Instalando $Name ($Path)" -ForegroundColor Cyan

    Push-Location (Join-Path $Root $Path)
    try {
        & npm @NpmArgs
        if ($LASTEXITCODE -ne 0) {
            throw "npm falhou em $Path (exit code $LASTEXITCODE)"
        }
        Write-Host "OK: $Name" -ForegroundColor Green
    }
    finally {
        Pop-Location
    }
}

Write-Host "Project Okinawa — instalação de dependências" -ForegroundColor Yellow
Write-Host "Raiz: $Root"

Install-Package -Name "Backend" -Path "platform\backend"
Install-Package -Name "Mobile (Expo)" -Path "platform\mobile"
Install-Package -Name "Site" -Path "site" -NpmArgs @("install", "--legacy-peer-deps")

Write-Host ""
Write-Host "Todas as dependências foram instaladas com sucesso." -ForegroundColor Green
Write-Host ""
Write-Host "Próximos passos:" -ForegroundColor Yellow
Write-Host "  Backend:    cd platform\backend && npm run start:dev"
Write-Host "  Expo client: cd platform\mobile && npm run client"
Write-Host "  Expo restaurant: cd platform\mobile && npm run restaurant"
