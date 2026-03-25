Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Strava MCP Installer (Windows)" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""

# Step 1: Check Python
$python = $null
foreach ($cmd in @("python", "python3", "py")) {
    try {
        $ver = & $cmd --version 2>&1
        if ($ver -match "Python 3") {
            $python = $cmd
            Write-Host ">> Python gevonden: $ver" -ForegroundColor Green
            break
        }
    } catch {}
}

if (-not $python) {
    Write-Host ">> Python niet gevonden. Installeren via winget..." -ForegroundColor Yellow
    try {
        winget install Python.Python.3.12 --accept-package-agreements --accept-source-agreements
        $env:Path = [System.Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [System.Environment]::GetEnvironmentVariable("Path", "User")
        $python = "python"
        Write-Host ">> Python geinstalleerd. Herstart PowerShell als het niet werkt." -ForegroundColor Green
    } catch {
        Write-Host ">> Kon Python niet automatisch installeren." -ForegroundColor Red
        Write-Host "   Download Python handmatig: https://www.python.org/downloads/" -ForegroundColor Yellow
        Write-Host "   BELANGRIJK: vink 'Add Python to PATH' aan!" -ForegroundColor Yellow
        exit 1
    }
}

# Step 2: Install strava-training-mcp
Write-Host ""
Write-Host ">> Strava MCP installeren..." -ForegroundColor Cyan
& $python -m pip install --upgrade strava-training-mcp 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    & $python -m pip install strava-training-mcp
}
Write-Host ">> Strava MCP geinstalleerd." -ForegroundColor Green

# Step 3: Authenticate with Strava
$configDir = "$env:USERPROFILE\.strava-mcp"
$configFile = "$configDir\config.json"

$needsAuth = $true
if (Test-Path $configFile) {
    try {
        $config = Get-Content $configFile | ConvertFrom-Json
        if ($config.client_id -and $config.client_secret -and $config.access_token -and $config.refresh_token) {
            Write-Host ">> Strava is al gekoppeld." -ForegroundColor Green
            $needsAuth = $false
        }
    } catch {}
}

if ($needsAuth) {
    Write-Host ""
    Write-Host ">> Je hebt een Strava API app nodig." -ForegroundColor Cyan
    Write-Host "   Maak er een aan op: https://www.strava.com/settings/api" -ForegroundColor Yellow
    Write-Host ""
    Write-Host "   Vul daar in:" -ForegroundColor Yellow
    Write-Host "     Website: http://localhost" -ForegroundColor Yellow
    Write-Host "     Authorization Callback Domain: localhost" -ForegroundColor Yellow
    Write-Host ""

    $clientId = Read-Host "   Client ID"
    $clientSecret = Read-Host "   Client Secret"

    if (-not $clientId -or -not $clientSecret) {
        Write-Host ">> Client ID en Client Secret zijn vereist. Afgebroken." -ForegroundColor Red
        exit 1
    }

    # Save credentials
    New-Item -ItemType Directory -Force -Path $configDir | Out-Null
    $json = @{
        client_id = $clientId
        client_secret = $clientSecret
    } | ConvertTo-Json
    Set-Content -Path $configFile -Value $json

    Write-Host ""
    Write-Host ">> Browser wordt geopend voor Strava autorisatie..." -ForegroundColor Cyan
    & $python -m strava_mcp.server --auth
}

# Step 4: Configure Claude Desktop
Write-Host ""
Write-Host ">> Claude Desktop configureren..." -ForegroundColor Cyan

$claudeDir = "$env:APPDATA\Claude"
$claudeConfig = "$claudeDir\claude_desktop_config.json"

# Find strava-training-mcp executable
$mcpPath = $null
$scripts = & $python -c "import sysconfig; print(sysconfig.get_path('scripts'))" 2>&1
if (Test-Path "$scripts\strava-training-mcp.exe") {
    $mcpPath = "$scripts\strava-training-mcp.exe"
} else {
    # Try common locations
    foreach ($p in @(
        "$env:USERPROFILE\AppData\Local\Programs\Python\Python312\Scripts\strava-training-mcp.exe",
        "$env:USERPROFILE\AppData\Local\Programs\Python\Python311\Scripts\strava-training-mcp.exe",
        "$env:USERPROFILE\AppData\Local\Programs\Python\Python310\Scripts\strava-training-mcp.exe"
    )) {
        if (Test-Path $p) { $mcpPath = $p; break }
    }
}

if (-not $mcpPath) {
    $mcpPath = "strava-training-mcp"
    Write-Host "   Let op: kon het exacte pad niet vinden. Gebruik 'strava-training-mcp' als commando." -ForegroundColor Yellow
}

New-Item -ItemType Directory -Force -Path $claudeDir | Out-Null

if (Test-Path $claudeConfig) {
    try {
        $existing = Get-Content $claudeConfig -Raw | ConvertFrom-Json
        if (-not $existing.mcpServers) {
            $existing | Add-Member -NotePropertyName "mcpServers" -NotePropertyValue @{}
        }
        $existing.mcpServers | Add-Member -NotePropertyName "strava" -NotePropertyValue @{
            command = $mcpPath
            args = @()
        } -Force
        $existing | ConvertTo-Json -Depth 5 | Set-Content $claudeConfig
        Write-Host "   Strava toegevoegd aan Claude Desktop config." -ForegroundColor Green
    } catch {
        Write-Host "   Kon bestaande config niet updaten: $_" -ForegroundColor Red
    }
} else {
    @{
        mcpServers = @{
            strava = @{
                command = $mcpPath
                args = @()
            }
        }
    } | ConvertTo-Json -Depth 5 | Set-Content $claudeConfig
    Write-Host "   Claude Desktop config aangemaakt." -ForegroundColor Green
}

Write-Host ""
Write-Host "==================================" -ForegroundColor Cyan
Write-Host "  Installatie voltooid!" -ForegroundColor Cyan
Write-Host "==================================" -ForegroundColor Cyan
Write-Host ""
Write-Host "Herstart Claude Desktop en vraag bijvoorbeeld:" -ForegroundColor White
Write-Host '  "Wat waren mijn laatste 5 ritten?"' -ForegroundColor Yellow
Write-Host '  "Hoe ziet mijn trainingsbelasting eruit?"' -ForegroundColor Yellow
Write-Host ""
