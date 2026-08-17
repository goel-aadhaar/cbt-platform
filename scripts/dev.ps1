#Requires -Version 5.1
<#
.SYNOPSIS
    Frees the ports DRSK CBT needs, then starts the API and the web app.

.DESCRIPTION
    Two failure modes have cost real debugging time on this project, and this
    script exists to make both impossible:

      1. A stale listener holds a port. Next.js silently moves to the next free
         port when 3000 is taken, so every request from the browser 404s against
         something that is not the API. The symptom looks like a broken app, not
         a busy port.

      2. The web app and the API disagree about where the API lives. This script
         reads NEXT_PUBLIC_API_URL out of apps/web/.env.local and refuses to
         start if its port is not the port the API is about to bind.

    Ports are read from the env files, not hardcoded, so changing PORT in
    apps/api/.env is enough to move everything.

.PARAMETER WebPort
    Port for Next.js. Default 3000.

.PARAMETER Watch
    Run the API through `nest start --watch` instead of a compiled build.
    Faster to iterate on, but the watcher has been seen to compile without ever
    binding, so the default is the compiled path.

.PARAMETER SkipBuild
    Reuse the existing apps/api/dist without rebuilding.

.PARAMETER KeepCache
    Keep apps/web/.next even when a running dev server had to be killed.
    Killing `next dev` mid-compile can leave that cache corrupt, which shows up
    as valid routes 404ing while "/" still works, so it is cleared by default.

.PARAMETER FreeOnly
    Free the ports and exit without starting anything.

.EXAMPLE
    pnpm dev

.EXAMPLE
    .\scripts\dev.ps1 -Watch

.EXAMPLE
    .\scripts\dev.ps1 -FreeOnly
#>
[CmdletBinding()]
param(
    [int]$WebPort = 3000,
    [switch]$Watch,
    [switch]$SkipBuild,
    [switch]$KeepCache,
    [switch]$FreeOnly
)

$ErrorActionPreference = 'Stop'

$RepoRoot = Split-Path -Parent $PSScriptRoot
$ApiDir = Join-Path $RepoRoot 'apps\api'
$WebDir = Join-Path $RepoRoot 'apps\web'

function Write-Step { param([string]$Message) Write-Host "==> $Message" -ForegroundColor Cyan }
function Write-Ok { param([string]$Message) Write-Host "    $Message" -ForegroundColor Green }
function Write-Warn { param([string]$Message) Write-Host "    $Message" -ForegroundColor Yellow }
function Write-Fail { param([string]$Message) Write-Host "    $Message" -ForegroundColor Red }

<#
    Read a KEY=VALUE out of a dotenv file. Deliberately minimal: it only has to
    understand the handful of keys this script cares about.
#>
function Get-EnvValue {
    param([string]$Path, [string]$Key)

    if (-not (Test-Path $Path)) { return $null }
    foreach ($line in (Get-Content $Path)) {
        $trimmed = $line.Trim()
        if ($trimmed -match '^\s*#') { continue }
        if ($trimmed -match "^$([regex]::Escape($Key))\s*=\s*(.*)$") {
            return $matches[1].Trim().Trim('"').Trim("'")
        }
    }
    return $null
}

<#
    Every PID listening on a TCP port. Falls back to netstat where the
    NetTCPConnection cmdlets are unavailable.
#>
function Get-ListenerPids {
    param([int]$Port)

    $found = @()
    try {
        $conns = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction Stop
        foreach ($c in $conns) { $found += $c.OwningProcess }
    } catch [System.Management.Automation.CommandNotFoundException] {
        foreach ($line in (netstat -ano -p tcp)) {
            if ($line -match "LISTENING" -and $line -match ":$Port\s") {
                $parts = ($line -split '\s+') | Where-Object { $_ -ne '' }
                $found += [int]$parts[-1]
            }
        }
    } catch {
        # No listener on that port: Get-NetTCPConnection throws rather than
        # returning empty, which is not an error condition here.
    }
    return $found | Sort-Object -Unique | Where-Object { $_ -gt 4 }
}

<#
    Stop whatever is listening on $Port. Returns $true if something was killed,
    so the caller can decide whether cached build output is now suspect.
