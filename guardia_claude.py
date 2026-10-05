"""
guardia_claude.py
─────────────────
Freno de seguridad para las llamadas a Claude Code (`claude -p`) de los dos
procesadores de facturas. Cada llamada gasta crédito de la suscripción, y ese
crédito es el mismo que usáis en el chat y en Claude Code, así que aquí todo
falla "cerrado": ante la duda, NO se llama a Claude.

Frenos (todos compartidos por los dos scripts):

  1. Interruptor manual: si existe el archivo PARAR_PATH, no se hace ninguna
     llamada. Para cortar todo al momento: `touch /opt/print3d/facturas/PARAR`.
  2. Nunca se llama dos veces a Claude con el MISMO contenido si ya se procesó
     bien. Si un archivo ya procesado reaparece en Entrada (p. ej. porque
     Nextcloud no lo llegó a mover), se aparta sin gastar nada.
  3. Cada contenido tiene como mucho MAX_INTENTOS_ARCHIVO intentos fallidos,
     aunque se le cambie el nombre.
  4. Tope de MAX_LLAMADAS_DIA llamadas al día y MAX_LLAMADAS_SEMANA a la
     semana (lunes a domingo) entre los dos scripts.
  5. Si Claude responde que se ha alcanzado el límite de uso, se bloquea todo
     hasta el día siguiente en vez de seguir reintentando.
  6. Si el JSON de estado está dañado o no se puede leer, no se llama.

El estado vive en un JSON pequeño (GUARDIA_CLAUDE_ESTADO), protegido con un
candado. Para desbloquear a mano un archivo concreto, borra su entrada en
"intentos"; borrar el JSON entero también pone a cero los contadores.
"""
import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from datetime import date, timedelta

ESTADO_PATH = os.environ.get("GUARDIA_CLAUDE_ESTADO", "/opt/print3d/facturas/guardia_claude.json")
PARAR_PATH = os.environ.get("GUARDIA_CLAUDE_PARAR", "/opt/print3d/facturas/PARAR")
MAX_LLAMADAS_DIA = int(os.environ.get("MAX_LLAMADAS_DIA", "20"))
MAX_LLAMADAS_SEMANA = int(os.environ.get("MAX_LLAMADAS_SEMANA", "80"))
MAX_INTENTOS_ARCHIVO = int(os.environ.get("MAX_INTENTOS_ARCHIVO", "2"))

# Textos con los que `claude -p` avisa de que la cuenta se ha quedado sin uso
_TEXTOS_LIMITE = ("usage limit", "rate limit", "limit reached", "limit will reset", "out of credits", "credit balance")

_claves = {}  # nombre de archivo -> huella del contenido en esta ejecución


class TopeDiario(Exception):
    """No se puede llamar a Claude ahora (tope, interruptor, bloqueo o estado ilegible)."""


class YaProcesado(Exception):
    """Este contenido ya se procesó bien antes: no se vuelve a llamar a Claude."""


@contextmanager
def _bloqueo():
    with open(ESTADO_PATH + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _semana(d):
    lunes = d - timedelta(days=d.weekday())
    return lunes.isoformat()


def _cargar():
    try:
        with open(ESTADO_PATH, encoding="utf-8") as f:
            estado = json.load(f)
    except FileNotFoundError:
        estado = {}
    except (json.JSONDecodeError, OSError) as e:
        # Antes un JSON dañado ponía los contadores a cero sin avisar. Ahora se para.
        raise TopeDiario(f"no se puede leer {ESTADO_PATH} ({e}) — revísalo o bórralo a mano")
    hoy = date.today()
    if estado.get("dia") != hoy.isoformat():
        estado["dia"] = hoy.isoformat()
        estado["llamadas"] = 0
    if estado.get("semana") != _semana(hoy):
        estado["semana"] = _semana(hoy)
        estado["llamadas_semana"] = 0
    estado.setdefault("llamadas", 0)
    estado.setdefault("llamadas_semana", 0)
    estado.setdefault("intentos", {})
    estado.setdefault("procesados", {})
    estado.setdefault("historial", {})
    return estado


def _guardar(estado):
    tmp = ESTADO_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False, indent=1)
    os.replace(tmp, ESTADO_PATH)


