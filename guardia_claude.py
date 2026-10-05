"""
guardia_claude.py
─────────────────
Freno de seguridad para las llamadas a Claude Code (`claude -p`) de los dos
procesadores de facturas. Evita dos formas de quemar crédito sin darse cuenta:

  1. Un archivo "envenenado" que falla y además no se puede mover a Error/ se
     quedaría en Entrada y el cron lo reintentaría cada 2 minutos, para
     siempre, llamando a Claude cada vez. Aquí cada archivo (nombre + contenido)
     tiene como mucho MAX_INTENTOS_ARCHIVO intentos; pasados esos, no se
     vuelve a llamar a Claude con él.
  2. Una cola grande, o cualquier otro descontrol, no puede gastar más de
     MAX_LLAMADAS_DIA llamadas al día entre los dos scripts juntos. Al llegar
     al tope se para y lo pendiente espera en Entrada hasta mañana.

El estado vive en un JSON pequeño (GUARDIA_CLAUDE_ESTADO) compartido por los
dos scripts, protegido con un candado para que no se pisen entre ellos.
Para desbloquear a mano un archivo bloqueado: borrar ese JSON.
"""
import fcntl
import hashlib
import json
import os
from contextlib import contextmanager
from datetime import date

ESTADO_PATH = os.environ.get("GUARDIA_CLAUDE_ESTADO", "/opt/print3d/facturas/guardia_claude.json")
MAX_LLAMADAS_DIA = int(os.environ.get("MAX_LLAMADAS_DIA", "60"))
MAX_INTENTOS_ARCHIVO = int(os.environ.get("MAX_INTENTOS_ARCHIVO", "2"))

_claves = {}  # nombre de archivo -> clave (nombre + huella del contenido) de esta ejecución


class TopeDiario(Exception):
    """Se alcanzó el máximo de llamadas a Claude permitido por día."""


@contextmanager
def _bloqueo():
    with open(ESTADO_PATH + ".lock", "w") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        try:
            yield
        finally:
            fcntl.flock(lock, fcntl.LOCK_UN)


def _cargar():
    try:
        with open(ESTADO_PATH, encoding="utf-8") as f:
            estado = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        estado = {}
    hoy = date.today().isoformat()
    if estado.get("dia") != hoy:
        # Nuevo día: el contador de llamadas vuelve a cero, pero los intentos
        # fallidos por archivo se mantienen (un archivo bloqueado sigue bloqueado).
        estado = {"dia": hoy, "llamadas": 0, "intentos": estado.get("intentos", {})}
    estado.setdefault("intentos", {})
    estado.setdefault("llamadas", 0)
    return estado


def _guardar(estado):
    tmp = ESTADO_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(estado, f, ensure_ascii=False)
    os.replace(tmp, ESTADO_PATH)


def tope_alcanzado():
    """True si hoy ya no se pueden hacer más llamadas. Sirve para ni siquiera
    descargar archivos cuando el día ya está agotado."""
    with _bloqueo():
        return _cargar()["llamadas"] >= MAX_LLAMADAS_DIA


def autorizar_llamada(nombre, contenido_bytes):
    """Llamar JUSTO ANTES de invocar a claude. Lanza TopeDiario si se agotó el
    día, o RuntimeError si este archivo ya agotó sus intentos. Si autoriza,
    cuenta la llamada y el intento ya (antes de ejecutarla), para que un
    fallo a mitad no se pueda escapar del recuento."""
    clave = f"{nombre}:{hashlib.sha1(contenido_bytes).hexdigest()[:12]}"
    _claves[nombre] = clave
    with _bloqueo():
        estado = _cargar()
        if estado["llamadas"] >= MAX_LLAMADAS_DIA:
            raise TopeDiario(f"tope de {MAX_LLAMADAS_DIA} llamadas a Claude hoy alcanzado")
        if estado["intentos"].get(clave, 0) >= MAX_INTENTOS_ARCHIVO:
            raise RuntimeError(
                f"{MAX_INTENTOS_ARCHIVO} intentos fallidos con este archivo — no se vuelve a llamar a Claude con él "
                f"(para desbloquearlo, borra {ESTADO_PATH})")
        estado["llamadas"] += 1
        estado["intentos"][clave] = estado["intentos"].get(clave, 0) + 1
        _guardar(estado)


def registrar_exito(nombre):
    """Llamar cuando el archivo se procesó entero con éxito: borra sus intentos."""
    clave = _claves.get(nombre)
    if clave is None:
        return
    with _bloqueo():
        estado = _cargar()
        estado["intentos"].pop(clave, None)
        _guardar(estado)
