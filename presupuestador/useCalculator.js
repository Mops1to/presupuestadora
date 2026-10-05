import { useCallback, useMemo, useState } from 'react';
import { API_BASE } from '../../core/api';

const PRINTER_RATES = { bambu: 2.50, ender: 0.60, ratrig: 3.50, jupiter: 1.50 };
const LABOR_RATE_DEFAULT = 15;
const DISENO_RATE_DEFAULT = 35;
const CAMARA_RATE_DEFAULT = 6; // €/h para materiales que exigen cámara caliente continua

const CLAVES = ['mat1', 'mat2', 'mach', 'labor', 'diseno'];

// Encapsula toda la calculadora de impresión 3D: selección de material/impresora,
// análisis de CAD (o modo manual), el mezclador de costes con bloqueos y precio
// objetivo, y el precio final. Es el mismo cálculo que la app HTML, 1:1.
export function useCalculator(config, costeEstructuralHora) {
  const [selectedMat1, setSelectedMat1] = useState(null);
  const [selectedMat2, setSelectedMat2] = useState(null);
  const [selectedPrinter, setSelectedPrinter] = useState(null);

  const [g1, setG1] = useState('');
  const [g2, setG2] = useState('');
  const [supportGrams, setSupportGrams] = useState('0');
  const [machH, setMachH] = useState('0');
  const [laborH, setLaborH] = useState('0');
  const [disenoH, setDisenoH] = useState('0');
  const [disenoOn, setDisenoOn] = useState(false);

  const [locks, setLocks] = useState({ mat1: false, mat2: false, mach: false, labor: false, diseno: false });
  const [targetPrice, setTargetPrice] = useState('');
  const [targetBreakdown, setTargetBreakdown] = useState('');

  const [qty, setQty] = useState(1);
  const [ivaRate, setIvaRate] = useState(21);
  const [infill, setInfill] = useState(20);

  const [lastAnalysis, setLastAnalysis] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeStatus, setAnalyzeStatus] = useState('');

  const mat1 = useMemo(() => config?.materials?.find(m => m.id === selectedMat1) || null, [config, selectedMat1]);
  const mat2 = useMemo(() => config?.materials?.find(m => m.id === selectedMat2) || null, [config, selectedMat2]);
  const printer = useMemo(() => config?.printers?.find(p => p.id === selectedPrinter) || null, [config, selectedPrinter]);

  const machRate = useMemo(() => {
    if (mat1 && mat1.requiere_camara) return CAMARA_RATE_DEFAULT;
    return PRINTER_RATES[selectedPrinter] || 0.5;
  }, [mat1, selectedPrinter]);

  const usaCamaraCaliente = machRate === CAMARA_RATE_DEFAULT;

  const calc = useMemo(() => {
    const g1Num = parseFloat(g1) || parseFloat(lastAnalysis?.geometry?.weight_g) || 0;
    const g2Num = parseFloat(g2) || parseFloat(supportGrams) || 0;
    const machHNum = parseFloat(machH) || 0;
    const laborHNum = parseFloat(laborH) || 0;
    const disenoHNum = disenoOn ? (parseFloat(disenoH) || 0) : 0;

    const matCost1 = mat1 ? (g1Num / 1000) * mat1.price : parseFloat(lastAnalysis?.costs?.material || 0);
    const matCost2 = mat2 ? (g2Num / 1000) * mat2.price : 0;
    const machCost = machHNum * machRate;
    const estCost = machHNum * (costeEstructuralHora || 0);
    const laborCost = laborHNum * LABOR_RATE_DEFAULT;
    const disenoCost = disenoHNum * DISENO_RATE_DEFAULT;

    const total = matCost1 + matCost2 + machCost + estCost + laborCost + disenoCost;
    const qtyNum = parseInt(qty) || 1;
    const totalLote = total * qtyNum;
    const ivaNum = (parseFloat(ivaRate) || 0) / 100;

    return { g1Num, g2Num, machHNum, laborHNum, disenoHNum, matCost1, matCost2, machCost, estCost, laborCost, disenoCost, total, totalLote, conIva: total * (1 + ivaNum) };
  }, [g1, g2, supportGrams, machH, laborH, disenoH, disenoOn, mat1, mat2, machRate, costeEstructuralHora, qty, ivaRate, lastAnalysis]);

  const sobrePrecio = useMemo(() => {
    const tp = parseFloat(targetPrice);
    return tp > 0 && calc.total > tp;
  }, [targetPrice, calc.total]);

  const toggleLock = useCallback((clave) => {
    setLocks(prev => ({ ...prev, [clave]: !prev[clave] }));
  }, []);

  const analyzeFile = useCallback(async (file) => {
    if (!file) return;
    setAnalyzing(true);
    setAnalyzeStatus('Analizando...');
    try {
      const fd = new FormData();
      fd.append('file', file);
      const params = new URLSearchParams({
        material: selectedMat1 || 'pla', infill: infill / 100, fail_rate: 0.05, margin: 0.30,
        machine_cost_h: 0.5, labor_cost_h: LABOR_RATE_DEFAULT, qty,
      });
      const res = await fetch(`${API_BASE}/analyze?${params}`, { method: 'POST', body: fd });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setLastAnalysis(data);
      setAnalyzeStatus(`✓ ${data.geometry.volume_cm3} cm³ · ${data.geometry.weight_g}g`);
      if (!g1) setG1(String(data.geometry.weight_g));
      setMachH(String(parseFloat(data.print.estimated_time_h) || 0));
      setLaborH(String(parseFloat(data.costs.labor) / LABOR_RATE_DEFAULT || 0));
    } catch (e) {
      setAnalyzeStatus('Error: ' + e.message);
    } finally {
      setAnalyzing(false);
    }
  }, [selectedMat1, infill, qty, g1]);

  // Reparte el precio objetivo entre las barras SIN bloquear, manteniendo su proporción
  // actual entre ellas (o un reparto de arranque por defecto si están a cero). Las barras
  // bloqueadas se quedan tal cual, exactamente igual que en la app HTML.
  const applyTargetPrice = useCallback(() => {
    const tp = parseFloat(targetPrice);
    if (!tp || tp <= 0) { setTargetBreakdown(''); return; }

    const machRateCombinada = machRate + (costeEstructuralHora || 0);
    const cost = {
      mat1: mat1 ? calc.matCost1 : 0,
      mat2: mat2 ? calc.matCost2 : 0,
      mach: calc.machHNum * machRateCombinada,
      labor: calc.laborCost,
      diseno: calc.disenoCost,
    };
    const applicable = { mat1: !!mat1, mat2: !!mat2, mach: true, labor: true, diseno: disenoOn };

    let lockedTotal = 0;
    CLAVES.forEach(k => { if (locks[k]) lockedTotal += cost[k]; });
    const remaining = tp - lockedTotal;

    let unlockedCurrentTotal = 0;
    CLAVES.forEach(k => { if (!locks[k] && applicable[k]) unlockedCurrentTotal += cost[k]; });

    const share = {};
    CLAVES.forEach(k => {
      if (locks[k] || !applicable[k]) { share[k] = locks[k] ? cost[k] : 0; return; }
      if (unlockedCurrentTotal > 0) {
        share[k] = Math.max(0, remaining) * (cost[k] / unlockedCurrentTotal);
      } else {
        const w = { mat1: 0.40, mat2: 0.15, mach: 0.30, labor: 0.15, diseno: 0.15 };
        let wSum = 0;
        CLAVES.forEach(kk => { if (!locks[kk] && applicable[kk]) wSum += w[kk]; });
        share[k] = Math.max(0, remaining) * (w[k] / (wSum || 1));
      }
    });

    if (mat1 && !locks.mat1) setG1((((share.mat1 / mat1.price) * 1000) || 0).toFixed(1));
    if (mat2 && !locks.mat2) setG2((((share.mat2 / mat2.price) * 1000) || 0).toFixed(1));
    if (!locks.mach) setMachH((share.mach / machRateCombinada || 0).toFixed(1));
    if (!locks.labor) setLaborH((share.labor / LABOR_RATE_DEFAULT || 0).toFixed(1));
    if (disenoOn && !locks.diseno) setDisenoH((share.diseno / DISENO_RATE_DEFAULT || 0).toFixed(1));

    const nombres = { mat1: 'material', mat2: 'soporte', mach: 'máquina', labor: 'mano de obra', diseno: 'diseño' };
    const lockedNames = CLAVES.filter(k => locks[k] && applicable[k]).map(k => nombres[k]);
    setTargetBreakdown(lockedNames.length
      ? `Bloqueado: ${lockedNames.join(', ')} (${lockedTotal.toFixed(2)}€). Repartidos ${Math.max(0, remaining).toFixed(2)}€ entre el resto para llegar a ${tp.toFixed(2)}€.`
      : `Reparto de arranque para ${tp.toFixed(2)} €. Puedes mover las barras libremente, o bloquear alguna 🔒 y volver a pulsar.`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetPrice, machRate, costeEstructuralHora, mat1, mat2, locks, disenoOn, calc]);

  const resetGrams = useCallback(() => {
    setG1(lastAnalysis?.geometry?.weight_g ? String(lastAnalysis.geometry.weight_g) : '');
    setG2('');
  }, [lastAnalysis]);

  const descripcionLinea = useMemo(() => {
    if (lastAnalysis) return `${lastAnalysis.file || 'Pieza'} — ${lastAnalysis.material || mat1?.name || ''}`;
    return `Impresión 3D manual — ${mat1 ? mat1.name : (selectedMat1 || 'material')}`;
  }, [lastAnalysis, mat1, selectedMat1]);

  return {
    config, selectedMat1, setSelectedMat1, selectedMat2, setSelectedMat2, selectedPrinter, setSelectedPrinter,
    mat1, mat2, printer, machRate, usaCamaraCaliente,
    g1, setG1, g2, setG2, supportGrams, setSupportGrams,
    machH, setMachH, laborH, setLaborH, disenoH, setDisenoH, disenoOn, setDisenoOn,
    locks, toggleLock,
    targetPrice, setTargetPrice, targetBreakdown, applyTargetPrice, sobrePrecio,
    qty, setQty, ivaRate, setIvaRate, infill, setInfill,
    lastAnalysis, analyzing, analyzeStatus, analyzeFile, resetGrams,
    calc, descripcionLinea,
    LABOR_RATE_DEFAULT, DISENO_RATE_DEFAULT,
  };
}
