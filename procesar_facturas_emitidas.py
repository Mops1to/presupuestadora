"""
procesar_facturas_emitidas.py
───────────────────────────────
Hermano de procesar_facturas.py, pero para el otro sentido: las facturas
que EMITE Myrox a sus clientes (ingresos), no las que recibe. Mucho más
simple — aquí no hay que clasificar nada, todo es ingreso — solo hace
falta sacar cliente, número, fecha, vencimiento e importe.

Vigila /FacturasEmitidas/Entrada en Nextcloud, y por cada factura nueva:
  1. La descarga
  2. Llama a Claude Code (claude -p, en local) para extraer los datos
  3. Llama a POST /facturas-emitidas/importar en el backend
  4. La mueve a Clasificadas/T{n}-{año} (según su propia fecha) — o a
     Error/ si algo falla, o a Duplicada/ si ya existía (mismo número +
     importe que otra ya registrada)

Variables de entorno (las mismas que ya usa procesar_facturas.py — se
puede compartir el mismo .env sin problema):
  NEXTCLOUD_URL, NEXTCLOUD_USER, NEXTCLOUD_APP_PASSWORD, MYROX_API_URL
  USAR_CLAUDE_CODE, CLAUDE_CODE_BIN, CLAUDE_CODE_OAUTH_TOKEN, CLAUDE_CODE_TIMEOUT
"""
import os
import re
import json
import subprocess
import tempfile
import unicodedata
import requests
from datetime import datetime
from urllib.parse import quote, unquote
import guardia_claude

NEXTCLOUD_URL = os.environ["NEXTCLOUD_URL"].rstrip("/")
NEXTCLOUD_USER = os.environ["NEXTCLOUD_USER"]
NEXTCLOUD_APP_PASSWORD = os.environ["NEXTCLOUD_APP_PASSWORD"]
MYROX_API_URL = os.environ["MYROX_API_URL"].rstrip("/")
CLAUDE_CODE_BIN = os.environ.get("CLAUDE_CODE_BIN", "/usr/bin/claude")
CLAUDE_CODE_TIMEOUT = int(os.environ.get("CLAUDE_CODE_TIMEOUT", "120"))
# Ninguna llamada a Nextcloud o al backend puede quedarse esperando para siempre:
# si se cuelga, el candado del cron se quedaría cogido y nadie se enteraría.
TIMEOUT_HTTP = int(os.environ.get("TIMEOUT_HTTP", "60"))
# Sin fijar modelo, `claude -p` usa el que tenga la cuenta por defecto (puede ser
# el más caro). Para extraer datos de una factura basta uno intermedio.
CLAUDE_CODE_MODEL = os.environ.get("CLAUDE_CODE_MODEL", "sonnet")
CLAUDE_CODE_MAX_TURNS = os.environ.get("CLAUDE_CODE_MAX_TURNS", "6")
# Solo estos tipos de archivo se consideran facturas. Cualquier otra cosa que caiga en
# Entrada (un .md, un .txt, un .docx...) se aparta a Error/ SIN llamar a Claude.
EXTENSIONES_VALIDAS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}

WEBDAV_BASE = f"{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}"
AUTH = (NEXTCLOUD_USER, NEXTCLOUD_APP_PASSWORD)

CARPETA_ENTRADA = "/FacturasEmitidas/Entrada"
CARPETA_CLASIFICADAS = "/FacturasEmitidas/Clasificadas"
CARPETA_ERROR = "/FacturasEmitidas/Error"
CARPETA_DUPLICADA = "/FacturasEmitidas/Duplicada"

PROMPT_EXTRACCION_EMITIDA = """Eres un asistente que extrae datos de una factura que ha EMITIDO Myrox
(un taller de impresión 3D/fabricación) a uno de sus propios clientes —
es una factura de VENTA, no de compra.

Devuelve ÚNICAMENTE un JSON válido (sin texto adicional, sin markdown) con esta forma exacta:

{
  "cliente_nombre": "... (el destinatario de la factura, NO Myrox)",
  "numero": "... o null si no aparece",
  "fecha": "AAAA-MM-DD",
  "fecha_vencimiento": "AAAA-MM-DD, o null si no aparece un vencimiento explícito",
  "importe": 0.0
}

Reglas:
- "importe" es el TOTAL de la factura (con IVA si lo lleva), en número, sin símbolo de moneda.
- Si no puedes leer algún campo con confianza, ponlo a null en vez de inventarlo.
"""

