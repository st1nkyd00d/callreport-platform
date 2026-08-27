#!/usr/bin/env bash
# Fase 8 (D8): variante POSIX de backup-db.ps1 -- mismo propósito, mismas
# reglas (ver ese archivo y README.md "Backups y restauración" para el
# detalle completo: por qué DATABASE_URL directo y no el pooled, por qué
# esto es un respaldo EXTERNO complementario a Neon PITR, no el primario).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
API_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="${1:-$API_DIR/backups}"
ENV_FILE="$API_DIR/.env"

if [[ ! -f "$ENV_FILE" ]]; then
  echo "No se encontró $ENV_FILE -- copiar .env.example y completar DATABASE_URL primero." >&2
  exit 1
fi

DATABASE_URL="$(grep -E '^DATABASE_URL=' "$ENV_FILE" | head -n1 | sed -E 's/^DATABASE_URL="?([^"]*)"?$/\1/')"
if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL no está definida en $ENV_FILE" >&2
  exit 1
fi

# libpq (usado por pg_dump) no entiende "schema=", es una extensión propia
# del connection string de Prisma -- sacarla antes de pasarle la URL.
DATABASE_URL="$(echo "$DATABASE_URL" | sed -E 's/([?&])schema=[^&]*&?/\1/; s/[?&]$//')"

if ! command -v pg_dump >/dev/null 2>&1; then
  echo "pg_dump no está en PATH. Instalar client tools de PostgreSQL (version >= la del server de Neon) -- ver README.md." >&2
  exit 1
fi

mkdir -p "$OUT_DIR"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
OUT_FILE="$OUT_DIR/callreport-$TIMESTAMP.dump"

echo "Volcando la base a $OUT_FILE (formato custom, -Fc -- restaurar con pg_restore)..."
pg_dump -Fc --no-owner --no-privileges -d "$DATABASE_URL" -f "$OUT_FILE"

SIZE_MB="$(du -m "$OUT_FILE" | cut -f1)"
echo "OK: $OUT_FILE (~${SIZE_MB} MB)"
echo
echo "Para restaurar contra un branch de Neon vacío:"
echo "  pg_restore --no-owner --no-privileges -d <connection-string-del-branch> $OUT_FILE"
