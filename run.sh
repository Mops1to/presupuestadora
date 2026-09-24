#!/bin/bash
cd /opt/print3d/facturas

# Candado: si ya hay una ejecución en marcha (una pasada larga con muchas
# facturas puede tardar más que el intervalo del cron), esta simplemente no
# arranca en vez de solaparse con la anterior y competir por la misma sesión
# de Claude Code — que es justo lo que causó la avalancha de errores de hoy.
exec 200>/tmp/procesar_facturas.lock
flock -n 200 || { echo "Ya hay una ejecución en marcha, salto esta pasada."; exit 0; }

set -a
source .env
set +a
venv/bin/python3 procesar_facturas.py >> /opt/print3d/facturas/log.txt 2>&1
