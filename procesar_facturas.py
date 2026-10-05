"""
procesar_facturas.py
─────────────────────
Vigila una carpeta en Nextcloud (vía WebDAV), y por cada factura nueva (PDF/imagen):
  1. La descarga
  2. La manda a la API de Claude para extraer los datos estructurados
  3. Llama a POST /facturas/importar en tu backend
  4. Mueve el archivo a Clasificadas/T{n}-{año} (según la fecha de la factura,
     no la de procesado) — o a Error/ si algo falla

Pensado para correr como cron cada X minutos en el LXC 102, o en cualquier
máquina con acceso de red a Nextcloud y a tu API.

Variables de entorno necesarias (ponlas en un .env o en el propio cron):
  NEXTCLOUD_URL       -> ej. https://cloud.myrox.es
  NEXTCLOUD_USER      -> tu usuario de Nextcloud
  NEXTCLOUD_APP_PASSWORD -> la "contraseña de aplicación" (no tu contraseña normal)
  MYROX_API_URL       -> ej. https://api.mw3dstudio.com
  ANTHROPIC_API_KEY   -> tu clave de la API de Claude

Variables opcionales, para el aviso por email cuando algo cae en revisión
crítica (si no pones SMTP_PASSWORD, el script funciona igual y solo avisa
por consola):
  SMTP_HOST     -> por defecto smtp.hostinger.com
  SMTP_PORT     -> por defecto 465
  SMTP_USER     -> por defecto administracion@myrox.es
  SMTP_PASSWORD -> sin valor por defecto, obligatoria para que se envíe el email
  EMAIL_FROM    -> por defecto = SMTP_USER
  EMAIL_TO      -> por defecto administracion@myrox.es
"""
import os
import io
import re
import json
import base64
import smtplib
import subprocess
import tempfile
import unicodedata
import requests
from datetime import datetime
from email.mime.text import MIMEText
from urllib.parse import quote, unquote
from pypdf import PdfReader, PdfWriter
import guardia_claude

NEXTCLOUD_URL = os.environ["NEXTCLOUD_URL"].rstrip("/")
NEXTCLOUD_USER = os.environ["NEXTCLOUD_USER"]
NEXTCLOUD_APP_PASSWORD = os.environ["NEXTCLOUD_APP_PASSWORD"]
MYROX_API_URL = os.environ["MYROX_API_URL"].rstrip("/")
ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY")  # ya no es obligatoria si USAR_CLAUDE_CODE=true
USAR_CLAUDE_CODE = os.environ.get("USAR_CLAUDE_CODE", "false").lower() == "true"
CLAUDE_CODE_BIN = os.environ.get("CLAUDE_CODE_BIN", "/usr/bin/claude")
CLAUDE_CODE_TIMEOUT = int(os.environ.get("CLAUDE_CODE_TIMEOUT", "120"))
# Sin fijar modelo, `claude -p` usa el que tenga la cuenta por defecto (puede ser
# el más caro). Para extraer datos de una factura basta uno intermedio.
CLAUDE_CODE_MODEL = os.environ.get("CLAUDE_CODE_MODEL", "sonnet")
CLAUDE_CODE_MAX_TURNS = os.environ.get("CLAUDE_CODE_MAX_TURNS", "6")
# Solo estos tipos de archivo se consideran facturas. Cualquier otra cosa que caiga en
# Entrada (un .md, un .txt, un .docx...) se aparta a Error/ SIN llamar a Claude.
EXTENSIONES_VALIDAS = {".pdf", ".jpg", ".jpeg", ".png", ".webp"}

# Aviso por email cuando una factura cae en revisión crítica en esta pasada.
# Si SMTP_PASSWORD no está definida, el script sigue funcionando igual —
# simplemente se salta el envío y avisa por consola (nunca bloquea el resto).
SMTP_HOST = os.environ.get("SMTP_HOST", "smtp.hostinger.com")
SMTP_PORT = int(os.environ.get("SMTP_PORT", "465"))
SMTP_USER = os.environ.get("SMTP_USER", "administracion@myrox.es")
SMTP_PASSWORD = os.environ.get("SMTP_PASSWORD")
EMAIL_FROM = os.environ.get("EMAIL_FROM", SMTP_USER)
EMAIL_TO = os.environ.get("EMAIL_TO", "administracion@myrox.es")