def _limpiar_y_parsear_json(texto):
    texto = texto.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(texto)

def _slugify(texto, max_len=40):
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"[^a-zA-Z0-9]+", "-", texto).strip("-")
    return texto[:max_len]

def calcular_trimestre(fecha_str):
    fecha = None
    if fecha_str:
        try:
            fecha = datetime.strptime(fecha_str[:10], "%Y-%m-%d")
        except ValueError:
            fecha = None
    if not fecha:
        fecha = datetime.now()
    trimestre = (fecha.month - 1) // 3 + 1
    return f"T{trimestre}-{fecha.year}"

def generar_nombre_archivo(datos, extension, indice_fallback):
    cliente = _slugify(datos.get("cliente_nombre")) or "ClienteDesconocido"
    numero = _slugify(datos.get("numero"))
    if not numero:
        fecha = (datos.get("fecha") or "sinfecha").replace("-", "")
        numero = f"{fecha}-{indice_fallback}"
    return f"{cliente}_{numero}{extension}"

def listar_facturas_pendientes():
    url = f"{WEBDAV_BASE}{CARPETA_ENTRADA}"
    headers = {"Depth": "1", "Content-Type": "application/xml"}
    body = """<?xml version="1.0"?>
    <d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontenttype/></d:prop></d:propfind>"""
    r = requests.request("PROPFIND", url, auth=AUTH, headers=headers, data=body, timeout=TIMEOUT_HTTP)
    r.raise_for_status()
    import xml.etree.ElementTree as ET
    ns = {"d": "DAV:"}
    root = ET.fromstring(r.content)
    archivos = []
    for resp in root.findall("d:response", ns):
        href = resp.find("d:href", ns).text
        is_dir = resp.find(".//d:resourcetype/d:collection", ns) is not None
        if is_dir:
            continue
        nombre = href.rstrip("/").split("/")[-1]
        nombre = unquote(nombre)
        archivos.append(nombre)
    return archivos

def descargar_archivo(nombre):
    url = f"{WEBDAV_BASE}{CARPETA_ENTRADA}/{quote(nombre)}"
    r = requests.get(url, auth=AUTH, timeout=TIMEOUT_HTTP)
    r.raise_for_status()
    return r.content

def _asegurar_carpetas(ruta_carpeta):
    partes = ruta_carpeta.strip("/").split("/")
    actual = ""
    for parte in partes:
        actual += f"/{parte}"
        requests.request("MKCOL", f"{WEBDAV_BASE}{actual}", auth=AUTH, timeout=TIMEOUT_HTTP)

def mover_archivo(nombre, carpeta_destino, nuevo_nombre=None):
    origen = f"{WEBDAV_BASE}{CARPETA_ENTRADA}/{quote(nombre)}"
    _asegurar_carpetas(carpeta_destino)
    destino = f"{WEBDAV_BASE}{carpeta_destino}/{quote(nuevo_nombre or nombre)}"
    r = requests.request("MOVE", origen, auth=AUTH, headers={"Destination": destino, "Overwrite": "T"}, timeout=TIMEOUT_HTTP)
    r.raise_for_status()

