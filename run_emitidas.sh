#!/bin/bash
cd /opt/print3d/facturas

# MISMO archivo de candado que run.sh: así los dos procesadores de facturas
# nunca llaman a Claude a la vez (si uno está trabajando, el otro salta esa
# pasada y lo intenta en la siguiente).
exec 201>/tmp/procesar_facturas.lock
flock -n 201 || { echo "Ya hay una ejecución en marcha, salto esta pasada."; exit 0; }

set -a
source .env
set +a
venv/bin/python3 procesar_facturas_emitidas.py >> /opt/print3d/facturas/log_emitidas.txt 2>&1