CARPETA_ENTRADA = "/Facturas/Entrada"
CARPETA_CLASIFICADAS = "/Facturas/Clasificadas"
CARPETA_REVISION = "/Facturas/Revision"
CARPETA_ERROR = "/Facturas/Error"
CARPETA_DUPLICADA = "/Facturas/Duplicada"

WEBDAV_BASE = f"{NEXTCLOUD_URL}/remote.php/dav/files/{NEXTCLOUD_USER}"
AUTH = (NEXTCLOUD_USER, NEXTCLOUD_APP_PASSWORD)

# Proveedores conocidos de gasto fijo -> categoría en costes_fijos.
# Ajusta esta lista según tus proveedores reales (nombre tal como aparece
# en la factura, en minúsculas, basta con que esté contenido).
PROVEEDORES_GASTO_FIJO = {
    "endesa": "electricidad",
    "iberdrola": "electricidad",
    "naturgy": "electricidad",
    "seguridad social": "cuota_autonomos",
    "reta": "cuota_autonomos",
    # "nombre del arrendador aquí": "alquiler_nave",
}

PROMPT_EXTRACCION = """Eres un asistente que extrae datos estructurados de facturas españolas de un taller de impresión 3D/fabricación (Myrox).

IMPORTANTE: un mismo documento puede contener MÁS DE UNA FACTURA (esto pasa a menudo
con recopilatorios de Amazon: varias facturas distintas seguidas en el mismo PDF).
Identifica cada factura por separado, con el rango de páginas exacto que ocupa
dentro del documento (1-indexado, ambos inclusive).

Devuelve ÚNICAMENTE un JSON válido (sin texto adicional, sin markdown) con esta forma exacta:

{
  "facturas": [
    {
      "pagina_inicio": 1,
      "pagina_fin": 1,
      "proveedor_nombre": "...",
      "proveedor_nif": "... o null si no aparece en el documento",
      "proveedor_direccion": "dirección completa del proveedor tal cual aparece en el documento, o null si no aparece",
      "fecha": "AAAA-MM-DD",
      "numero_factura": "... o null si no aparece en el documento",
      "importe_total": 0.0,
      "iva": 21,
      "tiene_iva": true,
      "regimen_iva": "general" | "exento" | "intracomunitario" | "recargo_equivalencia",
      "tipo": "material" | "gasto_fijo" | "mantenimiento_reparaciones" | "inmovilizado" | "marketing_publicidad" | "suministros_taller_oficina" | "servicios_profesionales" | "otro",
      "anios_amortizacion_sugeridos": 0 (solo si tipo es "inmovilizado" — tu mejor estimación de vida útil en años según qué tipo de bien es; en cualquier otro caso, null),
      "alerta_fiscal": "explicación breve o null — ver regla más abajo",
      "lineas": [
        {
          "descripcion_original": "texto tal cual aparece en la factura",
          "cantidad": 0.0,
          "precio_unitario": 0.0,
          "importe": 0.0,
          "fabricante_sugerido": "marca del producto si se identifica, o null",
          "material_sugerido": "PLA/PETG/ABS/TPU/Nylon/Resina/Tornillería/Otro, tu mejor estimación",
          "color_sugerido": "color si aplica, o null",
          "formato_sugerido": "ej. 'rollo 1kg', 'bote 1L', 'unidad', tu mejor estimación"
        }
      ]
    }
  ]
}

Reglas:
- Si el documento es una sola factura, "facturas" tiene un único elemento con
  pagina_inicio=1 y pagina_fin=número total de páginas del documento.
- "tiene_iva": false y "regimen_iva": "intracomunitario" en compras a proveedores de
  otro país UE con inversión del sujeto pasivo (factura sin IVA repercutido).
- "tipo" = "gasto_fijo" si es electricidad, alquiler, cuota de autónomos, seguros, telefonía/internet del taller — un gasto recurrente mes a mes.
- "tipo" = "material" si son consumibles que se usan en producción: filamento, resina, tornillería, piezas que forman parte de lo que fabricáis o vendéis.
- "tipo" = "mantenimiento_reparaciones" si es una reparación, revisión técnica, una boquilla/pieza de repuesto para una máquina (no para vender, para mantenerla funcionando), sensores o componentes electrónicos para arreglar/mejorar equipos existentes.
- "tipo" = "inmovilizado" si es una compra grande y duradera que no se consume de golpe: una máquina nueva, herramienta cara, mobiliario, equipo informático de cierto valor.
- "tipo" = "marketing_publicidad" si son tarjetas de visita, pegatinas, rótulos, publicidad, diseño de marca.
- "tipo" = "suministros_taller_oficina" si es ropa laboral, EPIs, material de limpieza, papelería, consumibles menores de oficina — cosas de la empresa que no son ni material de producción ni un gasto fijo recurrente.
- "tipo" = "servicios_profesionales" si es gestoría, asesoría, abogados, u otro profesional externo.
- "tipo" = "otro" si no encaja claramente en ninguna de las anteriores — mejor "otro" que forzar una categoría que no le pega.
- Si "tipo" es "gasto_fijo", "inmovilizado", "marketing_publicidad", "suministros_taller_oficina", "servicios_profesionales" u "otro", "lineas" puede ir vacío: lo importante es importe_total.
- Si no puedes leer algún campo con confianza (proveedor_nif, numero_factura, etc.), ponlo a null en vez de inventarlo. Es NORMAL y frecuente que falte el NIF o el número de factura en según qué documentos — no lo fuerces.
- "proveedor_nif": aquí va el identificador fiscal del proveedor sea cual sea
  su forma — NIF/CIF español, o VAT number si es un proveedor extranjero de la
  UE (ej. "IE1234567X", "DE123456789", "FR12345678901"). Cópialo tal cual
  aparece en el documento. Si el documento no trae NINGÚN identificador fiscal
  reconocible (ni NIF, ni CIF, ni VAT, ni Tax ID), déjalo en null — no
  inventes ni copies otro número (nº de pedido, nº de cliente, etc.) que no
  sea realmente un identificador fiscal.
- "alerta_fiscal": pon una frase breve (una línea) SOLO si detectas algo que
  convendría revisar antes de dar el gasto por bueno del todo: el gasto parece
  de uso mixto personal/empresa (ej. un restaurante, un producto de electrónica
  de consumo genérico sin relación clara con impresión 3D/fabricación), el
  importe es inusualmente alto para tratarse de un consumible, o el concepto es
  ambiguo y podría no ser deducible sin más justificación. Si el gasto es
  claramente normal para un taller de impresión 3D/fabricación (filamento,
  resina, tornillería, herramientas, electricidad, alquiler...), deja este
  campo en null — no generes alertas por rutina.
- Los importes son numéricos, sin símbolo de moneda.
"""