def extraer_datos_factura_emitida(contenido_bytes, nombre_archivo):
    # Freno de seguridad: tope diario y límite de intentos por archivo.
    guardia_claude.autorizar_llamada(nombre_archivo, contenido_bytes)

    extension = os.path.splitext(nombre_archivo)[1].lower() or ".pdf"
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
        f.write(contenido_bytes)
        ruta_temporal = f.name
    try:
        prompt_completo = f"{PROMPT_EXTRACCION_EMITIDA}\n\nLee el archivo {ruta_temporal} y responde solo con el JSON, según las instrucciones anteriores."
        resultado = subprocess.run(
            [CLAUDE_CODE_BIN, "-p", prompt_completo, "--allowedTools", "Read",
             "--model", CLAUDE_CODE_MODEL, "--max-turns", CLAUDE_CODE_MAX_TURNS],
            capture_output=True, text=True, timeout=CLAUDE_CODE_TIMEOUT,
        )
        if resultado.returncode != 0 or not resultado.stdout.strip():
            # Si Claude dice que se ha acabado el uso, se bloquea todo hasta mañana
            guardia_claude.revisar_salida_claude(resultado.stdout + resultado.stderr)
        if resultado.returncode != 0:
            raise RuntimeError(f"{CLAUDE_CODE_BIN} -p terminó con error (código {resultado.returncode}): {resultado.stderr.strip()}")
        if not resultado.stdout.strip():
            raise ValueError(f"claude -p no devolvió ninguna salida (stderr: {resultado.stderr.strip() or '(vacío)'})")
        try:
            return _limpiar_y_parsear_json(resultado.stdout)
        except json.JSONDecodeError as e:
            raise ValueError(f"La salida de claude -p no era JSON válido ({e}). Salida completa: {resultado.stdout[:500]!r}")
    finally:
        os.unlink(ruta_temporal)

def importar_factura_emitida(datos, archivo):
    r = requests.post(f"{MYROX_API_URL}/facturas-emitidas/importar", json={**datos, "archivo": archivo}, timeout=TIMEOUT_HTTP)
    r.raise_for_status()
    return r.json()

def procesar_uno(nombre_archivo):
    contenido = descargar_archivo(nombre_archivo)
    extension = os.path.splitext(nombre_archivo)[1].lower() or ".pdf"
    datos = extraer_datos_factura_emitida(contenido, nombre_archivo)

    trimestre = calcular_trimestre(datos.get("fecha"))
    nombre_final = generar_nombre_archivo(datos, extension, indice_fallback=1)
    ruta_relativa = f"{trimestre}/{nombre_final}"

    resultado = importar_factura_emitida(datos, ruta_relativa)

    if resultado.get("status") == "duplicada":
        print(f"  DUPLICADA: ya existe como factura_id={resultado['factura_id']} — se archiva aparte, sin reprocesar")
        mover_archivo(nombre_archivo, f"{CARPETA_DUPLICADA}/{trimestre}", nuevo_nombre=nombre_final)
        return

    print(f"  -> factura_id={resultado['factura_id']} cliente={datos.get('cliente_nombre')} importe={datos.get('importe')}€ ({trimestre}/{nombre_final})")
    mover_archivo(nombre_archivo, f"{CARPETA_CLASIFICADAS}/{trimestre}", nuevo_nombre=nombre_final)

def main():
    pendientes = listar_facturas_pendientes()
    if not pendientes:
        print("No hay facturas emitidas nuevas.")
        return
    if guardia_claude.tope_alcanzado():
        print(f"Tope diario de llamadas a Claude alcanzado — {len(pendientes)} archivo(s) esperan en Entrada hasta mañana.")
        return
    for nombre in pendientes:
        print(f"Procesando: {nombre}")
        extension = os.path.splitext(nombre)[1].lower()
        if extension not in EXTENSIONES_VALIDAS:
            print(f"  OMITIDO: no es una factura (extensión '{extension or 'ninguna'}') — se aparta a Error/ sin llamar a Claude")
            try:
                mover_archivo(nombre, CARPETA_ERROR)
            except Exception as e2:
                print(f"  No se pudo mover a Error/: {e2}")
            continue
        try:
            procesar_uno(nombre)
            guardia_claude.registrar_exito(nombre)
        except guardia_claude.YaProcesado as e:
            print(f"  YA PROCESADO: {e} — se aparta a Duplicada/ sin gastar nada")
            try:
                mover_archivo(nombre, CARPETA_DUPLICADA)
            except Exception as e2:
                print(f"  No se pudo mover a Duplicada/: {e2}")
        except guardia_claude.TopeDiario as e:
            print(f"  PARADO: {e}. El resto queda en Entrada, sin tocar, hasta mañana.")
            break
        except Exception as e:
            print(f"  ERROR con {nombre}: {e}")
            try:
                mover_archivo(nombre, CARPETA_ERROR)
            except Exception as e2:
                print(f"  Y además no se pudo mover a Error/: {e2}")

if __name__ == "__main__":
    main()
