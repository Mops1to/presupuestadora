"""
Print3D Analyzer + Gestión de Proyectos
Backend único en FastAPI. Persistencia en SQLite (/opt/print3d/data.db).
"""
from fastapi import FastAPI, UploadFile, File, Query, Request, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from starlette.middleware.base import BaseHTTPMiddleware
import trimesh, tempfile, os, json, sqlite3, datetime, urllib.parse, io
import cadquery as cq
import requests

app = FastAPI(title="Print3D Analyzer + Proyectos")

class PrivateNetworkMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request, call_next):
        if request.method == "OPTIONS":
            from starlette.responses import Response
            r = Response()
            r.headers["Access-Control-Allow-Private-Network"] = "true"
            r.headers["Access-Control-Allow-Origin"] = "*"
            r.headers["Access-Control-Allow-Headers"] = "*"
            return r
        response = await call_next(request)
        response.headers["Access-Control-Allow-Private-Network"] = "true"
        return response

app.add_middleware(PrivateNetworkMiddleware)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

CONFIG_FILE = "/opt/print3d/config.json"
DB_FILE = "/opt/print3d/data.db"

DEFAULT_CONFIG = {
    "materials": [
        {"id":"pla",   "name":"PLA",   "price":20, "density":1.24, "type":"fdm"},
        {"id":"pla+",  "name":"PLA+",  "price":24, "density":1.24, "type":"fdm"},
        {"id":"petg",  "name":"PETG",  "price":25, "density":1.27, "type":"fdm"},
        {"id":"abs",   "name":"ABS",   "price":22, "density":1.04, "type":"fdm"},
        {"id":"asa",   "name":"ASA",   "price":28, "density":1.07, "type":"fdm"},
        {"id":"tpu",   "name":"TPU",   "price":40, "density":1.21, "type":"fdm"},
        {"id":"nylon", "name":"Nylon", "price":45, "density":1.13, "type":"fdm"},
        {"id":"resin", "name":"Resina","price":35, "density":1.10, "type":"resin"}
    ],
    "printers": [
        {"id":"bambu",  "name":"Bambu H2D", "speed":250, "layer":0.2,  "watts":450},
        {"id":"ender",  "name":"Ender 3",   "speed":60,  "layer":0.2,  "watts":150},
        {"id":"jupiter","name":"Jupiter SE","speed":0,   "layer":0.05, "watts":50}
    ],
    "defaults": {"labor_cost": 15, "margin": 30, "kwh_price": 0.18, "iva": 21}
}

TIPOS_TRABAJO = ["IR", "D", "DO", "I3D", "MD", "FA"]
ESTADOS_PROYECTO = ["presupuestado", "aceptado", "en_curso", "entregado", "facturado", "cobrado", "rechazado"]
MARCAS = ["myrox_lab", "myrox_print", "myrox_works", "myrox_automation", "mw3d"]

# ──────────────────────────────────────────────────────────────────
# DB SETUP
# ──────────────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(DB_FILE)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def init_db():
    conn = get_db()
    c = conn.cursor()

    # ---- Presupuestadora: trabajos / stock / consumibles / amortización ----
    c.execute("""CREATE TABLE IF NOT EXISTS trabajos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT DEFAULT (datetime('now')),
        nombre TEXT, material TEXT, impresora TEXT,
        volumen_cm3 REAL, tiempo_estimado_h REAL, tiempo_real_h REAL,
        precio_sin_iva REAL, precio_con_iva REAL, precio_cobrado REAL,
        ganancia REAL, fallo TEXT, notas TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS amortizacion (
        printer_id TEXT PRIMARY KEY,
        coste_compra REAL, vida_util_h REAL, mantenimiento_mes REAL,
        horas_registradas REAL DEFAULT 0
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS consumibles (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT, printer_id TEXT, tipo TEXT, descripcion TEXT, coste REAL
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS stock_materiales (
        material_id TEXT PRIMARY KEY,
        cantidad REAL DEFAULT 0,
        stock_minimo REAL DEFAULT 0,
        precio_medio REAL DEFAULT 0
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS stock_movimientos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        fecha TEXT DEFAULT (datetime('now')),
        material_id TEXT, tipo TEXT, cantidad REAL, coste_total REAL, notas TEXT
    )""")

    # ---- Módulo de Proyectos / CRM ----
    c.execute("""CREATE TABLE IF NOT EXISTS clientes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        nombre TEXT NOT NULL, empresa TEXT,
        contacto_email TEXT, contacto_telefono TEXT,
        fecha_alta TEXT DEFAULT (datetime('now'))
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS contactos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        cliente_id INTEGER NOT NULL REFERENCES clientes(id),
        nombre TEXT NOT NULL, email TEXT, telefono TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS contadores_codigo (
        tipo TEXT NOT NULL, anio INTEGER NOT NULL,
        ultimo_numero INTEGER DEFAULT 0,
        PRIMARY KEY (tipo, anio)
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS proyectos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        codigo TEXT UNIQUE NOT NULL,
        nombre TEXT,
        cliente_id INTEGER REFERENCES clientes(id),
        contacto_id INTEGER REFERENCES contactos(id),
        marca TEXT, tipo_trabajo TEXT,
        estado TEXT DEFAULT 'presupuestado',
        fecha_alta TEXT DEFAULT (datetime('now')),
        fecha_entrega_compromiso TEXT, fecha_entrega_real TEXT,
        fecha_facturacion TEXT, fecha_cobro TEXT,
        ruta_nextcloud TEXT, imagen_portada_ruta TEXT, notas TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS presupuestos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
        version INTEGER, fecha TEXT DEFAULT (datetime('now')),
        estado TEXT DEFAULT 'borrador', importe REAL DEFAULT 0,
        referencia_archivo TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS presupuesto_lineas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        presupuesto_id INTEGER NOT NULL REFERENCES presupuestos(id),
        tipo TEXT,
        descripcion TEXT,
        cantidad REAL,
        precio_unitario REAL,
        importe REAL
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS tarifas_horas (
        tipo_hora TEXT PRIMARY KEY,
        precio_hora REAL
    )""")
    for tipo, precio in [("ir", 35), ("diseno", 30), ("diseno_organico", 35),
                          ("impresion", 15), ("reunion", 25), ("montaje", 25), ("km", 0.30)]:
        c.execute("INSERT OR IGNORE INTO tarifas_horas (tipo_hora, precio_hora) VALUES (?,?)", (tipo, precio))

    c.execute("""CREATE TABLE IF NOT EXISTS facturas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
        numero TEXT, importe REAL, fecha TEXT,
        estado_cobro TEXT, referencia_archivo TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS horas (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
        fecha TEXT, tipo_trabajo_hora TEXT, horas REAL, descripcion TEXT
    )""")

    c.execute("""CREATE TABLE IF NOT EXISTS gastos (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        proyecto_id INTEGER NOT NULL REFERENCES proyectos(id),
        fecha TEXT, descripcion TEXT, importe REAL
    )""")

    conn.commit()
    conn.close()

