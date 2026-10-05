# Myrox: contexto del proyecto

Myrox es una empresa de diseño, ingeniería e impresión 3D. Marcas (`MARCAS` en `app_v19.py`):
`myrox_lab`, `myrox_print`, `myrox_works`, `myrox_automation`, `mw3d`.

Usuarios de la app: **Christian** (rol `master`), **Santi** y **Belén**.

## Qué hay en este repo

| Archivo | Qué es |
|---|---|
| `app_v19.py` | Backend único en FastAPI: analizador de piezas 3D, presupuestos, proyectos, clientes, stock, facturas, contabilidad, usuarios y el módulo "Mi Piso". SQLite en `/opt/print3d/data.db` y config en `/opt/print3d/config.json` |
| `procesar_facturas_emitidas.py` | Procesa las facturas **emitidas** (ingresos) que llegan a Nextcloud |
| `run.sh` | Lanzador por cron del procesador de facturas **recibidas** (`procesar_facturas.py`) |
| `logo_myrox_*.png` | Logos de cada marca |

Las versiones antiguas (`app.py`, `app_v11`…`app_v18`, `Contabilidad.jsx`) se borraron. La vigente es `app_v19.py`.

**Viven solo en el servidor (no están en el repo):** `procesar_facturas.py` (facturas recibidas),
`run_emitidas.sh`, `.env` y el frontend. Si hay que tocarlos, pedir que se peguen o se suban.

## Servidor (host `MW3D`)

- Ruta de despliegue: `/opt/print3d/` (facturas en `/opt/print3d/facturas/`, con `venv/` y `.env`).
- Nextcloud en Docker (contenedor `nextcloud`, `https://localhost:8083`, público en `cloud.myrox.es`).
- Contenedor `gluetun` (VPN). Al reiniciar Nextcloud se paró y hubo que volver a arrancarlo.
- Los scripts de facturas se lanzan por cron **cada 2 minutos**. Los logs están en
  `/opt/print3d/facturas/log.txt` (recibidas) y `log_emitidas.txt` (emitidas).
- La extracción de datos de las facturas usa Claude Code en local (`claude -p --allowedTools Read`).

## Flujo de facturas emitidas

1. El usuario deja el PDF en `/FacturasEmitidas/Entrada/` en Nextcloud. Esa carpeta es la única que se crea a mano.
2. El script extrae cliente, número, fecha, vencimiento e importe, y llama a `POST /facturas-emitidas/importar`.
3. Mueve el archivo a `Clasificadas/T{n}-{año}/`. Si ya existía, a `Duplicada/T{n}-{año}/`, y si falla, a `Error/`.
   El trimestre se calcula **con la fecha de la factura**, no con la de procesado. Las carpetas se crean solas con `MKCOL`.

## Permisos

- Módulos restringidos por usuario (`usuarios.modulos_restringidos`). En el backend se protegen con `Depends(_requerir_modulo(...))`,
  no basta con ocultar el botón en el frontend.
- "Mi Piso" (alquiler por habitaciones de Christian) es privado: está restringido para todos menos `christian`.
- Lo acordado sobre visibilidad entre socios es que **ambos ven todo y cada uno edita lo suyo**. Se pidió montarlo "todo de una vez".
  Hay que comprobar si llegó a desplegarse.

## Pendientes

- **Incidente Nextcloud (28-sep-2026):** 5 workers con 85-93 min de CPU acumulada dejaron Nextcloud lento.
  Se resolvió con `docker restart nextcloud`. Falta investigar qué hacían esos workers. La hipótesis es que no sea
  la tanda normal de peticiones WebDAV de los cron, sino algo atascado desde hace días.
  Si se repite, revisar el log de Nextcloud en el momento exacto en que pase **antes** de reiniciar.
- Ninguna llamada `requests` de `procesar_facturas_emitidas.py` tiene `timeout`. Si Nextcloud se cuelga, el script
  se queda esperando indefinidamente y el candado `flock` deja saltar todas las pasadas siguientes sin avisar.

## Convenciones

- Todo en español: código, comentarios y mensajes.
- Migraciones de una sola vez mediante `_migracion_pendiente` / `_marcar_migracion_hecha` en `init_db()`.
- No escribir contraseñas ni tokens en este archivo.
