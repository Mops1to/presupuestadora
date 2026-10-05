# Myrox: contexto del proyecto

Myrox es una empresa de diseño, ingeniería e impresión 3D. Marcas (`MARCAS` en `app_v19.py`):
`myrox_lab`, `myrox_print`, `myrox_works`, `myrox_automation`, `mw3d`.

Usuarios de la app: **Christian** (rol `master`), **Santi** y **Belén**.

## Qué hay en este repo

| Archivo | Qué es |
|---|---|
| `app_v19.py` | Backend único en FastAPI: analizador de piezas 3D, presupuestos, proyectos, clientes, stock, facturas, contabilidad, ventas menores, usuarios y "Mi Piso". SQLite en `/opt/print3d/data.db` y config en `/opt/print3d/config.json` |
| `procesar_facturas.py` | Procesa las facturas **recibidas** (proveedores) que llegan a Nextcloud |
| `procesar_facturas_emitidas.py` | Procesa las facturas **emitidas** (ingresos) |
| `guardia_claude.py` | Freno de gasto compartido por los dos procesadores: tope diario de llamadas a `claude -p` e intentos por archivo |
| `run_emitidas.sh` | Lanzador por cron de las emitidas. Comparte el candado `/tmp/procesar_facturas.lock` con `run.sh` (recibidas, que solo está en el servidor) |
| `*.jsx` y carpetas por módulo | Frontend React + Tailwind. En el servidor van en `src/modules/<modulo>/` y `src/core/`, pero aquí están subidos en plano |

Faltan en el repo: `run.sh`, `.env`, `src/core/` (`AuthContext`, `Login`, `api`), `package.json` y la configuración del build.

`Contabilidad.jsx` y `Usuarios.jsx` están **duplicados**, en la raíz y en su carpeta, con versiones distintas. Hay que confirmar cuál es la buena.

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
- **Gasto descontrolado de Claude (5-oct-2026):** un proceso estuvo llamando a `claude -p` sin parar y agotó el uso semanal.
  Con el guardia anterior, un archivo que se procesaba bien pero seguía en Entrada volvía a llamar a Claude en cada pasada
  (hasta 60 al día, 420 a la semana). Se ha endurecido `guardia_claude.py`: nunca se repite un contenido ya procesado,
  hay tope diario (20) y semanal (80), se para solo si Claude avisa de límite de uso y existe el interruptor `PARAR`.
  Falta desplegarlo y confirmar la causa con los logs del servidor.

## Convenciones

- Todo en español: código, comentarios y mensajes.
- Migraciones de una sola vez mediante `_migracion_pendiente` / `_marcar_migracion_hecha` en `init_db()`.
- No escribir contraseñas ni tokens en este archivo.