def listar_facturas_pendientes():
    """PROPFIND a la carpeta de entrada para listar archivos nuevos."""
    url = f"{WEBDAV_BASE}{CARPETA_ENTRADA}"
    headers = {"Depth": "1", "Content-Type": "application/xml"}
    body = """<?xml version="1.0"?>
    <d:propfind xmlns:d="DAV:"><d:prop><d:resourcetype/><d:getcontenttype/></d:prop></d:propfind>"""
    r = requests.request("PROPFIND", url, auth=AUTH, headers=headers, data=body)
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
        nombre = unquote(nombre)  # Nextcloud devuelve el href ya codificado
                                   # (espacios como %20, etc.) — lo decodificamos
                                   # aquí, una sola vez, para que quote() más
                                   # adelante no lo vuelva a codificar por encima
                                   # (si no, "%20" acaba siendo "%2520").
        if nombre.lower().endswith((".pdf", ".jpg", ".jpeg", ".png")):
            archivos.append(nombre)
    return archivos

def descargar_archivo(nombre):
    url = f"{WEBDAV_BASE}{CARPETA_ENTRADA}/{quote(nombre)}"
    r = requests.get(url, auth=AUTH)
    r.raise_for_status()
    return r.content

def _asegurar_carpetas(ruta_carpeta):
    """Crea, si hace falta, cada nivel intermedio de una ruta de carpetas en Nextcloud.
    MKCOL exige que el padre ya exista, así que se recorre de fuera hacia dentro."""
    partes = ruta_carpeta.strip("/").split("/")
    actual = ""
    for parte in partes:
        actual += f"/{parte}"
        requests.request("MKCOL", f"{WEBDAV_BASE}{actual}", auth=AUTH)

def mover_archivo(nombre, carpeta_destino, nuevo_nombre=None):
    origen = f"{WEBDAV_BASE}{CARPETA_ENTRADA}/{quote(nombre)}"
    _asegurar_carpetas(carpeta_destino)
    destino = f"{WEBDAV_BASE}{carpeta_destino}/{quote(nuevo_nombre or nombre)}"
    r = requests.request("MOVE", origen, auth=AUTH, headers={"Destination": destino, "Overwrite": "T"})
    r.raise_for_status()