init_db()

def get_or_create_config():
    if not os.path.exists(CONFIG_FILE):
        with open(CONFIG_FILE, "w") as f:
            json.dump(DEFAULT_CONFIG, f, indent=2)
    with open(CONFIG_FILE, "r") as f:
        return json.load(f)

def load_step(path: str):
    shape = cq.importers.importStep(path)
    bb = shape.val().BoundingBox()
    volume_mm3 = shape.val().Volume()
    bbox = [round(bb.xmax - bb.xmin, 2), round(bb.ymax - bb.ymin, 2), round(bb.zmax - bb.zmin, 2)]
    return abs(volume_mm3), bbox

def row_to_dict(row):
    return dict(row) if row else None

# ──────────────────────────────────────────────────────────────────
# HEALTH / CONFIG / ANALYZE (igual que antes)
# ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/config")
def get_config():
    return get_or_create_config()

@app.post("/config")
async def save_config(request: Request):
    data = await request.json()
    with open(CONFIG_FILE, "w") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)
    return {"status": "saved"}

@app.post("/analyze")
async def analyze(
    file: UploadFile = File(...),
    material: str = Query("pla"),
    infill: float = Query(0.20),
    fail_rate: float = Query(0.05),
    margin: float = Query(0.30),
    machine_cost_h: float = Query(0.50),
    labor_cost_h: float = Query(5.0),
    qty: int = Query(1),
):
    suffix = os.path.splitext(file.filename)[1].lower()
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        tmp.write(await file.read())
        tmp_path = tmp.name
    try:
        if suffix in (".step", ".stp"):
            volume_mm3, bbox = load_step(tmp_path)
            is_watertight, faces = True, None
        else:
            mesh = trimesh.load(tmp_path)
            if isinstance(mesh, trimesh.Scene):
                mesh = trimesh.util.concatenate(list(mesh.geometry.values()))
            volume_mm3 = abs(mesh.volume)
            bbox = [round(x, 1) for x in mesh.bounding_box.extents]
            is_watertight = bool(mesh.is_watertight)
            faces = len(mesh.faces)
    finally:
        os.unlink(tmp_path)

    volume_cm3 = volume_mm3 / 1000
    config = get_or_create_config()
    mat = next((m for m in config["materials"] if m["id"] == material), config["materials"][0])

    shell_fraction = 0.25
    eff_vol = volume_cm3 * (shell_fraction + (1 - shell_fraction) * infill)
    weight_g = eff_vol * mat["density"]
    mat_cost = (weight_g / 1000) * mat["price"]
    print_time_h = (volume_cm3 * 0.12) / (infill + 0.3)
    machine_cost = print_time_h * machine_cost_h
    labor_cost = (print_time_h * 0.2 + 0.5) * labor_cost_h
    fail_coeff = 1 / (1 - fail_rate) if fail_rate < 1 else 2.0
    subtotal = (mat_cost + machine_cost + labor_cost) * fail_coeff
    price_unit = subtotal * (1 + margin)
    price_total = price_unit * qty

    return {
        "file": file.filename, "material": mat["name"],
        "geometry": {"volume_cm3": round(volume_cm3, 3), "weight_g": round(weight_g, 2),
                     "bounding_box_mm": bbox, "is_watertight": is_watertight, "faces": faces, "format": suffix},
        "print": {"infill_pct": round(infill * 100), "estimated_time_h": round(print_time_h, 2)},
        "costs": {"material": round(mat_cost, 3), "machine": round(machine_cost, 3), "labor": round(labor_cost, 3),
                  "fail_coeff": round(fail_coeff, 4), "margin_pct": round(margin * 100)},
        "price_unit": round(price_unit, 2), "price_total": round(price_total, 2), "qty": qty,
    }

# ──────────────────────────────────────────────────────────────────
# TRABAJOS / HISTORIAL (persistencia real)
# ──────────────────────────────────────────────────────────────────

