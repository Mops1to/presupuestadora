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

## Servidores

- Nextcloud y Docker están en el host `MW3D`. La app y los scripts de facturas, en el host `Presupuestadora`.
- Ruta de despliegue: `/opt/print3d/` (facturas en `/opt/print3d/facturas/`, con `venv/` y `.env`).
- Nextcloud en Docker (contenedor `nextcloud`, `https://localhost:8083`, público en `cloud.myrox.es`).
- Contenedor `gluetun` (VPN). Al reiniciar Nextcloud se paró y hubo que volver a arrancarlo.
- Los scripts de facturas se lanzan cada 2 minutos desde el crontab de root (`run.sh` y `run_emitidas.sh`). Los logs están en
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
- **Uso semanal de Claude agotado (5-oct-2026):** se sospechó de los scripts de facturas, pero **no fueron ellos**.
  Las llamadas a `claude -p` desde el servidor fueron 86 el 23-sep, 38 el 24-sep y 24 el 1-oct, y ninguna después.
  La semana de uso actual va del 3-oct al 10-oct a las 17:00, y en el servidor no hay ninguna sesión de Claude Code posterior al 3-oct (comprobado con `find`). La pantalla de uso
  marcaba Claude Code 100 % y Chats 0 %, así que el gasto vino de sesiones de Claude Code en la web o en la app de escritorio.
  Aun así se encontró un agujero real en el guardia (un archivo procesado que seguía en Entrada podía repetirse
  hasta 60 veces al día) y se endureció `guardia_claude.py`. Falta desplegarlo; en el servidor sigue la versión del 4-oct.
  Cada llamada de factura pesa unos 260 KB de sesión, que es mucho: conviene revisarlo.
- El cron de root se ha quitado (5-oct). Hay que restaurarlo después de desplegar el guardia nuevo.

## Convenciones

- Todo en español: código, comentarios y mensajes.
- Migraciones de una sola vez mediante `_migracion_pendiente` / `_marcar_migracion_hecha` en `init_db()`.
- No escribir contraseñas ni tokens en este archivo.