#>
function Clear-Port {
    param([int]$Port, [string]$Label)

    $pids = Get-ListenerPids -Port $Port
    if (-not $pids -or $pids.Count -eq 0) {
        Write-Ok "$Port ($Label) is free"
        return $false
    }

    $killedAny = $false
    foreach ($procId in $pids) {
        $name = 'unknown'
        try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch { }

        Write-Warn "$Port ($Label) held by $name (PID $procId) - stopping it"
        try {
            Stop-Process -Id $procId -Force -ErrorAction Stop
            $killedAny = $true
        } catch {
            Write-Fail "could not stop PID $procId - $($_.Exception.Message)"
            Write-Fail "if it is not yours, rerun with a different port"
        }
    }

    # Windows does not always release the socket the instant the owner dies.
    for ($i = 0; $i -lt 20; $i++) {
        $still = Get-ListenerPids -Port $Port
        if (-not $still -or $still.Count -eq 0) {
            Write-Ok "$Port ($Label) freed"
            return $killedAny
        }
        Start-Sleep -Milliseconds 250
    }
    throw "Port $Port is still held after stopping its owner. Reboot or pick another port."
}

<# Poll a URL until it answers, so we never report a server that never bound. #>
function Wait-ForHttp {
    param([string]$Url, [string]$Label, [int]$TimeoutSeconds = 120)

    $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
    while ((Get-Date) -lt $deadline) {
        try {
            Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5 | Out-Null
            return $true
        } catch {
            # A 3xx/4xx still proves something is listening and routing.
            if ($null -ne $_.Exception.Response) { return $true }
        }
        Start-Sleep -Milliseconds 500
    }
    Write-Fail "$Label did not answer at $Url within ${TimeoutSeconds}s"
    return $false
}

<#
Confirm the server that answered is actually THIS project.

"Port is free" is not the same as "port is ours". Another project on this
machine binds the same ports, and when it wins the race you get a fully
healthy-looking stack serving somebody else's app — every request 404s or,
worse, silently succeeds against the wrong backend. Checking identity rather
than mere reachability turns a confusing debugging session into one clear
line.
#>
function Assert-IsThisApp {
    param([string]$Url, [string]$Label, [string]$MustContain)

    try {
        $body = (Invoke-WebRequest -Uri $Url -UseBasicParsing -TimeoutSec 5).Content
    } catch {
        # Identity is a best-effort check; reachability was already proven.
        return $true
    }
    if ($body -notmatch [regex]::Escape($MustContain)) {
        Write-Fail "$Label on this port is NOT this project (expected to find '$MustContain')."
        Write-Host "    Something else is already bound there. Find and stop it:" -ForegroundColor Yellow
        Write-Host "      Get-Process -Id (Get-NetTCPConnection -LocalPort <port> -State Listen).OwningProcess" -ForegroundColor Yellow
        return $false
    }
    return $true
}

# --------------------------------------------------------------------------- #
# Configuration                                                               #
# --------------------------------------------------------------------------- #

Write-Step 'Reading configuration'

$apiEnv = Join-Path $ApiDir '.env'
if (-not (Test-Path $apiEnv)) {
    Write-Fail "apps/api/.env is missing. Copy apps/api/.env.example and fill in DATABASE_URL."
    exit 1
}

$apiPortRaw = Get-EnvValue -Path $apiEnv -Key 'PORT'
if ([string]::IsNullOrWhiteSpace($apiPortRaw)) { $apiPort = 4000 } else { $apiPort = [int]$apiPortRaw }

$webEnv = Join-Path $WebDir '.env.local'
if (-not (Test-Path $webEnv)) {
    Write-Warn "apps/web/.env.local is missing - creating it from .env.example"
    Copy-Item (Join-Path $WebDir '.env.example') $webEnv
}

# The collision that has bitten this project twice: the browser calls a port
# that is not the API, and every response is someone else's 404.
$apiUrl = Get-EnvValue -Path $webEnv -Key 'NEXT_PUBLIC_API_URL'
if ($apiUrl -match '^https?://[^:/]+:(\d+)') {
    $configuredPort = [int]$matches[1]
    if ($configuredPort -ne $apiPort) {
        Write-Fail "apps/web/.env.local points NEXT_PUBLIC_API_URL at port $configuredPort,"
        Write-Fail "but the API binds $apiPort (apps/api/.env). The browser would call the wrong server."
        Write-Fail "Fix one of them so they agree, then rerun."
        exit 1
    }
    if ($configuredPort -eq $WebPort) {
        Write-Fail "The API and Next.js are both configured for port $WebPort. Move one of them."
        exit 1
    }
}

Write-Ok "API   : $apiPort"
Write-Ok "Web   : $WebPort"
Write-Ok "Client: $apiUrl"

# --------------------------------------------------------------------------- #
# Free the ports                                                              #
# --------------------------------------------------------------------------- #

Write-Step 'Freeing ports'
Clear-Port -Port $apiPort -Label 'api' | Out-Null
$killedWeb = Clear-Port -Port $WebPort -Label 'web'

if ($killedWeb -and -not $KeepCache) {
    $nextCache = Join-Path $WebDir '.next'
    if (Test-Path $nextCache) {
        # A dev server killed mid-compile leaves this half-written, and the
        # result is routes that 404 while the app otherwise looks fine.
        Write-Warn 'clearing apps/web/.next (a running dev server was interrupted)'
        Remove-Item -Recurse -Force $nextCache -ErrorAction SilentlyContinue
    }
}

if ($FreeOnly) {
    Write-Step 'Ports are free (-FreeOnly, nothing started)'
    exit 0
}

# --------------------------------------------------------------------------- #
# Start the API                                                               #
# --------------------------------------------------------------------------- #

if ($Watch) {
    $apiCommand = 'pnpm start:dev'
} else {
    if (-not $SkipBuild) {
        Write-Step 'Building the API'
        Push-Location $ApiDir
        try {
            pnpm build
            if ($LASTEXITCODE -ne 0) { throw 'API build failed - see the output above.' }
        } finally {
            Pop-Location
        }
        Write-Ok 'built'
    }

    $dist = Join-Path $ApiDir 'dist\main.js'
    if (-not (Test-Path $dist)) {
        Write-Fail "apps/api/dist/main.js is missing. Rerun without -SkipBuild."
        exit 1
    }
    # Running the compiled output directly: the Nest watcher has been observed
    # to compile successfully and never bind, which is hard to tell from a slow
    # start. This path either binds or exits.
    $apiCommand = 'node --env-file=.env dist/main.js'
}

Write-Step "Starting the API ($apiCommand)"
Start-Process -FilePath 'powershell' -WorkingDirectory $ApiDir -ArgumentList @(
    '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'DRSK api :$apiPort'; $apiCommand"
) | Out-Null

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$apiPort/api/health" -Label 'API')) {
    Write-Fail 'The API window is still open - read it for the reason (DATABASE_URL is the usual one).'
    exit 1
}
# /api/health is this app's own route; a foreign server answering here would
# not produce Terminus's status envelope.
if (-not (Assert-IsThisApp -Url "http://127.0.0.1:$apiPort/api/health" -Label 'API' -MustContain '"status"')) {
    exit 1
}
Write-Ok "healthy on $apiPort"

# --------------------------------------------------------------------------- #
# Start the web app                                                           #
# --------------------------------------------------------------------------- #

Write-Step 'Starting the web app'
# --port is passed explicitly: left to itself Next silently picks another port
# when this one is busy, which is the whole failure this script prevents.
Start-Process -FilePath 'powershell' -WorkingDirectory $WebDir -ArgumentList @(
    '-NoExit', '-Command',
    "`$Host.UI.RawUI.WindowTitle = 'DRSK web :$WebPort'; pnpm dev --port $WebPort"
) | Out-Null

if (-not (Wait-ForHttp -Url "http://127.0.0.1:$WebPort" -Label 'Web' -TimeoutSeconds 180)) {
    Write-Fail 'The web window is still open - read it for the reason.'
    exit 1
}
# The <title> from apps/web/src/app/layout.tsx — present on every page of this
# app and on nobody else's.
if (-not (Assert-IsThisApp -Url "http://127.0.0.1:$WebPort/login" -Label 'Web' -MustContain 'DRSK Assessment Portal')) {
    exit 1
}
Write-Ok "serving on $WebPort"

Write-Host ''
Write-Step 'Running'
Write-Host "    Student portal  http://localhost:$WebPort/login"
Write-Host "    Admin console   http://localhost:$WebPort/admin/login"
Write-Host "    API             http://localhost:$apiPort/api/v1"
Write-Host "    API docs        http://localhost:$apiPort/api/docs"
Write-Host ''
Write-Host "    Each server runs in its own window. Close them, or rerun this" -ForegroundColor DarkGray
Write-Host "    script (it frees the ports first), to stop them." -ForegroundColor DarkGray