def mover_ruta_completa(ruta_relativa_origen, carpeta_destino, nuevo_nombre):
    """Como mover_archivo, pero el origen puede ser cualquier ruta relativa
    dentro de Nextcloud (no solo Entrada) — para cuando un archivo ya se
    subió a otra carpeta (Clasificadas/Revisión) antes de saber que era
    un duplicado."""
    origen = f"{WEBDAV_BASE}/{quote(ruta_relativa_origen)}"
    _asegurar_carpetas(carpeta_destino)
    destino = f"{WEBDAV_BASE}{carpeta_destino}/{quote(nuevo_nombre)}"
    r = requests.request("MOVE", origen, auth=AUTH, headers={"Destination": destino, "Overwrite": "T"})
    r.raise_for_status()

def _limpiar_y_parsear_json(texto):
    """Tanto la API como Claude Code a veces envuelven la respuesta en
    ```json ... ``` — esto lo quita si está, y no hace nada si no lo está."""
    texto = texto.strip().removeprefix("```json").removeprefix("```").removesuffix("```").strip()
    return json.loads(texto)

def _extraer_via_api(contenido_bytes, nombre_archivo):
    media_type = "application/pdf" if nombre_archivo.lower().endswith(".pdf") else "image/jpeg"
    tipo_bloque = "document" if media_type == "application/pdf" else "image"
    b64 = base64.b64encode(contenido_bytes).decode()

    resp = requests.post(
        "https://api.anthropic.com/v1/messages",
        headers={
            "x-api-key": ANTHROPIC_API_KEY,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        },
        json={
            "model": "claude-sonnet-5",
            "max_tokens": 4000,
            "messages": [{
                "role": "user",
                "content": [
                    {"type": tipo_bloque, "source": {"type": "base64", "media_type": media_type, "data": b64}},
                    {"type": "text", "text": PROMPT_EXTRACCION}
                ]
            }]
        }
    )
    resp.raise_for_status()
    bloques = resp.json()["content"]
    # el primer bloque no siempre es el de texto (a veces el modelo devuelve
    # antes un bloque de "pensamiento" sin la clave "text") — cogemos el
    # primero que sí sea de tipo texto, en vez de asumir que es el [0].
    texto = next((b["text"] for b in bloques if b.get("type") == "text"), None)
    if texto is None:
        raise ValueError(f"La respuesta de Claude no traía ningún bloque de texto: {bloques}")
    return _limpiar_y_parsear_json(texto)

def _extraer_via_claude_code(contenido_bytes, nombre_archivo):
    """Igual que _extraer_via_api, pero llamando a `claude -p` en local (el
    servidor) en vez de a la API con clave — consume el crédito incluido en
    la suscripción Pro/Max, en vez de facturación por token. Necesita
    CLAUDE_CODE_OAUTH_TOKEN puesto en el entorno (generado con
    `claude setup-token`, NO la ANTHROPIC_API_KEY — si ambas están puestas
    a la vez, Claude Code puede acabar facturando por API sin avisar)."""
    # Freno de seguridad: tope diario y límite de intentos por archivo.
    guardia_claude.autorizar_llamada(nombre_archivo, contenido_bytes)

    extension = ".pdf" if nombre_archivo.lower().endswith(".pdf") else ".jpg"
    with tempfile.NamedTemporaryFile(suffix=extension, delete=False) as f:
        f.write(contenido_bytes)
        ruta_temporal = f.name

    try:
        prompt_completo = f"{PROMPT_EXTRACCION}\n\nLee el archivo {ruta_temporal} y responde solo con el JSON, según las instrucciones anteriores."
        resultado = subprocess.run(
            [CLAUDE_CODE_BIN, "-p", prompt_completo, "--allowedTools", "Read",
             "--model", CLAUDE_CODE_MODEL, "--max-turns", CLAUDE_CODE_MAX_TURNS],
            capture_output=True, text=True, timeout=CLAUDE_CODE_TIMEOUT,
        )
        if resultado.returncode != 0:
            raise RuntimeError(f"{CLAUDE_CODE_BIN} -p terminó con error (código {resultado.returncode}): {resultado.stderr.strip()}")
        if not resultado.stdout.strip():
            raise ValueError(f"claude -p no devolvió ninguna salida (stderr: {resultado.stderr.strip() or '(vacío)'})")
        try:
            return _limpiar_y_parsear_json(resultado.stdout)
        except json.JSONDecodeError as e:
            raise ValueError(f"La salida de claude -p no era JSON válido ({e}). Salida completa: {resultado.stdout[:500]!r}")
    finally:
        os.unlink(ruta_temporal)  # el PDF/imagen temporal no debe quedarse en el servidor

