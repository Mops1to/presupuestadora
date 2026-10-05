import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const MARCAS = [
  { id: 'myrox_lab', label: 'Myrox Lab' },
  { id: 'myrox_print', label: 'Myrox Print' },
  { id: 'myrox_works', label: 'Myrox Works' },
  { id: 'myrox_automation', label: 'Myrox Automation' },
  { id: 'mw3d', label: 'MW 3D Studio' },
];

const TIPOS = [
  { id: 'IR', label: 'IR — Ingeniería inversa' },
  { id: 'D', label: 'D — Diseño' },
  { id: 'DO', label: 'DO — Diseño orgánico' },
  { id: 'I3D', label: 'I3D — Impresión 3D' },
  { id: 'MD', label: 'MD — Escaneo 3D' },
  { id: 'FA', label: 'FA — Fabricación' },
];

const TIPOS_HORA = [
  { id: 'ir', label: 'Ingeniería inversa' },
  { id: 'diseno', label: 'Diseño' },
  { id: 'impresion', label: 'Impresión 3D' },
  { id: 'reunion', label: 'Reunión' },
  { id: 'montaje', label: 'Montaje' },
  { id: 'km', label: 'Kilometraje' },
];

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';
const btnClass = 'text-[12.5px] font-semibold rounded-md px-4 py-2 mt-3';

