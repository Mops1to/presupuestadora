import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { api } from '../../core/api';

export default function Historial() {
  const [trabajos, setTrabajos] = useState([]);

  useEffect(() => { api('/trabajos').then(setTrabajos).catch(() => {}); }, []);

  function exportarCSV() {
    const header = 'fecha,nombre,material,impresora,volumen_cm3,tiempo_real_h,precio_cobrado,fallo,notas\n';
    const rows = trabajos.map(t => [t.fecha, t.nombre, t.material, t.impresora, t.volumen_cm3, t.tiempo_real_h, t.precio_cobrado, t.fallo, t.notas]
      .map(v => `"${v ?? ''}"`).join(',')).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'historial.csv';
    a.click();
  }

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text">
          Trabajos registrados <span className="ml-1 text-[11px] font-mono font-normal text-text3 bg-ink-soft px-2 py-0.5 rounded-full">{trabajos.length}</span>
        </h1>
        <button onClick={exportarCSV} className="flex items-center gap-1.5 text-[12.5px] border border-border rounded-md px-3.5 py-1.5 text-text2 hover:bg-bg-app">
          <Download size={14} /> Descargar CSV
        </button>
      </div>

      <div className="bg-white border border-border rounded-xl overflow-hidden">
        <table className="w-full text-[12.5px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase text-text3 border-b border-border bg-bg-app">
              <th className="px-3 py-2 font-semibold">Fecha</th><th className="font-semibold">Nombre</th><th className="font-semibold">Material</th>
              <th className="font-semibold">T. real h</th><th className="font-semibold">Cobrado €</th><th className="font-semibold">Fallo</th><th className="font-semibold">Notas</th>
            </tr>
          </thead>
          <tbody>
            {trabajos.map(t => (
              <tr key={t.id} className="border-b border-border/60">
                <td className="px-3 py-2 text-text3">{(t.fecha || '').slice(0, 10)}</td>
                <td>{t.nombre || ''}</td>
                <td>{t.material || ''}</td>
                <td className="font-mono">{t.tiempo_real_h || '—'}</td>
                <td className="font-mono">{t.precio_cobrado || '—'}</td>
                <td>{t.fallo || 'no'}</td>
                <td className="text-text2">{t.notas || ''}</td>
              </tr>
            ))}
            {trabajos.length === 0 && <tr><td colSpan={7} className="text-center text-text3 py-6">Sin trabajos registrados todavía</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