def extraer_datos_factura(contenido_bytes, nombre_archivo):
    if USAR_CLAUDE_CODE:
        return _extraer_via_claude_code(contenido_bytes, nombre_archivo)
    return _extraer_via_api(contenido_bytes, nombre_archivo)

def subir_archivo(ruta_relativa, contenido_bytes):
    """PUT de un archivo nuevo (o sobrescribe) en Nextcloud, creando carpetas intermedias si hacen falta."""
    carpeta = "/".join(ruta_relativa.strip("/").split("/")[:-1])
    if carpeta:
        _asegurar_carpetas(carpeta)
    url = f"{WEBDAV_BASE}/{quote(ruta_relativa)}"
    r = requests.put(url, auth=AUTH, data=contenido_bytes)
    r.raise_for_status()

def dividir_pdf(contenido_bytes, pagina_inicio, pagina_fin):
    """Extrae el rango de páginas [pagina_inicio, pagina_fin] (1-indexado, inclusive)
    de un PDF y devuelve el resultado como bytes de un PDF independiente."""
    reader = PdfReader(io.BytesIO(contenido_bytes))
    writer = PdfWriter()
    total_paginas = len(reader.pages)
    inicio = max(1, pagina_inicio or 1)
    fin = min(total_paginas, pagina_fin or total_paginas)
    for i in range(inicio - 1, fin):
        writer.add_page(reader.pages[i])
    buf = io.BytesIO()
    writer.write(buf)
    return buf.getvalue()

def _slugify(texto, max_len=40):
    if not texto:
        return ""
    texto = unicodedata.normalize("NFKD", str(texto)).encode("ascii", "ignore").decode("ascii")
    texto = re.sub(r"[^a-zA-Z0-9]+", "-", texto).strip("-")
    return texto[:max_len]

def generar_nombre_archivo(factura, extension, indice_fallback):
    """
    Ej: 'Filament2Print_F-2026-881.pdf', 'Amazon_701-1234567-1234567_SINIVA.pdf'.
    Si falta el número de factura (pasa a menudo), usa la fecha + un índice para
    que nunca choquen dos archivos entre sí dentro del mismo PDF de origen.
    """
    proveedor = _slugify(factura.get("proveedor_nombre")) or "ProveedorDesconocido"
    numero = _slugify(factura.get("numero_factura"))
    if not numero:
        fecha = (factura.get("fecha") or "sinfecha").replace("-", "")
        numero = f"{fecha}-{indice_fallback}"

    sufijo = ""
    if factura.get("regimen_iva") == "intracomunitario":
        sufijo = "_IC"
    elif not factura.get("tiene_iva", True):
        sufijo = "_SINIVA"

    return f"{proveedor}_{numero}{sufijo}.{extension}"

def avisar_revision_critica(facturas_criticas):
    """Deja constancia en el log de qué facturas cayeron en revisión crítica
    en esta pasada. El aviso por email (si hay SMTP_PASSWORD configurada) se
    manda aparte, en enviar_email_revision_critica — este solo es el log."""
    if not facturas_criticas:
        return
    print(f"\n{len(facturas_criticas)} factura(s) en REVISIÓN CRÍTICA "
          f"(faltan datos obligatorios — revisar en /Facturas/Revision/):")
    for f in facturas_criticas:
        print(
            f"  - {f['archivo']}  |  Proveedor: {f.get('proveedor_nombre') or '???'}  |  "
            f"NIF/VAT: {f.get('proveedor_nif') or 'FALTA'}  |  "
            f"Nº factura: {f.get('numero_factura') or 'FALTA'}  |  "
            f"Importe: {f.get('importe_total') or '???'}€  |  "
            f"Motivo: {f.get('motivo_revision')}"
        )

