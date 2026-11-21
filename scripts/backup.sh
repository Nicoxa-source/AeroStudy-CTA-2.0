#!/usr/bin/env bash
# Genera un respaldo .zip del proyecto (sin .git ni node_modules). Uso: scripts/backup.sh [etiqueta]
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p ../backups
OUT="../backups/AeroStudy_CTA_2.0_${1:-etapa}_$(date +%Y%m%d_%H%M).zip"
zip -qr "$OUT" . -x '.git/*' 'node_modules/*' 'android/build/*'
echo "$OUT"
