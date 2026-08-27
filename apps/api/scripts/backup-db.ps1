# Fase 8 (D8): respaldo EXTERNO de la base, complementario al point-in-time
# recovery de Neon (ver README.md "Backups y restauración"). Neon PITR
# cubre el 95% de los escenarios reales (borrado accidental, migración
# mala) restaurando en segundos sin este script de por medio; este dump
# cubre el escenario que PITR NO cubre: perder el acceso a la cuenta de
# Neon.
#
# Corre contra DATABASE_URL (endpoint DIRECTO, rol `migrator`) -- nunca
# contra APP_DATABASE_URL (pooled): pg_dump necesita una conexión estable,
# no una que pase por PgBouncer en modo transacción.
#
# Prerequisito: client tools de PostgreSQL instaladas (`pg_dump` en PATH),
# versión >= la del server de Neon (si no, falla con "server version
# mismatch" -- confirmar la versión del server ANTES de instalar).
#
# Uso:
#   cd apps/api
#   .\scripts\backup-db.ps1
#   .\scripts\backup-db.ps1 -OutDir "D:\backups"

param(
    [string]$OutDir = (Join-Path $PSScriptRoot "..\backups")
)

$ErrorActionPreference = "Stop"

$envPath = Join-Path $PSScriptRoot "..\.env"
if (-not (Test-Path $envPath)) {
    Write-Error "No se encontró $envPath -- copiar .env.example y completar DATABASE_URL primero."
    exit 1
}

$databaseUrl = $null
foreach ($line in Get-Content $envPath) {
    if ($line -match '^\s*DATABASE_URL\s*=\s*"?([^"]*)"?\s*$') {
        $databaseUrl = $Matches[1]
    }
}
if (-not $databaseUrl) {
    Write-Error "DATABASE_URL no está definida en $envPath"
    exit 1
}

# libpq (usado por pg_dump) no entiende "schema=", es una extensión propia
# del connection string de Prisma -- sacarla antes de pasarle la URL.
$uriParts = $databaseUrl -split '\?', 2
if ($uriParts.Count -eq 2) {
    $query = ($uriParts[1] -split '&') | Where-Object { $_ -notmatch '^schema=' }
    $databaseUrl = $uriParts[0]
    if ($query.Count -gt 0) {
        $databaseUrl += "?" + ($query -join '&')
    }
}

if (-not (Get-Command pg_dump -ErrorAction SilentlyContinue)) {
    Write-Error "pg_dump no está en PATH. Instalar client tools de PostgreSQL (version >= la del server de Neon) -- ver README.md."
    exit 1
}

New-Item -ItemType Directory -Force -Path $OutDir | Out-Null
$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$outFile = Join-Path $OutDir "callreport-$timestamp.dump"

Write-Host "Volcando la base a $outFile (formato custom, -Fc -- restaurar con pg_restore)..."
& pg_dump -Fc --no-owner --no-privileges -d $databaseUrl -f $outFile

if ($LASTEXITCODE -ne 0) {
    Write-Error "pg_dump terminó con código $LASTEXITCODE"
    exit $LASTEXITCODE
}

$size = (Get-Item $outFile).Length
Write-Host "OK: $outFile ($([math]::Round($size / 1MB, 2)) MB)"
Write-Host ""
Write-Host "Para restaurar contra un branch de Neon vacío:"
Write-Host "  pg_restore --no-owner --no-privileges -d <connection-string-del-branch> $outFile"