export default function Proyectos() {
  const [clientes, setClientes] = useState([]);
  const [proyectos, setProyectos] = useState([]);

  const [nombre, setNombre] = useState('');
  const [clienteId, setClienteId] = useState('');
  const [clienteNuevo, setClienteNuevo] = useState('');
  const [contactos, setContactos] = useState([]);
  const [contactoId, setContactoId] = useState('');
  const [contactoNuevo, setContactoNuevo] = useState('');
  const [marca, setMarca] = useState('myrox_lab');
  const [tipo, setTipo] = useState('IR');
  const [fechaEntrega, setFechaEntrega] = useState('');
  const [npStatus, setNpStatus] = useState('');

  const [hProyecto, setHProyecto] = useState('');
  const [hTipo, setHTipo] = useState('ir');
  const [hCantidad, setHCantidad] = useState('');
  const [hFecha, setHFecha] = useState('');
  const [hDescripcion, setHDescripcion] = useState('');
  const [hStatus, setHStatus] = useState('');

  const [gProyecto, setGProyecto] = useState('');
  const [gImporte, setGImporte] = useState('');
  const [gFecha, setGFecha] = useState('');
  const [gDescripcion, setGDescripcion] = useState('');
  const [gStatus, setGStatus] = useState('');

  const cargarListas = async () => {
    const [cl, pr] = await Promise.all([api('/clientes'), api('/proyectos')]);
    setClientes(cl);
    setProyectos(pr);
  };

  useEffect(() => { cargarListas(); }, []);

  useEffect(() => {
    if (!clienteId) { setContactos([]); setContactoId(''); return; }
    api(`/clientes/${clienteId}/contactos`).then(setContactos).catch(() => {});
  }, [clienteId]);

  const empresaNuevaEnCurso = !clienteId && clienteNuevo.trim().length > 0;

  async function crearProyecto() {
    setNpStatus('');
    try {
      let clId = clienteId;
      if (!clId && clienteNuevo.trim()) {
        const nuevo = await api('/clientes', { method: 'POST', body: JSON.stringify({ nombre: clienteNuevo.trim(), empresa: clienteNuevo.trim() }) });
        clId = nuevo.id;
      }
      let ctId = contactoId;
      if (ctId === '__nuevo__') {
        if (contactoNuevo.trim() && clId) {
          const nc = await api(`/clientes/${clId}/contactos`, { method: 'POST', body: JSON.stringify({ nombre: contactoNuevo.trim() }) });
          ctId = nc.id;
        } else {
          ctId = '';
        }
      }
      const res = await api('/proyectos', {
        method: 'POST',
        body: JSON.stringify({
          nombre,
          cliente_id: clId || null,
          contacto_id: ctId || null,
          marca,
          tipo_trabajo: tipo,
          fecha_entrega_compromiso: fechaEntrega || null,
        }),
      });
      setNpStatus(`✓ Proyecto creado: ${res.codigo}`);
      setNombre(''); setClienteNuevo(''); setContactoNuevo(''); setContactoId(''); setFechaEntrega('');
      cargarListas();
    } catch (e) { setNpStatus('Error: ' + e.message); }
  }

  async function registrarHoras() {
    if (!hProyecto) { setHStatus('Selecciona un proyecto'); return; }
    try {
      await api(`/proyectos/${hProyecto}/horas`, {
        method: 'POST',
        body: JSON.stringify({ fecha: hFecha || new Date().toISOString().slice(0, 10), tipo_trabajo_hora: hTipo, horas: parseFloat(hCantidad) || 0, descripcion: hDescripcion }),
      });
      setHStatus('✓ Horas registradas');
      setHCantidad(''); setHDescripcion('');
    } catch (e) { setHStatus('Error: ' + e.message); }
  }

  async function registrarGasto() {
    if (!gProyecto) { setGStatus('Selecciona un proyecto'); return; }
    try {
      await api(`/proyectos/${gProyecto}/gastos`, {
        method: 'POST',
        body: JSON.stringify({ fecha: gFecha || new Date().toISOString().slice(0, 10), importe: parseFloat(gImporte) || 0, descripcion: gDescripcion }),
      });
      setGStatus('✓ Gasto registrado');
      setGImporte(''); setGDescripcion('');
    } catch (e) { setGStatus('Error: ' + e.message); }
  }

  return (
    <div className="max-w-4xl">
      <h1 className="text-lg font-semibold text-text mb-4">Proyectos</h1>

      <div className="bg-white border border-border rounded-xl p-5 mb-4">
        <h2 className="text-[13px] font-semibold text-text mb-3">Nuevo proyecto</h2>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <label className="text-[11px] text-text3">Nombre</label>
            <input value={nombre} onChange={e => setNombre(e.target.value)} placeholder="ej: Soporte motor v2" className={inputClass} />
          </div>
          <div>
            <label className="text-[11px] text-text3">Cliente / Empresa</label>
            <select value={clienteId} onChange={e => setClienteId(e.target.value)} className={inputClass + ' bg-white'}>
              <option value="">— nueva empresa —</option>
              {clientes.map(c => <option key={c.id} value={c.id}>{c.nombre}{c.empresa ? ` (${c.empresa})` : ''}</option>)}
            </select>
            {!clienteId && (
              <input value={clienteNuevo} onChange={e => setClienteNuevo(e.target.value)} placeholder="Nombre de la empresa *" className={inputClass} />
            )}
          </div>
          <div>
            <label className="text-[11px] text-text3">Contacto / solicitado por</label>
            {empresaNuevaEnCurso ? (
              <input value={contactoNuevo} onChange={e => setContactoNuevo(e.target.value)} placeholder="Nombre del contacto" className={inputClass} />
            ) : (
              <>
                <select value={contactoId} onChange={e => setContactoId(e.target.value)} className={inputClass + ' bg-white'}>
                  <option value="">— sin especificar —</option>
                  {contactos.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                  <option value="__nuevo__">+ Nuevo contacto…</option>
                </select>
                {contactoId === '__nuevo__' && (
                  <input value={contactoNuevo} onChange={e => setContactoNuevo(e.target.value)} placeholder="Nombre del contacto" className={inputClass} />
                )}
              </>
            )}
          </div>
          <div>
            <label className="text-[11px] text-text3">Marca</label>
            <select value={marca} onChange={e => setMarca(e.target.value)} className={inputClass + ' bg-white'}>
              {MARCAS.map(m => <option key={m.id} value={m.id}>{m.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text3">Tipo de trabajo</label>
            <select value={tipo} onChange={e => setTipo(e.target.value)} className={inputClass + ' bg-white'}>
              {TIPOS.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
          <div>
            <label className="text-[11px] text-text3">Fecha entrega compromiso</label>
            <input type="date" value={fechaEntrega} onChange={e => setFechaEntrega(e.target.value)} className={inputClass} />
          </div>
        </div>
        <button onClick={crearProyecto} className={btnClass + ' bg-emerald-600 hover:bg-emerald-700 text-white'}>
          Crear proyecto
        </button>
        {npStatus && <div className="text-[11.5px] text-text2 mt-2">{npStatus}</div>}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Registrar horas</h2>
          <label className="text-[11px] text-text3">Proyecto</label>
          <select value={hProyecto} onChange={e => setHProyecto(e.target.value)} className={inputClass + ' bg-white'}>
            <option value="">— selecciona —</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre || '(sin nombre)'}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Tipo</label>
          <select value={hTipo} onChange={e => setHTipo(e.target.value)} className={inputClass + ' bg-white'}>
            {TIPOS_HORA.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Horas (o km si el tipo es kilometraje)</label>
          <input type="number" step="0.1" value={hCantidad} onChange={e => setHCantidad(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Fecha</label>
          <input type="date" value={hFecha} onChange={e => setHFecha(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Descripción</label>
          <input value={hDescripcion} onChange={e => setHDescripcion(e.target.value)} placeholder="opcional" className={inputClass} />
          <button onClick={registrarHoras} className={btnClass + ' bg-ink hover:bg-ink-light text-white'}>Registrar</button>
          {hStatus && <div className="text-[11.5px] text-text2 mt-2">{hStatus}</div>}
        </div>

        <div className="bg-white border border-border rounded-xl p-5">
          <h2 className="text-[13px] font-semibold text-text mb-3">Registrar gasto de proyecto</h2>
          <label className="text-[11px] text-text3">Proyecto</label>
          <select value={gProyecto} onChange={e => setGProyecto(e.target.value)} className={inputClass + ' bg-white'}>
            <option value="">— selecciona —</option>
            {proyectos.map(p => <option key={p.id} value={p.id}>{p.codigo} — {p.nombre || '(sin nombre)'}</option>)}
          </select>
          <label className="text-[11px] text-text3 mt-2 block">Importe (€)</label>
          <input type="number" step="0.01" value={gImporte} onChange={e => setGImporte(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Fecha</label>
          <input type="date" value={gFecha} onChange={e => setGFecha(e.target.value)} className={inputClass} />
          <label className="text-[11px] text-text3 mt-2 block">Descripción</label>
          <input value={gDescripcion} onChange={e => setGDescripcion(e.target.value)} placeholder="ej: material comprado, envío, pieza externa..." className={inputClass} />
          <button onClick={registrarGasto} className={btnClass + ' bg-amber-500 hover:bg-amber-600 text-white'}>Registrar gasto</button>
          {gStatus && <div className="text-[11.5px] text-text2 mt-2">{gStatus}</div>}
        </div>
      </div>
    </div>
  );
}