def enviar_email_revision_critica(facturas_criticas):
    """Manda UN email de resumen al final de la pasada con todas las facturas
    que cayeron en revisión crítica (si hay alguna). Si SMTP_PASSWORD no está
    configurada, se salta el envío sin romper nada — solo avisa por consola."""
    if not facturas_criticas:
        return
    if not SMTP_PASSWORD:
        print("  (aviso por email desactivado: falta SMTP_PASSWORD en el entorno)")
        return

    lineas = [
        f"{len(facturas_criticas)} factura(s) cayeron en revisión crítica en esta pasada "
        f"(revísalas en /Facturas/Revision/ o en la app):\n"
    ]
    for f in facturas_criticas:
        lineas.append(
            f"- Archivo: {f['archivo']}\n"
            f"  Proveedor: {f.get('proveedor_nombre') or '???'}\n"
            f"  NIF/VAT: {f.get('proveedor_nif') or 'FALTA'}\n"
            f"  Nº factura: {f.get('numero_factura') or 'FALTA'}\n"
            f"  Importe: {f.get('importe_total') or '???'}€\n"
            f"  Motivo: {f.get('motivo_revision')}\n"
        )
    cuerpo = "\n".join(lineas)

    msg = MIMEText(cuerpo, "plain", "utf-8")
    msg["Subject"] = f"Myrox — {len(facturas_criticas)} factura(s) en revisión crítica"
    msg["From"] = EMAIL_FROM
    msg["To"] = EMAIL_TO

    try:
        with smtplib.SMTP_SSL(SMTP_HOST, SMTP_PORT) as server:
            server.login(SMTP_USER, SMTP_PASSWORD)
            server.sendmail(EMAIL_FROM, [EMAIL_TO], msg.as_string())
        print(f"  Email de aviso enviado a {EMAIL_TO}")
    except Exception as e:
        # Un fallo de email nunca debe tumbar el resto del procesado —
        # ya quedó constancia en el log de todas formas.
        print(f"  No se pudo enviar el email de aviso: {e}")

def clasificar_categoria_gasto_fijo(proveedor_nombre):
    nombre = (proveedor_nombre or "").lower()
    for clave, categoria in PROVEEDORES_GASTO_FIJO.items():
        if clave in nombre:
            return categoria
    return None

def calcular_trimestre(fecha_str):
    """
    'T3-2026', 'T4-2026', etc., a partir de la fecha de la propia factura
    (no de la fecha de procesado). Si la fecha viene vacía o no se puede
    parsear, usa la fecha de hoy como respaldo — así nunca se pierde el
    archivo, y queda claro por el nombre de carpeta si algo cayó "mal
    fechado" para revisarlo luego.
    """
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

_CODIGOS_PAIS_VAT_UE = {
    "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "EL",
    "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK",
    "SI", "ES", "SE", "GB", "XI", "CH", "NO",  # + Reino Unido/Suiza/Noruega, habituales en compras
}

def _parece_identificador_fiscal_valido(valor):
    """
    Comprueba que el valor tenga la FORMA de un identificador fiscal real
    (NIF/NIE/CIF español, o VAT number de la UE) — no solo que exista.
    Esto es lo que evita que cuele un 'número' cualquiera (nº de pedido,
    de cliente, de serie...) como si fuera el identificador fiscal.
    """
    if not valor:
        return False
    v = re.sub(r"[\s\-\.]", "", str(valor)).upper()

    if re.match(r"^\d{8}[A-Z]$", v):                          # NIF persona física
        return True
    if re.match(r"^[XYZ]\d{7}[A-Z]$", v):                     # NIE
        return True
    if re.match(r"^[A-HJNP-SUVW]\d{7}[0-9A-Z]$", v):          # CIF empresa española
        return True
    # VAT number UE: 2 letras de código de país real + 4-12 caracteres alfanuméricos
    if re.match(r"^[A-Z]{2}[A-Z0-9]{4,12}$", v) and v[:2] in _CODIGOS_PAIS_VAT_UE:
        return True
    return False

def _evaluar_revision_critica(datos):
    """
    Para que una factura sea válida contablemente hacen falta cuatro cosas:
    CIF/NIF/VAT del proveedor, dirección del proveedor, número de factura, e
    importe. Si falta cualquiera de ellas — o el identificador fiscal
    presente no tiene pinta de ser real — la factura se marca como crítica:
    no se aplica nada automáticamente. Queda visible en el log y en la carpeta /Facturas/Revision/.
    """
    motivos = []
    nif = datos.get("proveedor_nif")
    if not nif:
        motivos.append("Falta el NIF/VAT del proveedor")
    elif not _parece_identificador_fiscal_valido(nif):
        motivos.append(f"El NIF/VAT del proveedor no tiene un formato válido: '{nif}'")
    if not datos.get("proveedor_direccion"):
        motivos.append("Falta la dirección del proveedor")
    if not datos.get("numero_factura"):
        motivos.append("Falta el número de factura")
    if not datos.get("importe_total"):
        motivos.append("Falta el importe")
    return motivos

def _importar_una_factura(datos_factura):
    """Aplica la clasificación de gasto fijo y llama a POST /facturas/importar
    para UNA factura ya extraída (con su 'archivo' ya resuelto). Devuelve
    (resultado_api, motivos_criticos)."""
    motivos = _evaluar_revision_critica(datos_factura)
    datos_factura["requiere_atencion"] = bool(motivos)
    datos_factura["motivo_revision"] = "; ".join(motivos) if motivos else None

    necesita_clasificacion_ia = False
    if not motivos and datos_factura.get("tipo") == "gasto_fijo":
        datos_factura["categoria_gasto"] = clasificar_categoria_gasto_fijo(datos_factura.get("proveedor_nombre"))
        if not datos_factura["categoria_gasto"]:
            # No sabemos a qué categoría de gasto fijo pertenece por palabras
            # clave: la dejamos en "otro" (que siempre cae en revisión) en vez
            # de "material" — así no se cuela como si fuera algo de stock, y
            # de paso la metemos en la cola del agente para que el stack de
            # modelos (nivel1 -> nivel2 -> Claude) intente reclasificarla solo.
            datos_factura["tipo"] = "otro"
            necesita_clasificacion_ia = True

    r = requests.post(f"{MYROX_API_URL}/facturas/importar", json=datos_factura)
    r.raise_for_status()
    resultado = r.json()

    if resultado.get("status") == "duplicada":
        # Misma factura de verdad (mismo archivo exacto, o mismo nº+proveedor
        # con otro nombre de archivo) — nada que encolar ni clasificar, el
        # archivo se manda a su propia carpeta en vez de a Clasificadas/Revisión.
        return resultado, []

    if necesita_clasificacion_ia:
        try:
            requests.post(f"{MYROX_API_URL}/agente/tareas", json={
                "tipo": "clasificar_categoria_gasto_factura",
                "entidad_tipo": "factura",
                "entidad_id": resultado["factura_id"],
                "datos": {
                    "proveedor_nombre": datos_factura.get("proveedor_nombre"),
                    "importe_total": datos_factura.get("importe_total"),
                    "lineas": datos_factura.get("lineas"),
                },
            }, timeout=10)
        except Exception as e:
            # Que la cola falle no debe tumbar la importación de la factura
            # en sí — a lo sumo se queda como "material" hasta que se
            # reclasifique a mano.
            print(f"  Aviso: no se pudo encolar la clasificación IA: {e}")

    return resultado, motivos