@app.post("/trabajos")
async def crear_trabajo(request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("""INSERT INTO trabajos
        (nombre, material, impresora, volumen_cm3, tiempo_estimado_h, tiempo_real_h,
         precio_sin_iva, precio_con_iva, precio_cobrado, ganancia, fallo, notas)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        (d.get("nombre"), d.get("material"), d.get("impresora"), d.get("volumen_cm3"),
         d.get("tiempo_estimado_h"), d.get("tiempo_real_h"), d.get("precio_sin_iva"),
         d.get("precio_con_iva"), d.get("precio_cobrado"), d.get("ganancia"),
         d.get("fallo"), d.get("notas")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/trabajos")
def listar_trabajos():
    conn = get_db()
    rows = conn.execute("SELECT * FROM trabajos ORDER BY fecha DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# AMORTIZACIÓN
# ──────────────────────────────────────────────────────────────────

@app.post("/amortizacion")
async def guardar_amortizacion(request: Request):
    d = await request.json()
    conn = get_db()
    conn.execute("""INSERT INTO amortizacion (printer_id, coste_compra, vida_util_h, mantenimiento_mes)
        VALUES (?,?,?,?)
        ON CONFLICT(printer_id) DO UPDATE SET
        coste_compra=excluded.coste_compra, vida_util_h=excluded.vida_util_h,
        mantenimiento_mes=excluded.mantenimiento_mes""",
        (d["printer_id"], d.get("coste_compra"), d.get("vida_util_h"), d.get("mantenimiento_mes")))
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.get("/amortizacion")
def listar_amortizacion():
    conn = get_db()
    rows = conn.execute("SELECT * FROM amortizacion").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# CONSUMIBLES
# ──────────────────────────────────────────────────────────────────

@app.post("/consumibles")
async def crear_consumible(request: Request):
    d = await request.json()
    conn = get_db()
    conn.execute("""INSERT INTO consumibles (fecha, printer_id, tipo, descripcion, coste)
        VALUES (?,?,?,?,?)""",
        (d.get("fecha"), d.get("printer_id"), d.get("tipo"), d.get("descripcion"), d.get("coste")))
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.get("/consumibles")
def listar_consumibles():
    conn = get_db()
    rows = conn.execute("SELECT * FROM consumibles ORDER BY fecha DESC").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# STOCK
# ──────────────────────────────────────────────────────────────────

@app.post("/stock/entrada")
async def stock_entrada(request: Request):
    d = await request.json()
    mat_id, qty, coste = d["material_id"], float(d["cantidad"]), float(d.get("coste_total") or 0)
    conn = get_db()
    row = conn.execute("SELECT * FROM stock_materiales WHERE material_id=?", (mat_id,)).fetchone()
    if row:
        nueva_cant = row["cantidad"] + qty
        valor_actual = row["cantidad"] * row["precio_medio"]
        nuevo_precio_medio = (valor_actual + coste) / nueva_cant if nueva_cant else 0
        conn.execute("UPDATE stock_materiales SET cantidad=?, precio_medio=? WHERE material_id=?",
                     (nueva_cant, nuevo_precio_medio, mat_id))
    else:
        precio_medio = coste / qty if qty else 0
        conn.execute("INSERT INTO stock_materiales (material_id, cantidad, precio_medio) VALUES (?,?,?)",
                     (mat_id, qty, precio_medio))
    conn.execute("INSERT INTO stock_movimientos (material_id, tipo, cantidad, coste_total, notas) VALUES (?,?,?,?,?)",
                 (mat_id, "entrada", qty, coste, d.get("notas")))
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.post("/stock/salida")
async def stock_salida(request: Request):
    d = await request.json()
    mat_id, qty = d["material_id"], float(d["cantidad"])
    conn = get_db()
    row = conn.execute("SELECT * FROM stock_materiales WHERE material_id=?", (mat_id,)).fetchone()
    nueva_cant = (row["cantidad"] - qty) if row else -qty
    if row:
        conn.execute("UPDATE stock_materiales SET cantidad=? WHERE material_id=?", (nueva_cant, mat_id))
    else:
        conn.execute("INSERT INTO stock_materiales (material_id, cantidad) VALUES (?,?)", (mat_id, nueva_cant))
    conn.execute("INSERT INTO stock_movimientos (material_id, tipo, cantidad, notas) VALUES (?,?,?,?)",
                 (mat_id, "salida", qty, d.get("notas")))
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.get("/stock")
def listar_stock():
    conn = get_db()
    rows = conn.execute("SELECT * FROM stock_materiales").fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# CLIENTES / CONTACTOS
# ──────────────────────────────────────────────────────────────────

@app.post("/clientes")
async def crear_cliente(request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("INSERT INTO clientes (nombre, empresa, contacto_email, contacto_telefono) VALUES (?,?,?,?)",
                        (d["nombre"], d.get("empresa"), d.get("contacto_email"), d.get("contacto_telefono")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/clientes")
def listar_clientes():
    conn = get_db()
    rows = conn.execute("SELECT * FROM clientes ORDER BY nombre").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/clientes/{cliente_id}")
def detalle_cliente(cliente_id: int):
    conn = get_db()
    row = conn.execute("SELECT * FROM clientes WHERE id=?", (cliente_id,)).fetchone()
    conn.close()
    if not row:
        raise HTTPException(404, "Cliente no encontrado")
    return dict(row)

@app.post("/clientes/{cliente_id}/contactos")
async def crear_contacto(cliente_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("INSERT INTO contactos (cliente_id, nombre, email, telefono) VALUES (?,?,?,?)",
                        (cliente_id, d["nombre"], d.get("email"), d.get("telefono")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/clientes/{cliente_id}/contactos")
def listar_contactos(cliente_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM contactos WHERE cliente_id=? ORDER BY nombre", (cliente_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# PROYECTOS
# ──────────────────────────────────────────────────────────────────

def generar_codigo(conn, tipo: str) -> str:
    if tipo not in TIPOS_TRABAJO:
        raise HTTPException(400, f"Tipo de trabajo inválido: {tipo}")
    anio = datetime.date.today().year
    conn.execute("""INSERT INTO contadores_codigo (tipo, anio, ultimo_numero) VALUES (?,?,1)
        ON CONFLICT(tipo, anio) DO UPDATE SET ultimo_numero = ultimo_numero + 1""", (tipo, anio))
    row = conn.execute("SELECT ultimo_numero FROM contadores_codigo WHERE tipo=? AND anio=?", (tipo, anio)).fetchone()
    numero = row["ultimo_numero"]
    return f"{tipo}-{anio}-{numero:03d}"

def crear_estructura_nextcloud(codigo: str, cliente_nombre: str) -> str:
    nc_url  = os.environ.get("NC_URL", "")
    nc_user = os.environ.get("NC_USER", "")
    nc_pass = os.environ.get("NC_PASS", "")
    nc_base = os.environ.get("NC_BASE_PATH", "/remote.php/dav/files/App/Proyectos")

    if not nc_url:
        # Sin configuración de Nextcloud, devolvemos ruta lógica sin crear nada
        return f"/Proyectos/{codigo} - {cliente_nombre}"

    carpeta = f"{codigo} - {cliente_nombre}"
    carpeta_enc = urllib.parse.quote(carpeta)
    base = f"{nc_url}{nc_base}/{carpeta_enc}"
    auth = (nc_user, nc_pass)
    rutas = [
        base,
        f"{base}/trabajo",
        f"{base}/intercambio",
        f"{base}/intercambio/entrada",
        f"{base}/intercambio/salida",
    ]
    for ruta in rutas:
        try:
            r = requests.request("MKCOL", ruta, auth=auth, verify=False, timeout=10)
            # 201 = creada, 405 = ya existía — ambas son OK
            if r.status_code not in (201, 405):
                print(f"[NC] Warning MKCOL {ruta} → {r.status_code}")
        except Exception as e:
            print(f"[NC] Error creando {ruta}: {e}")

    ruta_base = f"/Proyectos/{carpeta}"
    return ruta_base

@app.post("/proyectos")
async def crear_proyecto(request: Request):
    d = await request.json()
    if d.get("tipo_trabajo") not in TIPOS_TRABAJO:
        raise HTTPException(400, f"tipo_trabajo debe ser uno de {TIPOS_TRABAJO}")
    if d.get("marca") not in MARCAS:
        raise HTTPException(400, f"marca debe ser una de {MARCAS}")

    conn = get_db()
    codigo = generar_codigo(conn, d["tipo_trabajo"])

    cliente = conn.execute("SELECT nombre FROM clientes WHERE id=?", (d.get("cliente_id"),)).fetchone()
    cliente_nombre = cliente["nombre"] if cliente else "SinCliente"
    ruta_nextcloud = crear_estructura_nextcloud(codigo, cliente_nombre)

    cur = conn.execute("""INSERT INTO proyectos
        (codigo, nombre, cliente_id, contacto_id, marca, tipo_trabajo, estado,
         fecha_entrega_compromiso, ruta_nextcloud, notas)
        VALUES (?,?,?,?,?,?,?,?,?,?)""",
        (codigo, d.get("nombre"), d.get("cliente_id"), d.get("contacto_id"),
         d["marca"], d["tipo_trabajo"], d.get("estado", "presupuestado"),
         d.get("fecha_entrega_compromiso"), ruta_nextcloud, d.get("notas")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id, "codigo": codigo, "ruta_nextcloud": ruta_nextcloud}

@app.get("/proyectos")
def listar_proyectos(cliente_id: int = None, marca: str = None, tipo_trabajo: str = None, estado: str = None):
    query = "SELECT * FROM proyectos WHERE 1=1"
    params = []
    if cliente_id: query += " AND cliente_id=?"; params.append(cliente_id)
    if marca: query += " AND marca=?"; params.append(marca)
    if tipo_trabajo: query += " AND tipo_trabajo=?"; params.append(tipo_trabajo)
    if estado: query += " AND estado=?"; params.append(estado)
    query += " ORDER BY fecha_alta DESC"
    conn = get_db()
    rows = conn.execute(query, params).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/proyectos/{proyecto_id}")
def detalle_proyecto(proyecto_id: int):
    conn = get_db()
    proyecto = conn.execute("SELECT * FROM proyectos WHERE id=?", (proyecto_id,)).fetchone()
    if not proyecto:
        conn.close()
        raise HTTPException(404, "Proyecto no encontrado")
    presupuestos = conn.execute("SELECT * FROM presupuestos WHERE proyecto_id=? ORDER BY version", (proyecto_id,)).fetchall()
    facturas = conn.execute("SELECT * FROM facturas WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    horas = conn.execute("SELECT * FROM horas WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    gastos = conn.execute("SELECT * FROM gastos WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    conn.close()
    return {
        "proyecto": dict(proyecto),
        "presupuestos": [dict(r) for r in presupuestos],
        "facturas": [dict(r) for r in facturas],
        "horas": [dict(r) for r in horas],
        "gastos": [dict(r) for r in gastos],
    }

@app.patch("/proyectos/{proyecto_id}")
async def editar_proyecto(proyecto_id: int, request: Request):
    d = await request.json()
    campos_permitidos = ["nombre", "estado", "fecha_entrega_compromiso", "fecha_entrega_real",
                          "fecha_facturacion", "fecha_cobro", "contacto_id"]
    sets, params = [], []
    for campo in campos_permitidos:
        if campo in d:
            sets.append(f"{campo}=?")
            params.append(d[campo])
    if not sets:
        raise HTTPException(400, "Nada que actualizar")
    params.append(proyecto_id)
    conn = get_db()
    conn.execute(f"UPDATE proyectos SET {', '.join(sets)} WHERE id=?", params)
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.patch("/proyectos/{proyecto_id}/imagen")
async def actualizar_imagen(proyecto_id: int, request: Request):
    d = await request.json()
    # STUB: la subida real del archivo a Nextcloud (trabajo/) se conecta más adelante
    conn = get_db()
    conn.execute("UPDATE proyectos SET imagen_portada_ruta=? WHERE id=?", (d.get("ruta"), proyecto_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.patch("/proyectos/{proyecto_id}/notas")
async def actualizar_notas(proyecto_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    conn.execute("UPDATE proyectos SET notas=? WHERE id=?", (d.get("notas"), proyecto_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}

# ──────────────────────────────────────────────────────────────────
# PRESUPUESTOS / FACTURAS / HORAS (por proyecto)
# ──────────────────────────────────────────────────────────────────

@app.get("/tarifas")
def listar_tarifas():
    conn = get_db()
    rows = conn.execute("SELECT * FROM tarifas_horas").fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/tarifas")
async def actualizar_tarifa(request: Request):
    d = await request.json()
    conn = get_db()
    conn.execute("""INSERT INTO tarifas_horas (tipo_hora, precio_hora) VALUES (?,?)
        ON CONFLICT(tipo_hora) DO UPDATE SET precio_hora=excluded.precio_hora""",
        (d["tipo_hora"], d["precio_hora"]))
    conn.commit()
    conn.close()
    return {"status": "saved"}

@app.post("/proyectos/{proyecto_id}/presupuestos")
async def crear_presupuesto(proyecto_id: int, request: Request):
    d = await request.json() if await request.body() else {}
    conn = get_db()
    ultima = conn.execute("SELECT MAX(version) as v FROM presupuestos WHERE proyecto_id=?", (proyecto_id,)).fetchone()
    version = (ultima["v"] or 0) + 1
    cur = conn.execute("INSERT INTO presupuestos (proyecto_id, version, estado) VALUES (?,?,?)",
                        (proyecto_id, version, d.get("estado", "borrador")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id, "version": version}

@app.get("/proyectos/{proyecto_id}/presupuestos")
def listar_presupuestos(proyecto_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM presupuestos WHERE proyecto_id=? ORDER BY version", (proyecto_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.get("/presupuestos/{presupuesto_id}")
def detalle_presupuesto(presupuesto_id: int):
    conn = get_db()
    presupuesto = conn.execute("SELECT * FROM presupuestos WHERE id=?", (presupuesto_id,)).fetchone()
    if not presupuesto:
        conn.close()
        raise HTTPException(404, "Presupuesto no encontrado")
    lineas = conn.execute("SELECT * FROM presupuesto_lineas WHERE presupuesto_id=? ORDER BY id", (presupuesto_id,)).fetchall()
    conn.close()
    return {"presupuesto": dict(presupuesto), "lineas": [dict(r) for r in lineas]}

def _recalcular_total_presupuesto(conn, presupuesto_id: int):
    total = conn.execute("SELECT COALESCE(SUM(importe),0) as t FROM presupuesto_lineas WHERE presupuesto_id=?",
                          (presupuesto_id,)).fetchone()["t"]
    conn.execute("UPDATE presupuestos SET importe=? WHERE id=?", (total, presupuesto_id))
    return total

@app.post("/presupuestos/{presupuesto_id}/lineas")
async def crear_linea_presupuesto(presupuesto_id: int, request: Request):
    d = await request.json()
    cantidad = float(d.get("cantidad", 1))
    precio_unitario = float(d.get("precio_unitario", 0))
    importe = round(cantidad * precio_unitario, 2)
    conn = get_db()
    cur = conn.execute("""INSERT INTO presupuesto_lineas (presupuesto_id, tipo, descripcion, cantidad, precio_unitario, importe)
        VALUES (?,?,?,?,?,?)""",
        (presupuesto_id, d.get("tipo"), d.get("descripcion"), cantidad, precio_unitario, importe))
    conn.commit()
    new_id = cur.lastrowid
    total = _recalcular_total_presupuesto(conn, presupuesto_id)
    conn.commit()
    conn.close()
    return {"status": "saved", "id": new_id, "importe": importe, "total_presupuesto": total}

@app.delete("/presupuestos/{presupuesto_id}/lineas/{linea_id}")
def borrar_linea_presupuesto(presupuesto_id: int, linea_id: int):
    conn = get_db()
    conn.execute("DELETE FROM presupuesto_lineas WHERE id=? AND presupuesto_id=?", (linea_id, presupuesto_id))
    conn.commit()
    total = _recalcular_total_presupuesto(conn, presupuesto_id)
    conn.commit()
    conn.close()
    return {"status": "deleted", "total_presupuesto": total}

@app.patch("/presupuestos/{presupuesto_id}")
async def editar_presupuesto(presupuesto_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    if "estado" in d:
        conn.execute("UPDATE presupuestos SET estado=? WHERE id=?", (d["estado"], presupuesto_id))
    conn.commit()
    conn.close()
    return {"status": "updated"}

@app.post("/proyectos/{proyecto_id}/facturas")
async def crear_factura(proyecto_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("""INSERT INTO facturas (proyecto_id, numero, importe, fecha, estado_cobro, referencia_archivo)
        VALUES (?,?,?,?,?,?)""",
        (proyecto_id, d.get("numero"), d.get("importe"), d.get("fecha"), d.get("estado_cobro"), d.get("referencia_archivo")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/proyectos/{proyecto_id}/facturas")
def listar_facturas(proyecto_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM facturas WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/proyectos/{proyecto_id}/horas")
async def crear_hora(proyecto_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("""INSERT INTO horas (proyecto_id, fecha, tipo_trabajo_hora, horas, descripcion)
        VALUES (?,?,?,?,?)""",
        (proyecto_id, d.get("fecha"), d.get("tipo_trabajo_hora"), d.get("horas"), d.get("descripcion")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/proyectos/{proyecto_id}/horas")
def listar_horas(proyecto_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM horas WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

@app.post("/proyectos/{proyecto_id}/gastos")
async def crear_gasto(proyecto_id: int, request: Request):
    d = await request.json()
    conn = get_db()
    cur = conn.execute("""INSERT INTO gastos (proyecto_id, fecha, descripcion, importe)
        VALUES (?,?,?,?)""",
        (proyecto_id, d.get("fecha"), d.get("descripcion"), d.get("importe")))
    conn.commit()
    new_id = cur.lastrowid
    conn.close()
    return {"status": "saved", "id": new_id}

@app.get("/proyectos/{proyecto_id}/gastos")
def listar_gastos(proyecto_id: int):
    conn = get_db()
    rows = conn.execute("SELECT * FROM gastos WHERE proyecto_id=? ORDER BY fecha", (proyecto_id,)).fetchall()
    conn.close()
    return [dict(r) for r in rows]

# ──────────────────────────────────────────────────────────────────
# TABLERO KANBAN
# ──────────────────────────────────────────────────────────────────

@app.get("/tablero")
def tablero():
    conn = get_db()
    rows = conn.execute("""
        SELECT p.*, c.nombre as cliente_nombre
        FROM proyectos p LEFT JOIN clientes c ON p.cliente_id = c.id
        WHERE p.estado != 'rechazado'
        ORDER BY p.fecha_alta DESC
    """).fetchall()
    conn.close()
    columnas = {estado: [] for estado in ESTADOS_PROYECTO if estado != "rechazado"}
    for r in rows:
        columnas.setdefault(r["estado"], []).append(dict(r))
    return columnas

# ──────────────────────────────────────────────────────────
# EXPORTAR PRESUPUESTO A WORD
# ──────────────────────────────────────────────────────────

from fastapi.responses import StreamingResponse
from docx import Document as DocxDocument
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.enum.table import WD_TABLE_ALIGNMENT, WD_ALIGN_VERTICAL
from docx.oxml.ns import qn
from docx.oxml import OxmlElement

INK_COLOR   = RGBColor(0x07, 0x52, 0x79)
GREY_T_COLOR = RGBColor(0x6B, 0x72, 0x80)
GREY_L_COLOR = RGBColor(0xF4, 0xF5, 0xF8)
BLACK_COLOR  = RGBColor(0x22, 0x25, 0x31)

def _set_cell_bg(cell, rgb):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    shd = OxmlElement('w:shd')
    hex_color = f'{rgb[0]:02X}{rgb[1]:02X}{rgb[2]:02X}'
    shd.set(qn('w:val'), 'clear')
    shd.set(qn('w:color'), 'auto')
    shd.set(qn('w:fill'), hex_color)
    tcPr.append(shd)

def _set_cell_borders(cell, bottom=True, color='E6E8EF', size=4):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcBorders = OxmlElement('w:tcBorders')
    for side in ['top', 'bottom', 'left', 'right']:
        el = OxmlElement(f'w:{side}')
        if side == 'bottom' and bottom:
            el.set(qn('w:val'), 'single')
            el.set(qn('w:sz'), str(size))
            el.set(qn('w:color'), color)
        else:
            el.set(qn('w:val'), 'none')
            el.set(qn('w:color'), 'auto')
        tcBorders.append(el)
    tcPr.append(tcBorders)

def _set_cell_margins(cell, top=80, bottom=80, left=100, right=100):
    tc = cell._tc
    tcPr = tc.get_or_add_tcPr()
    tcMar = OxmlElement('w:tcMar')
    for side, val in [('top', top), ('bottom', bottom), ('left', left), ('right', right)]:
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:w'), str(val))
        el.set(qn('w:type'), 'dxa')
        tcMar.append(el)
    tcPr.append(tcMar)

def _remove_table_borders(table):
    tbl = table._tbl
    tblPr = tbl.find(qn('w:tblPr'))
    if tblPr is None:
        tblPr = OxmlElement('w:tblPr')
        tbl.insert(0, tblPr)
    tblBorders = OxmlElement('w:tblBorders')
    for side in ['top', 'left', 'bottom', 'right', 'insideH', 'insideV']:
        el = OxmlElement(f'w:{side}')
        el.set(qn('w:val'), 'none')
        tblBorders.append(el)
    existing = tblPr.find(qn('w:tblBorders'))
    if existing is not None:
        tblPr.remove(existing)
    tblPr.append(tblBorders)

def _add_run(para, text, bold=False, italic=False, size=10, color=None):
    run = para.add_run(text)
    run.bold = bold
    run.italic = italic
    run.font.name = 'Calibri'
    run.font.size = Pt(size)
    if color:
        run.font.color.rgb = color
    return run

def _section_header(doc, text, color=None):
    if color is None:
        color = INK_COLOR
    para = doc.add_paragraph()
    para.paragraph_format.space_before = Pt(14)
    para.paragraph_format.space_after = Pt(6)
    pPr = para._p.get_or_add_pPr()
    pBdr = OxmlElement('w:pBdr')
    bottom = OxmlElement('w:bottom')
    bottom.set(qn('w:val'), 'single')
    bottom.set(qn('w:sz'), '10')
    bottom.set(qn('w:color'), f'{color[0]:02X}{color[1]:02X}{color[2]:02X}')
    pBdr.append(bottom)
    pPr.append(pBdr)
    _add_run(para, text, bold=True, size=11, color=color)

TIPO_HORA_LABEL = {
    'ir':             'Ingeniería inversa',
    'diseno':         'Diseño CAD',
    'diseno_organico':'Diseño orgánico',
    'impresion':      'Impresión 3D',
    'reunion':        'Reunión',
    'montaje':        'Montaje',
    'km':             'Kilometraje',
    'impresion_3d':   'Impresión 3D',
}

def _label_tipo(tipo_raw: str) -> str:
    """Convierte 'horas_ir' o 'impresion_3d' en texto legible."""
    t = tipo_raw.replace('horas_', '').strip()
    return TIPO_HORA_LABEL.get(t, t.replace('_', ' ').capitalize())

def _build_presupuesto_doc(data: dict, logo_bytes: bytes, tipo_trabajo: str) -> bytes:
    """Construye el documento Word del presupuesto y devuelve bytes."""
    from docx.shared import Inches
    import io as _io

    proyecto   = data['proyecto']
    lineas     = data['lineas']
    cliente_nombre = proyecto.get('cliente_nombre', '')
    contacto_nombre = proyecto.get('contacto_nombre', '')

    # Calcular totales desde las líneas
    subtotal = sum(l.get('importe', 0) or 0 for l in lineas)
    iva_pct  = 0.21
    iva      = round(subtotal * iva_pct, 2)
    total    = round(subtotal + iva, 2)

    # Elegir color de acento según marca
    marca = proyecto.get('marca', 'myrox')
    acento = INK_COLOR if marca == 'myrox' else RGBColor(0x1a, 0x3a, 0x5c)

    # Título según tipo
    titulos = {
        'IR':  'PROPUESTA DE PROYECTO — INGENIERÍA INVERSA',
        'D':   'PROPUESTA DE PROYECTO — DISEÑO',
        'DO':  'PROPUESTA DE PROYECTO — DISEÑO ORGÁNICO',
        'I3D': 'PROPUESTA DE PROYECTO — IMPRESIÓN 3D',
        'MD':  'PROPUESTA DE PROYECTO — ESCANEO 3D',
        'FA':  'PROPUESTA DE PROYECTO — FABRICACIÓN',
    }
    subtitulos = {
        'IR':  'Ingeniería de Precisión · Reverse Engineering',
        'D':   'Diseño CAD · Ingeniería',
        'DO':  'Arte · Diseño · Fabricación Aditiva',
        'I3D': 'Fabricación Aditiva · Postprocesado',
        'MD':  'Escaneo 3D · Metrología',
        'FA':  'Fabricación CNC · Conjuntos',
    }
    titulo    = titulos.get(tipo_trabajo, 'PROPUESTA DE PROYECTO')
    subtitulo = subtitulos.get(tipo_trabajo, 'Ingeniería de Precisión')
    marca_nombre = 'MW 3D Studio' if marca == 'mw3d' else 'Myrox Lab'
    web = 'mw3dstudio.com' if marca == 'mw3d' else 'myrox.es'

    fecha_raw = proyecto.get('fecha_alta', '')[:10] if proyecto.get('fecha_alta') else ''
    # Convertir 2026-07-06 → 06/07/2026
    try:
        from datetime import datetime as _dt
        fecha = _dt.strptime(fecha_raw, '%Y-%m-%d').strftime('%d/%m/%Y')
    except:
        fecha = fecha_raw
    ref   = proyecto.get('codigo', '')

    doc = DocxDocument()
    section = doc.sections[0]
    section.page_width  = Cm(21)
    section.page_height = Cm(29.7)
    section.left_margin = section.right_margin = Cm(2)
    section.top_margin  = section.bottom_margin = Cm(2)

    style = doc.styles['Normal']
    style.font.name = 'Calibri'
    style.font.size = Pt(10)

    # CABECERA
    tbl = doc.add_table(rows=1, cols=2)
    tbl.alignment = WD_TABLE_ALIGNMENT.LEFT
    _remove_table_borders(tbl)
    logo_cell = tbl.cell(0, 0)
    logo_cell.width = Cm(6)
    lp = logo_cell.paragraphs[0]
    lp.paragraph_format.space_after = Pt(0)
    run = lp.add_run()
    run.add_picture(_io.BytesIO(logo_bytes), width=Cm(5.2))
    txt_cell = tbl.cell(0, 1)
    txt_cell.vertical_alignment = WD_ALIGN_VERTICAL.CENTER
    _set_cell_margins(txt_cell, top=0, bottom=0, left=200, right=0)
    p1 = txt_cell.paragraphs[0]
    p1.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p1.paragraph_format.space_after = Pt(2)
    _add_run(p1, titulo, bold=True, size=13, color=acento)
    p2 = txt_cell.add_paragraph()
    p2.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p2.paragraph_format.space_after = Pt(6)
    _add_run(p2, subtitulo, size=8, color=GREY_T_COLOR)
    p3 = txt_cell.add_paragraph()
    p3.alignment = WD_ALIGN_PARAGRAPH.RIGHT
    p3.paragraph_format.space_after = Pt(0)
    _add_run(p3, f'Ref: {ref}   ·   Fecha: {fecha}', size=9, color=GREY_T_COLOR)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 1. DATOS
    _section_header(doc, '1. DATOS DEL PROYECTO', acento)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    datos = [
        ('Nombre del proyecto', proyecto.get('nombre', '')),
        ('Cliente / Empresa',   cliente_nombre),
        ('Persona de contacto', contacto_nombre),
        ('Fecha',               fecha),
    ]
    t = doc.add_table(rows=len(datos), cols=2)
    _remove_table_borders(t)
    for i, (lbl, val) in enumerate(datos):
        c0, c1 = t.rows[i].cells
        c0.width = Cm(4.5); c1.width = Cm(12.5)
        _set_cell_bg(c0, GREY_L_COLOR)
        _set_cell_borders(c0); _set_cell_borders(c1)
        _set_cell_margins(c0); _set_cell_margins(c1)
        p0 = c0.paragraphs[0]; p0.paragraph_format.space_after = Pt(0)
        _add_run(p0, lbl, bold=True, size=9, color=GREY_T_COLOR)
        p1 = c1.paragraphs[0]; p1.paragraph_format.space_after = Pt(0)
        _add_run(p1, val, size=10, color=BLACK_COLOR)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 2. DESCRIPCIÓN
    _section_header(doc, '2. DESCRIPCIÓN GENERAL DEL ENCARGO', acento)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    p_desc = doc.add_paragraph()
    p_desc.paragraph_format.space_after = Pt(4)
    _add_run(p_desc, proyecto.get('notas', '—'), italic=True, size=10, color=GREY_T_COLOR)

    # 3. TABLA LÍNEAS
    es_i3d = tipo_trabajo == 'I3D'
    _section_header(doc, '3. DETALLE DE LA IMPRESIÓN' if es_i3d else '3. DESGLOSE DE TRABAJO', acento)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    acento_hex = f'{acento[0]:02X}{acento[1]:02X}{acento[2]:02X}'

    if es_i3d:
        hdrs = ['Pieza / Descripción', 'Material', 'Uds.', 'Tiempo est.', 'Importe']
        widths = [Cm(6.0), Cm(3.5), Cm(1.4), Cm(2.0), Cm(4.1)]
        n_rows = 1 + len(lineas) + 3
        tl = doc.add_table(rows=n_rows, cols=5)
        _remove_table_borders(tl)
        for j, (h, w) in enumerate(zip(hdrs, widths)):
            c = tl.cell(0, j); c.width = w
            _set_cell_borders(c, bottom=True, color=acento_hex, size=8)
            _set_cell_margins(c, top=60, bottom=60, left=60, right=60)
            p = c.paragraphs[0]; p.paragraph_format.space_after = Pt(0)
            p.alignment = WD_ALIGN_PARAGRAPH.RIGHT if j >= 3 else WD_ALIGN_PARAGRAPH.LEFT
            _add_run(p, h, bold=True, size=9, color=acento)
        for i, l in enumerate(lineas):
            ri = i + 1
            vals = [l.get('descripcion',''), l.get('descripcion','').split('—')[-1].strip() if '—' in l.get('descripcion','') else '',
                    str(l.get('cantidad',1)), f"{l.get('cantidad',0):.1f} h" if l.get('cantidad') else '—',
                    f"{l.get('importe',0):.2f} €"]
            # Para I3D usamos descripcion y tipo como material
            vals = [l.get('descripcion',''), _label_tipo(l.get('tipo','')),
                    str(int(l.get('cantidad',1))), '—', f"{l.get('importe',0):.2f} €"]
            aligns = ['LEFT','LEFT','CENTER','RIGHT','RIGHT']
            bolds  = [False,False,False,False,True]
            italics= [False,True,False,False,False]
            colors = [BLACK_COLOR,GREY_T_COLOR,BLACK_COLOR,BLACK_COLOR,BLACK_COLOR]
            for j,(v,al,bo,it,co,w) in enumerate(zip(vals,aligns,bolds,italics,colors,widths)):
                c = tl.cell(ri,j); c.width=w
                _set_cell_borders(c); _set_cell_margins(c, top=60,bottom=60,left=60,right=60)
                p=c.paragraphs[0]; p.paragraph_format.space_after=Pt(0)
                p.alignment=getattr(WD_ALIGN_PARAGRAPH,al)
                _add_run(p,v,bold=bo,italic=it,size=10,color=co)
        tot_rows = [('Subtotal (sin IVA)', f'{subtotal:.2f} €', False),
                    ('IVA 21%', f'{iva:.2f} €', False), ('TOTAL', f'{total:.2f} €', True)]
        base = 1+len(lineas)
        for k,(lbl,val,big) in enumerate(tot_rows):
            ri=base+k
            a=tl.cell(ri,0); a.merge(tl.cell(ri,1))
            b=tl.cell(ri,2); b.merge(tl.cell(ri,3)); b.merge(tl.cell(ri,4))
            bc = acento_hex if big else 'E6E8EF'
            _set_cell_borders(a,bottom=True,color=bc,size=8 if big else 4)
            _set_cell_borders(b,bottom=True,color=bc,size=8 if big else 4)
            if big: _set_cell_bg(a,GREY_L_COLOR); _set_cell_bg(b,GREY_L_COLOR)
            _set_cell_margins(a); _set_cell_margins(b)
            pa=a.paragraphs[0]; pa.paragraph_format.space_after=Pt(0)
            _add_run(pa,lbl,bold=big,size=9,color=acento if big else GREY_T_COLOR)
            pb=b.paragraphs[0]; pb.paragraph_format.space_after=Pt(0)
            pb.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            _add_run(pb,val,bold=big,size=11 if big else 10,color=acento if big else BLACK_COLOR)
    else:
        hdrs = ['Descripción', 'Detalle / Observaciones', 'Uds.', 'Horas', '€/h', 'Importe']
        widths = [Cm(5.5), Cm(5.0), Cm(1.4), Cm(1.5), Cm(1.4), Cm(2.2)]
        n_rows = 1 + len(lineas) + 4
        tl = doc.add_table(rows=n_rows, cols=6)
        _remove_table_borders(tl)
        for j,(h,w) in enumerate(zip(hdrs,widths)):
            c=tl.cell(0,j); c.width=w
            _set_cell_borders(c,bottom=True,color=acento_hex,size=8)
            _set_cell_margins(c,top=60,bottom=60,left=60,right=60)
            p=c.paragraphs[0]; p.paragraph_format.space_after=Pt(0)
            p.alignment=WD_ALIGN_PARAGRAPH.RIGHT if j>=3 else WD_ALIGN_PARAGRAPH.LEFT
            _add_run(p,h,bold=True,size=9,color=acento)
        tarifa_unica = None
        for i,l in enumerate(lineas):
            ri=i+1
            pu = l.get('precio_unitario',0) or 0
            if pu and not tarifa_unica: tarifa_unica = pu
            vals=[l.get('descripcion',''),'',str(int(l.get('cantidad',1))),
                  str(l.get('cantidad','')),
                  f"{pu:.2f} €" if pu else '',
                  f"{l.get('importe',0):.2f} €"]
            # horas reales: para líneas de tipo 'horas_X', la cantidad = horas
            vals=[l.get('descripcion',''), _label_tipo(l.get('tipo','')),
                  '1', str(int(l.get('cantidad',0))) if l.get('cantidad') else '',
                  f"{pu:.2f} €" if pu else '',
                  f"{l.get('importe',0):.2f} €"]
            aligns=['LEFT','LEFT','CENTER','CENTER','RIGHT','RIGHT']
            bolds=[False,False,False,False,False,True]
            italics=[False,True,False,False,False,False]
            colors=[BLACK_COLOR,GREY_T_COLOR,BLACK_COLOR,BLACK_COLOR,BLACK_COLOR,BLACK_COLOR]
            for j,(v,al,bo,it,co,w) in enumerate(zip(vals,aligns,bolds,italics,colors,widths)):
                c=tl.cell(ri,j); c.width=w
                _set_cell_borders(c); _set_cell_margins(c,top=60,bottom=60,left=60,right=60)
                p=c.paragraphs[0]; p.paragraph_format.space_after=Pt(0)
                p.alignment=getattr(WD_ALIGN_PARAGRAPH,al)
                _add_run(p,v,bold=bo,italic=it,size=10,color=co)
        tot_rows = [
            ('Tarifa aplicada', f'{tarifa_unica:.2f} €/h' if tarifa_unica else '—', False),
            ('Subtotal (sin IVA)', f'{subtotal:.2f} €', False),
            ('IVA 21%', f'{iva:.2f} €', False),
            ('TOTAL', f'{total:.2f} €', True),
        ]
        base=1+len(lineas)
        for k,(lbl,val,big) in enumerate(tot_rows):
            ri=base+k
            a=tl.cell(ri,0)
            for jj in range(1,3): a.merge(tl.cell(ri,jj))
            b=tl.cell(ri,3)
            for jj in range(4,6): b.merge(tl.cell(ri,jj))
            bc=acento_hex if big else 'E6E8EF'
            _set_cell_borders(a,bottom=True,color=bc,size=8 if big else 4)
            _set_cell_borders(b,bottom=True,color=bc,size=8 if big else 4)
            if big: _set_cell_bg(a,GREY_L_COLOR); _set_cell_bg(b,GREY_L_COLOR)
            _set_cell_margins(a); _set_cell_margins(b)
            pa=a.paragraphs[0]; pa.paragraph_format.space_after=Pt(0)
            _add_run(pa,lbl,bold=big,size=9,color=acento if big else GREY_T_COLOR)
            pb=b.paragraphs[0]; pb.paragraph_format.space_after=Pt(0)
            pb.alignment=WD_ALIGN_PARAGRAPH.RIGHT
            _add_run(pb,val,bold=big,size=11 if big else 10,color=acento if big else BLACK_COLOR)

    doc.add_paragraph().paragraph_format.space_after = Pt(4)

    # 4. CONDICIONES
    _section_header(doc, '4. CONDICIONES DE PAGO Y ENTREGA', acento)
    doc.add_paragraph().paragraph_format.space_after = Pt(4)
    cond = [('Forma de pago','30 días desde factura'),('Plazo de entrega','A convenir'),
            ('Validez oferta','30 días desde la fecha de emisión'),('Observaciones','')]
    tc2 = doc.add_table(rows=len(cond), cols=2)
    _remove_table_borders(tc2)
    for i,(lbl,val) in enumerate(cond):
        c0,c1=tc2.rows[i].cells
        c0.width=Cm(4.5); c1.width=Cm(12.5)
        _set_cell_bg(c0,GREY_L_COLOR)
        _set_cell_borders(c0); _set_cell_borders(c1)
        _set_cell_margins(c0); _set_cell_margins(c1)
        p0=c0.paragraphs[0]; p0.paragraph_format.space_after=Pt(0)
        _add_run(p0,lbl,bold=True,size=9,color=GREY_T_COLOR)
        p1=c1.paragraphs[0]; p1.paragraph_format.space_after=Pt(0)
        _add_run(p1,val,italic=True,size=10,color=BLACK_COLOR)

    nota=doc.add_paragraph()
    nota.paragraph_format.space_before=Pt(10); nota.paragraph_format.space_after=Pt(0)
    _add_run(nota,'Este presupuesto no constituye compromiso de servicio hasta confirmación formal por escrito.',italic=True,size=8,color=GREY_T_COLOR)

    # PIE
    ft_section = doc.sections[0]
    footer = ft_section.footer
    for p in footer.paragraphs: p.clear()
    ft=footer.paragraphs[0]
    ft.paragraph_format.space_before=Pt(4); ft.paragraph_format.space_after=Pt(0)
    pPr=ft._p.get_or_add_pPr()
    pBdr=OxmlElement('w:pBdr')
    top_el=OxmlElement('w:top')
    top_el.set(qn('w:val'),'single'); top_el.set(qn('w:sz'),'4'); top_el.set(qn('w:color'),'E6E8EF')
    pBdr.append(top_el); pPr.append(pBdr)
    _add_run(ft,f'{marca_nombre}   ·   {web}',size=8,color=GREY_T_COLOR)

    buf = _io.BytesIO()
    doc.save(buf)
    buf.seek(0)
    return buf.read()


def _descargar_logo_nextcloud(marca: str) -> bytes:
    """Descarga el logo correcto de Nextcloud según la marca."""
    nc_url  = os.environ.get("NC_URL", "")
    nc_user = os.environ.get("NC_USER", "")
    nc_pass = os.environ.get("NC_PASS", "")

    # Intentar obtener logo de Nextcloud; si falla usar los logos locales embebidos
    logo_file = "logo_mw3d_doc.png" if marca == "mw3d" else "logo_myrox_doc.png"
    local_path = f"/opt/print3d/{logo_file}"
    if os.path.exists(local_path):
        with open(local_path, "rb") as f:
            return f.read()
    raise FileNotFoundError(f"Logo no encontrado: {local_path}")


@app.get("/presupuestos/{presupuesto_id}/exportar")
def exportar_presupuesto(presupuesto_id: int):
    conn = get_db()
    presupuesto = conn.execute("SELECT * FROM presupuestos WHERE id=?", (presupuesto_id,)).fetchone()
    if not presupuesto:
        conn.close()
        raise HTTPException(404, "Presupuesto no encontrado")

    lineas = conn.execute("SELECT * FROM presupuesto_lineas WHERE presupuesto_id=? ORDER BY id", (presupuesto_id,)).fetchall()
    proyecto = conn.execute("""
        SELECT p.*, c.nombre as cliente_nombre, ct.nombre as contacto_nombre
        FROM proyectos p
        LEFT JOIN clientes c ON p.cliente_id = c.id
        LEFT JOIN contactos ct ON p.contacto_id = ct.id
        WHERE p.id = ?
    """, (presupuesto['proyecto_id'],)).fetchone()
    conn.close()

    if not proyecto:
        raise HTTPException(404, "Proyecto no encontrado")

    tipo_trabajo = proyecto['tipo_trabajo']
    marca        = proyecto['marca'] or 'myrox'

    data = {
        'proyecto': dict(proyecto),
        'lineas':   [dict(l) for l in lineas],
    }

    try:
        logo_bytes = _descargar_logo_nextcloud(marca)
    except Exception as e:
        raise HTTPException(500, f"No se pudo cargar el logo: {e}")

    try:
        docx_bytes = _build_presupuesto_doc(data, logo_bytes, tipo_trabajo)
    except Exception as e:
        raise HTTPException(500, f"Error generando el documento: {e}")

    codigo = proyecto['codigo'] or f"presupuesto_{presupuesto_id}"
    filename = f"Presupuesto_{codigo}_v{presupuesto['version']}.docx"

    return StreamingResponse(
        io.BytesIO(docx_bytes),
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )
