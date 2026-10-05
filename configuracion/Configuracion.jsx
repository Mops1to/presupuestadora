import { useEffect, useState } from 'react';
import { api } from '../../core/api';

const inputClass = 'w-full text-[12.5px] border border-border rounded-md px-2.5 py-1.5 mt-0.5';

export default function Configuracion() {
  const [config, setConfig] = useState(null);
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  const [newName, setNewName] = useState('');
  const [newPrice, setNewPrice] = useState('');
  const [newDensity, setNewDensity] = useState('');
  const [newType, setNewType] = useState('fdm');
  const [newCamara, setNewCamara] = useState(false);

  useEffect(() => { api('/config').then(setConfig).catch(() => {}); }, []);

  function toggleCamara(matId) {
    setConfig(c => ({
      ...c,
      materials: c.materials.map(m => (m.id === matId ? { ...m, requiere_camara: !m.requiere_camara } : m)),
    }));
  }

  function addMaterial() {
    if (!newName.trim()) return;
    const nuevo = {
      id: newName.trim().toLowerCase().replace(/\s+/g, '_'),
      name: newName.trim(),
      price: parseFloat(newPrice) || 0,
      density: parseFloat(newDensity) || 1.0,
      type: newType,
      requiere_camara: newCamara,
    };
    setConfig(c => ({ ...c, materials: [...c.materials, nuevo] }));
    setNewName(''); setNewPrice(''); setNewDensity(''); setNewCamara(false);
  }

  async function guardar() {
    setSaving(true);
    setStatus('');
    try {
      await api('/config', { method: 'POST', body: JSON.stringify(config) });
      setStatus('✓ Configuración guardada');
    } catch (e) { setStatus('Error: ' + e.message); }
    setSaving(false);
  }

  if (!config) return <div className="text-text3 text-sm">Cargando...</div>;

  return (
    <div className="max-w-2xl">
      <h1 className="text-lg font-semibold text-text mb-4">Configuración</h1>

      <div className="bg-white border border-border rounded-xl p-5">
        <h2 className="text-[13px] font-semibold text-text mb-3">Materiales</h2>

        <div className="divide-y divide-border">
          {config.materials.map(m => (
            <div key={m.id} className="flex items-center justify-between py-1.5 text-[12px]">
              <span className="text-text">{m.name}</span>
              <span className="flex items-center gap-2.5">
                <label className="flex items-center gap-1 text-text2 cursor-pointer">
                  <input type="checkbox" checked={!!m.requiere_camara} onChange={() => toggleCamara(m.id)} className="accent-ink" />
                  🔥 cámara
                </label>
                <span className="font-mono text-text3">{m.price}€/kg · {m.density}g/cm³</span>
              </span>
            </div>
          ))}
        </div>

        <div className="bg-bg-app border border-border2 rounded-lg p-3.5 mt-4">
          <div className="grid grid-cols-4 gap-2.5">
            <div>
              <label className="text-[11px] text-text3">Nombre</label>
              <input value={newName} onChange={e => setNewName(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] text-text3">Precio €/kg</label>
              <input type="number" value={newPrice} onChange={e => setNewPrice(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] text-text3">Densidad</label>
              <input type="number" step="0.01" value={newDensity} onChange={e => setNewDensity(e.target.value)} className={inputClass} />
            </div>
            <div>
              <label className="text-[11px] text-text3">Tipo</label>
              <select value={newType} onChange={e => setNewType(e.target.value)} className={inputClass + ' bg-white'}>
                <option value="fdm">FDM</option>
                <option value="resin">Resina</option>
              </select>
            </div>
          </div>
          <label className="flex items-center gap-1.5 mt-2 cursor-pointer">
            <input type="checkbox" checked={newCamara} onChange={e => setNewCamara(e.target.checked)} className="accent-ink" />
            <span className="text-[12px] text-text2">Requiere cámara caliente continua (ej. PA12, PPS)</span>
          </label>
          <button onClick={addMaterial} className="mt-2.5 text-[12px] font-semibold bg-emerald-600 hover:bg-emerald-700 text-white rounded-md px-3.5 py-1.5">
            Añadir material
          </button>
        </div>

        <button onClick={guardar} disabled={saving}
          className="mt-4 text-[12.5px] font-semibold bg-amber-500 hover:bg-amber-600 disabled:opacity-60 text-white rounded-md px-4 py-2">
          {saving ? 'Guardando...' : 'Guardar configuración'}
        </button>
        {status && <div className="text-[11.5px] text-text2 mt-2">{status}</div>}
      </div>
    </div>
  );
}