def procesar_uno(nombre_archivo):
    """Devuelve la lista de facturas que hayan caído en revisión crítica
    en este documento (para el aviso resumen al final de la pasada)."""
    print(f"Procesando: {nombre_archivo}")
    contenido = descargar_archivo(nombre_archivo)
    extraido = extraer_datos_factura(contenido, nombre_archivo)
    facturas = extraido.get("facturas", [])
    extension = nombre_archivo.rsplit(".", 1)[-1].lower()
    es_pdf = extension == "pdf"
    criticas = []

    if not facturas:
        raise ValueError("La IA no identificó ninguna factura en el documento")

    if len(facturas) == 1:
        # Caso normal: un documento, una factura. Se renombra al moverlo,
        # sin necesidad de reescribir el PDF.
        datos = facturas[0]
        trimestre = calcular_trimestre(datos.get("fecha"))
        nombre_final = generar_nombre_archivo(datos, extension, indice_fallback=1)
        ruta_relativa = f"{trimestre}/{nombre_final}"

        resultado, motivos = _importar_una_factura({**datos, "archivo": ruta_relativa})

        if resultado.get("status") == "duplicada":
            print(f"  DUPLICADA: ya existe como factura_id={resultado['factura_id']} — se archiva aparte, sin reprocesar")
            mover_archivo(nombre_archivo, f"{CARPETA_DUPLICADA}/{trimestre}", nuevo_nombre=nombre_final)
            return criticas

        print(f"  -> factura_id={resultado['factura_id']} estado={resultado['estado']} "
              f"({trimestre}/{nombre_final})")
        if datos.get("alerta_fiscal"):
            print(f"  ALERTA FISCAL: {datos['alerta_fiscal']}")

        carpeta_destino = CARPETA_REVISION if motivos else CARPETA_CLASIFICADAS
        mover_archivo(nombre_archivo, f"{carpeta_destino}/{trimestre}", nuevo_nombre=nombre_final)
        if motivos:
            criticas.append({**datos, "archivo": ruta_relativa, "motivo_revision": "; ".join(motivos)})
    else:
        # Varias facturas dentro del mismo PDF (típico recopilatorio de Amazon):
        # se parte en un PDF independiente por factura y se sube cada uno con
        # su propio nombre. El documento original se archiva aparte, como
        # respaldo, sin borrarse.
        print(f"  Documento con {len(facturas)} facturas — dividiendo...")
        for idx, datos in enumerate(facturas, start=1):
            trimestre = calcular_trimestre(datos.get("fecha"))
            nombre_final = generar_nombre_archivo(datos, extension, indice_fallback=idx)

            motivos_previos = _evaluar_revision_critica(datos)
            carpeta_destino = CARPETA_REVISION if motivos_previos else CARPETA_CLASIFICADAS
            ruta_relativa = f"{trimestre}/{nombre_final}"
            ruta_destino_completa = f"{carpeta_destino}/{ruta_relativa}"

            if es_pdf:
                trozo = dividir_pdf(contenido, datos.get("pagina_inicio"), datos.get("pagina_fin"))
                subir_archivo(ruta_destino_completa, trozo)
            else:
                # No debería darse (una imagen no trae varias facturas), pero por
                # seguridad subimos el archivo entero si el caso se presentara.
                subir_archivo(ruta_destino_completa, contenido)

            resultado, motivos = _importar_una_factura({**datos, "archivo": ruta_relativa})

            if resultado.get("status") == "duplicada":
                print(f"  DUPLICADA: ya existe como factura_id={resultado['factura_id']} — se archiva aparte, sin reprocesar")
                mover_ruta_completa(ruta_destino_completa, f"{CARPETA_DUPLICADA}/{trimestre}", nombre_final)
                continue

            print(f"  -> factura_id={resultado['factura_id']} estado={resultado['estado']} "
                  f"({ruta_destino_completa})")
            if datos.get("alerta_fiscal"):
                print(f"  ALERTA FISCAL: {datos['alerta_fiscal']}")
            if motivos:
                criticas.append({**datos, "archivo": ruta_relativa, "motivo_revision": "; ".join(motivos)})

        # Archivar el PDF original combinado como respaldo, en el trimestre de
        # su primera factura detectada.
        trimestre_origen = calcular_trimestre(facturas[0].get("fecha"))
        mover_archivo(nombre_archivo, f"{CARPETA_CLASIFICADAS}/{trimestre_origen}/_originales-multiples")

    return criticas

def main():
    pendientes = listar_facturas_pendientes()
    if not pendientes:
        print("No hay facturas nuevas.")
        return
    if USAR_CLAUDE_CODE and guardia_claude.tope_alcanzado():
        print(f"Tope diario de llamadas a Claude alcanzado — {len(pendientes)} archivo(s) esperan en Entrada hasta mañana.")
        return
    todas_criticas = []
    for nombre in pendientes:
        extension = os.path.splitext(nombre)[1].lower()
        if extension not in EXTENSIONES_VALIDAS:
            print(f"Procesando: {nombre}")
            print(f"  OMITIDO: no es una factura (extensión '{extension or 'ninguna'}') — se aparta a Error/ sin llamar a Claude")
            try:
                mover_archivo(nombre, CARPETA_ERROR)
            except Exception as e2:
                print(f"  No se pudo mover a Error/: {e2}")
            continue
        try:
            todas_criticas.extend(procesar_uno(nombre))
            guardia_claude.registrar_exito(nombre)
        except guardia_claude.TopeDiario as e:
            print(f"  PARADO: {e}. El resto queda en Entrada, sin tocar, hasta mañana.")
            break
        except Exception as e:
            print(f"  ERROR con {nombre}: {e}")
            try:
                mover_archivo(nombre, CARPETA_ERROR)
            except Exception as e2:
                print(f"  Y además no se pudo mover a Error/: {e2}")
    avisar_revision_critica(todas_criticas)
    enviar_email_revision_critica(todas_criticas)

if __name__ == "__main__":
    main()