def _motivo_parada(estado):
    if os.path.exists(PARAR_PATH):
        return f"interruptor manual activado ({PARAR_PATH} existe)"
    if estado.get("bloqueado_hasta", "") > date.today().isoformat():
        return f"Claude avisó de límite de uso — bloqueado hasta el {estado['bloqueado_hasta']}"
    if estado["llamadas"] >= MAX_LLAMADAS_DIA:
        return f"tope de {MAX_LLAMADAS_DIA} llamadas a Claude hoy alcanzado"
    if estado["llamadas_semana"] >= MAX_LLAMADAS_SEMANA:
        return f"tope de {MAX_LLAMADAS_SEMANA} llamadas a Claude esta semana alcanzado"
    return None


def tope_alcanzado():
    """True si ahora mismo no se puede llamar a Claude. Sirve para ni siquiera
    descargar archivos cuando no se va a poder procesarlos."""
    try:
        with _bloqueo():
            motivo = _motivo_parada(_cargar())
    except TopeDiario as e:
        motivo = str(e)
    if motivo:
        print(f"Guardia: {motivo}")
        return True
    return False


def autorizar_llamada(nombre, contenido_bytes):
    """Llamar JUSTO ANTES de invocar a claude. Lanza TopeDiario si no se puede
    llamar ahora, YaProcesado si este contenido ya se procesó bien, o
    RuntimeError si agotó sus intentos. Si autoriza, cuenta la llamada y el
    intento ya, antes de ejecutarla, para que un fallo a mitad no se escape
    del recuento."""
    clave = hashlib.sha256(contenido_bytes).hexdigest()[:16]
    _claves[nombre] = clave
    with _bloqueo():
        estado = _cargar()
        if clave in estado["procesados"]:
            raise YaProcesado(f"este contenido ya se procesó el {estado['procesados'][clave]} — no se vuelve a llamar a Claude")
        motivo = _motivo_parada(estado)
        if motivo:
            raise TopeDiario(motivo)
        if estado["intentos"].get(clave, 0) >= MAX_INTENTOS_ARCHIVO:
            raise RuntimeError(
                f"{MAX_INTENTOS_ARCHIVO} intentos fallidos con este archivo — no se vuelve a llamar a Claude con él "
                f"(para desbloquearlo, borra la clave {clave} de 'intentos' en {ESTADO_PATH})")
        estado["llamadas"] += 1
        estado["llamadas_semana"] += 1
        estado["intentos"][clave] = estado["intentos"].get(clave, 0) + 1
        hoy = estado["dia"]
        estado["historial"][hoy] = estado["historial"].get(hoy, 0) + 1
        _guardar(estado)


def revisar_salida_claude(texto):
    """Llamar con stdout+stderr de `claude -p` cuando falla. Si la cuenta se ha
    quedado sin uso, bloquea todas las llamadas hasta mañana y lanza TopeDiario
    para que el script pare la pasada entera."""
    if not any(t in (texto or "").lower() for t in _TEXTOS_LIMITE):
        return
    manana = (date.today() + timedelta(days=1)).isoformat()
    with _bloqueo():
        estado = _cargar()
        estado["bloqueado_hasta"] = manana
        _guardar(estado)
    raise TopeDiario(f"Claude avisa de límite de uso — no se vuelve a llamar hasta el {manana}")


def registrar_exito(nombre):
    """Llamar cuando el archivo se procesó entero con éxito: su contenido queda
    marcado como procesado para no volver a pagar por él nunca."""
    clave = _claves.get(nombre)
    if clave is None:
        return
    with _bloqueo():
        estado = _cargar()
        estado["intentos"].pop(clave, None)
        estado["procesados"][clave] = date.today().isoformat()
        _guardar(estado)
