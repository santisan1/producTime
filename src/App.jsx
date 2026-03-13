import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

/* ─── Constants ─── */
const CLASES = ["AT", "BT", "MT", "RF"];
const REGIMENES = ["Estandar", "AT_Bajo_Carga", "BT_Bajo_Carga"];
const REGIMEN_LABELS = { Estandar: "Estándar", AT_Bajo_Carga: "AT Bajo Carga", BT_Bajo_Carga: "BT Bajo Carga" };
const BOBINA_COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa"];
const CLASE_COLORS = { AT: "#f97316", BT: "#3b82f6", MT: "#8b5cf6", RF: "#10b981" };
const TAB_SIMULADOR = "simulador";
const TAB_BUSCADOR = "buscador";

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

/* ─── Hooks ─── */
function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

/* ─── Shared UI Components ─── */
const GlassCard = ({ children, style = {}, className = "", onClick }) => (
  <div className={className} onClick={onClick} style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: 20, boxShadow: "0 8px 32px rgba(30,41,59,0.08)", ...style }}>
    {children}
  </div>
);

const SelectField = ({ value, onChange, options, label, disabled }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      style={{ background: disabled ? "rgba(241,245,249,0.8)" : "rgba(255,255,255,0.8)", border: "1.5px solid rgba(249,115,22,0.2)", borderRadius: 10, padding: "8px 12px", fontSize: 13, color: disabled ? "#94a3b8" : "#1e293b", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", outline: "none", width: "100%" }}
      onFocus={(e) => { if (!disabled) e.target.style.borderColor = "#f97316"; }}
      onBlur={(e) => e.target.style.borderColor = "rgba(249,115,22,0.2)"}
    >
      {options.map((opt) => (
        <option key={typeof opt === "string" ? opt : opt.value} value={typeof opt === "string" ? opt : opt.value}>
          {typeof opt === "string" ? opt : opt.label}
        </option>
      ))}
    </select>
  </div>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{ background: "rgba(255,255,255,0.95)", border: "1px solid #f97316", borderRadius: 12, padding: "10px 16px", boxShadow: "0 4px 24px rgba(249,115,22,0.15)" }}>
        <p style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{label}</p>
        <p style={{ color: "#f97316", fontWeight: 600 }}>{payload[0].value.toFixed(1)} <span style={{ color: "#64748b", fontWeight: 400 }}>hrs</span></p>
      </div>
    );
  }
  return null;
};

const SectionTitle = ({ children }) => (
  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
    <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>{children}</h3>
  </div>
);

/* ─── Deviation Badge ─── */
const DevioBadge = ({ value }) => {
  if (value == null || !isFinite(value)) return <span style={{ color: "#94a3b8", fontSize: 12 }}>—</span>;
  const isNeg = value < 0;
  const color = isNeg ? "#16a34a" : value > 0 ? "#dc2626" : "#64748b";
  const bg = isNeg ? "rgba(34,197,94,0.1)" : value > 0 ? "rgba(220,38,38,0.1)" : "rgba(100,116,139,0.08)";
  return (
    <span style={{ fontSize: 12, fontWeight: 700, padding: "2px 8px", borderRadius: 99, background: bg, color, whiteSpace: "nowrap" }}>
      {isNeg ? "↓" : value > 0 ? "↑" : "="} {Math.abs(value).toFixed(1)}%
    </span>
  );
};


/* ─── OT Detail Modal (slide-over panael) ─── */
function OTDetailModal({ maquina, allCoefs, onClose }) {
  if (!maquina) return null;
  const regimen = maquina.Regimen_Regulacion;
  const pesoPA = maquina["Peso Parte Activ"] || 0;
  const horasReales = maquina["TOTAL OT"] || 0;

  const breakdown = useMemo(() => {
    const claseMap = {};
    for (const c of allCoefs) {
      if (c.regimen !== regimen) continue;
      if (!claseMap[c.clase]) claseMap[c.clase] = { totalCoef: 0, totalCasos: 0 };
      claseMap[c.clase].totalCoef += c.coeficiente * c.casos;
      claseMap[c.clase].totalCasos += c.casos;
    }
    const rows = [];
    let totalEstimado = 0;
    for (const clase of CLASES) {
      const entry = claseMap[clase];
      if (!entry) continue;
      const avgCoef = entry.totalCasos > 0 ? entry.totalCoef / entry.totalCasos : 0;
      const estimado = pesoPA * avgCoef;
      totalEstimado += estimado;
      rows.push({ clase, avgCoef, estimado, casos: entry.totalCasos });
    }
    return { rows, totalEstimado };
  }, [allCoefs, regimen, pesoPA]);

  const desvioTotal = breakdown.totalEstimado > 0
    ? ((horasReales - breakdown.totalEstimado) / breakdown.totalEstimado) * 100
    : null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: "fixed", inset: 0, zIndex: 1000, display: "flex", alignItems: "center", justifyContent: "flex-end" }}
      >
        <div onClick={onClose} style={{ position: "absolute", inset: 0, background: "rgba(15,23,42,0.4)", backdropFilter: "blur(4px)" }} />

        <motion.div
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 28, stiffness: 300 }}
          style={{ position: "relative", width: "min(520px, 92vw)", height: "100vh", background: "rgba(255,255,255,0.92)", backdropFilter: "blur(24px)", borderLeft: "1px solid rgba(249,115,22,0.12)", overflowY: "auto", padding: "28px 30px", boxShadow: "-8px 0 40px rgba(30,41,59,0.12)" }}
        >
          <button onClick={onClose} style={{ position: "absolute", top: 18, right: 20, width: 30, height: 30, borderRadius: 8, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", fontSize: 16, display: "flex", alignItems: "center", justifyContent: "center", color: "#64748b", fontFamily: "inherit" }}>×</button>

          {/* Header */}
          <div style={{ marginBottom: 24 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
              <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white" }}>OT {maquina.OT}</span>
              <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(249,115,22,0.1)", color: "#ea580c" }}>
                {REGIMEN_LABELS[regimen] || regimen}
              </span>
            </div>
            <h2 style={{ fontSize: 20, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.02em" }}>{maquina["Tipo de Máquina"]}</h2>
          </div>

          {/* Key Metrics */}
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 24 }}>
            <div style={{ padding: "16px", borderRadius: 14, background: "rgba(248,250,252,0.8)", border: "1px solid rgba(226,232,240,0.6)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Peso Parte Activa</p>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{Math.round(pesoPA).toLocaleString()}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>kg</span>
            </div>
            <div style={{ padding: "16px", borderRadius: 14, background: "rgba(248,250,252,0.8)", border: "1px solid rgba(226,232,240,0.6)" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 4 }}>Horas Reales (OT)</p>
              <span style={{ fontSize: 22, fontWeight: 700, color: "#1e293b" }}>{horasReales.toLocaleString()}</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 4 }}>hrs</span>
            </div>
          </div>

          {/* Comparison bars */}
          <GlassCard style={{ padding: "20px", marginBottom: 20, background: "rgba(255,255,255,0.8)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
              <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Comparativa Real vs Estándar</h3>
              {desvioTotal != null && <DevioBadge value={desvioTotal} />}
            </div>
            <div style={{ marginBottom: 16 }}>
              {[
                { label: "Horas Reales", value: horasReales, color: "#f97316" },
                { label: "Horas Estándar", value: breakdown.totalEstimado, color: "#3b82f6" },
              ].map((row) => {
                const maxVal = Math.max(horasReales, breakdown.totalEstimado) || 1;
                return (
                  <div key={row.label} style={{ marginBottom: 10 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#475569" }}>{row.label}</span>
                      <span style={{ fontSize: 12, fontWeight: 700, color: row.color }}>{row.value.toFixed(1)} hrs</span>
                    </div>
                    <div style={{ height: 8, borderRadius: 4, background: "rgba(241,245,249,0.8)", overflow: "hidden" }}>
                      <div style={{ height: "100%", borderRadius: 4, background: row.color, width: `${(row.value / maxVal) * 100}%`, transition: "width 0.4s ease" }} />
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: "10px 14px", borderRadius: 10, background: desvioTotal != null && desvioTotal < 0 ? "rgba(34,197,94,0.08)" : desvioTotal != null && desvioTotal > 0 ? "rgba(220,38,38,0.06)" : "rgba(248,250,252,0.6)" }}>
              <p style={{ fontSize: 12, color: desvioTotal != null && desvioTotal < 0 ? "#16a34a" : desvioTotal != null && desvioTotal > 0 ? "#dc2626" : "#64748b", fontWeight: 600 }}>
                {desvioTotal != null
                  ? desvioTotal < 0
                    ? `✓ Ahorro de ${Math.abs(desvioTotal).toFixed(1)}% respecto al estándar`
                    : desvioTotal > 0
                      ? `⚠ Retraso de ${desvioTotal.toFixed(1)}% respecto al estándar`
                      : "En línea con el estándar"
                  : "Sin datos para comparar"}
              </p>
            </div>
          </GlassCard>

          {/* Breakdown by Clase */}
          <GlassCard style={{ padding: "20px", background: "rgba(255,255,255,0.8)" }}>
            <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 14 }}>Desglose Estimado por Actividad</h3>
            <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 12 }}>
              Horas estándar estimadas aplicando coef. promedio ponderado × Peso P.A. para régimen {REGIMEN_LABELS[regimen]}
            </p>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr>
                  {["Actividad", "Coef. Prom.", "Hs Estándar", "Casos Hist."].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(226,232,240,0.7)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {breakdown.rows.map((row) => (
                  <tr key={row.clase}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: CLASE_COLORS[row.clase] || "#94a3b8", flexShrink: 0 }} />
                        Bobinado {row.clase}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#64748b", borderBottom: "1px solid rgba(241,245,249,0.8)", fontFamily: "monospace", fontSize: 12 }}>{row.avgCoef.toFixed(4)}</td>
                    <td style={{ padding: "8px 10px", fontWeight: 700, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>{row.estimado.toFixed(1)} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>hrs</span></td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>{row.casos}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#1e293b", borderTop: "2px solid rgba(226,232,240,0.7)" }}>Total Estándar</td>
                  <td style={{ padding: "10px 10px", borderTop: "2px solid rgba(226,232,240,0.7)" }} />
                  <td style={{ padding: "10px 10px", fontWeight: 800, color: "#3b82f6", borderTop: "2px solid rgba(226,232,240,0.7)" }}>{breakdown.totalEstimado.toFixed(1)} hrs</td>
                  <td style={{ padding: "10px 10px", borderTop: "2px solid rgba(226,232,240,0.7)" }} />
                </tr>
              </tfoot>
            </table>
          </GlassCard>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function TransformerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_SIMULADOR);
  const [regimen, setRegimen] = useState("Estandar");
  const [bobinas, setBobinas] = useState([{ clase: "AT", tipo: "", conductor: "", peso: "" }]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedOT, setSelectedOT] = useState(null);

  /* ─── Fetch v2 JSON ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/cerebro_pwa_v2.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setFetchError(err.message);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ─── Coef lookup map ─── */
  const coefMap = useMemo(() => {
    if (!data?.coeficientes_bobinados) return new Map();
    const m = new Map();
    for (const c of data.coeficientes_bobinados) {
      m.set(`${c.clase}|${c.tipo}|${c.conductor}|${c.regimen}`, c);
    }
    return m;
  }, [data]);

  /* ─── Dynamic options per clase ─── */
  const opcionesPorClase = useMemo(() => {
    if (!data?.coeficientes_bobinados) return {};
    const map = {};
    for (const c of data.coeficientes_bobinados) {
      if (!map[c.clase]) map[c.clase] = { tipos: new Set(), conductores: new Map() };
      map[c.clase].tipos.add(c.tipo);
      if (!map[c.clase].conductores.has(c.tipo)) map[c.clase].conductores.set(c.tipo, new Set());
      map[c.clase].conductores.get(c.tipo).add(c.conductor);
    }
    return map;
  }, [data]);

  const getTipos = useCallback((clase) => {
    const entry = opcionesPorClase[clase];
    return entry ? [...entry.tipos].sort() : [];
  }, [opcionesPorClase]);

  const getConductores = useCallback((clase, tipo) => {
    const entry = opcionesPorClase[clase];
    if (!entry) return [];
    const set = entry.conductores.get(tipo);
    return set ? [...set].sort() : [];
  }, [opcionesPorClase]);

  /* ─── Bobina CRUD ─── */
  const updateBobina = useCallback((idx, field, val) => {
    setBobinas((prev) => prev.map((b, i) => {
      if (i !== idx) return b;
      const updated = { ...b, [field]: val };
      if (field === "clase") { updated.tipo = ""; updated.conductor = ""; }
      if (field === "tipo") { updated.conductor = ""; }
      return updated;
    }));
  }, []);

  const addBobina = useCallback(() => {
    setBobinas((p) => p.length < 4 ? [...p, { clase: "AT", tipo: "", conductor: "", peso: "" }] : p);
  }, []);

  const removeBobina = useCallback((idx) => {
    setBobinas((p) => p.length > 1 ? p.filter((_, i) => i !== idx) : p);
  }, []);

  const debouncedBobinas = useDebounce(bobinas, 300);

  /* ─── Core calculations ─── */
  const calculos = useMemo(() => {
    if (!data?.coeficientes_bobinados) return [];
    return debouncedBobinas.map((b, i) => {
      const key = `${b.clase}|${b.tipo}|${b.conductor}|${regimen}`;
      const coef = coefMap.get(key);
      const peso = parseFloat(b.peso) || 0;
      const coeficiente = coef ? coef.coeficiente : null;
      const casos = coef ? coef.casos : 0;
      return {
        id: i + 1, label: `Bobina ${i + 1}`, clase: b.clase, tipo: b.tipo,
        conductor: b.conductor, peso, coeficiente, casos,
        horas: coeficiente !== null && peso > 0 ? peso * coeficiente : null,
        sinDatos: !coef && b.tipo !== "" && b.conductor !== "",
      };
    });
  }, [data, debouncedBobinas, regimen, coefMap]);

  /* ─── Improved similarity: weight ±20%, same regimen, class match ─── */
  const similares = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    const pesoTotal = calculos.reduce((s, c) => s + c.peso, 0);
    if (pesoTotal <= 0) return [];
    const lower = pesoTotal * 0.8;
    const upper = pesoTotal * 1.2;

    return data.historico_maquinas
      .map((m) => {
        const peso = m["Peso Parte Activa"] || 0;
        const mismoRegimen = m.Regimen_Regulacion === regimen;
        const enRango = peso >= lower && peso <= upper;
        const distPeso = Math.abs(peso - pesoTotal) / pesoTotal;
        const score = distPeso + (mismoRegimen ? 0 : 1) + (enRango ? 0 : 0.5);
        return { ...m, score, mismoRegimen, enRango };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [data, calculos, regimen]);

  const totalHoras = useMemo(() => calculos.reduce((s, c) => s + (c.horas || 0), 0), [calculos]);
  const chartData = useMemo(() => calculos.map((c) => ({ name: c.label, horas: c.horas || 0 })), [calculos]);

  /* ─── Buscador filtering ─── */
  const debouncedSearch = useDebounce(searchQuery, 250);
  const filteredMaquinas = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    if (!debouncedSearch.trim()) return data.historico_maquinas;
    const q = debouncedSearch.toLowerCase().trim();
    return data.historico_maquinas.filter((m) => {
      const otStr = String(m.OT);
      const tipo = (m["Tipo de Máquina"] || "").toLowerCase();
      const reg = (m.Regimen_Regulacion || "").toLowerCase();
      const regLabel = (REGIMEN_LABELS[m.Regimen_Regulacion] || "").toLowerCase();
      return otStr.includes(q) || tipo.includes(q) || reg.includes(q) || regLabel.includes(q);
    });
  }, [data, debouncedSearch]);

  /* ─── Open OT detail ─── */
  const openOTDetail = useCallback((ot) => {
    if (!data?.historico_maquinas) return;
    const maq = data.historico_maquinas.find((m) => m.OT === ot);
    if (maq) setSelectedOT(maq);
  }, [data]);

  /* ─── Loading / Error states ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #fff7ed, #fff)" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #fed7aa", borderTopColor: "#f97316", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#94a3b8", fontFamily: "system-ui" }}>Cargando datos del cerebro...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (fetchError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #fff7ed, #fff)" }}>
      <GlassCard style={{ padding: "32px 40px", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Error al cargar datos</h2>
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>No se pudo cargar <strong>cerebro_pwa_v2.json</strong></p>
        <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", background: "rgba(248,250,252,0.8)", padding: "8px 12px", borderRadius: 8 }}>{fetchError}</p>
      </GlassCard>
    </div>
  );

  /* ═══════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html { width: 100%; }
        body { width: 100%; overflow-x: hidden; }
        #root { width: 100%; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #fdba74; border-radius: 99px; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.7} }
        .bobina-card { transition: transform 0.2s; }
        .bobina-card:hover { transform: translateY(-2px); }
        .clickable-row { cursor: pointer; transition: background 0.15s; }
        .clickable-row:hover td { background: rgba(249,115,22,0.05); }
        .btn-add:hover { background: #ea580c !important; }
        .btn-remove:hover { border-color: #fca5a5 !important; color: #ef4444 !important; }
        .badge-eeuu { animation: pulse 2s ease-in-out infinite; }
        .search-input:focus { border-color: #f97316 !important; box-shadow: 0 0 0 3px rgba(249,115,22,0.1); }
        .app-wrapper {
          width: 100%; min-height: 100vh;
          background: linear-gradient(135deg, #fff7ed 0%, #fef9f0 45%, #f0f9ff 100%);
          font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
          padding-bottom: 56px;
        }
        .page-body { width: 100%; padding: 28px 32px 0; }
        .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 16px; margin-bottom: 24px; }
        .main-layout { display: grid; grid-template-columns: 360px 1fr; gap: 24px; align-items: start; }
        .right-col { min-width: 0; display: flex; flex-direction: column; gap: 20px; }
        @media (max-width: 1100px) { .main-layout { grid-template-columns: 1fr; } .page-body { padding: 20px 20px 0; } }
        @media (max-width: 600px) { .page-body { padding: 12px 12px 0; } .stats-row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="app-wrapper">

        {/* ─── HEADER ─── */}
        <header style={{ background: "rgba(255,255,255,0.78)", backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)", borderBottom: "1px solid rgba(249,115,22,0.12)", padding: "0 32px", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 60 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(249,115,22,0.35)", flexShrink: 0 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <div>
                <span style={{ fontSize: 16, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.02em" }}>Cerebro PWA</span>
                <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>Estimador de Bobinado</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              {regimen === "BT_Bajo_Carga" && (
                <span className="badge-eeuu" style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "white", boxShadow: "0 2px 8px rgba(59,130,246,0.35)" }}>
                  🇺🇸 Configuración Especial EEUU
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                <div style={{ width: 7, height: 7, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
                <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Sistema activo</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-body">

          {/* ─── TABS ─── */}
          <div style={{ display: "flex", gap: 4, marginBottom: 24, background: "rgba(255,255,255,0.5)", backdropFilter: "blur(12px)", padding: 4, borderRadius: 14, width: "fit-content", border: "1px solid rgba(255,255,255,0.8)" }}>
            {[
              { id: TAB_SIMULADOR, label: "⚡ Simulador de Costos" },
              { id: TAB_BUSCADOR, label: "🔍 Buscador Histórico" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "10px 22px", borderRadius: 11, border: "none", cursor: "pointer",
                  fontSize: 13, fontWeight: activeTab === tab.id ? 700 : 500, fontFamily: "inherit",
                  background: activeTab === tab.id ? "white" : "transparent",
                  color: activeTab === tab.id ? "#ea580c" : "#64748b",
                  boxShadow: activeTab === tab.id ? "0 2px 8px rgba(30,41,59,0.08)" : "none",
                  transition: "all 0.2s ease",
                }}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* ─── TAB CONTENT ─── */}
          <AnimatePresence mode="wait">
            {activeTab === TAB_SIMULADOR ? (
              <motion.div key="simulador"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {/* STATS ROW */}
                <div className="stats-row">
                  <GlassCard style={{ padding: "22px 26px", background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.72)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Total Horas de Bobinado</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 5 }}>
                      <span style={{ fontSize: 40, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1 }}>{totalHoras.toFixed(1)}</span>
                      <span style={{ fontSize: 15, color: "rgba(255,255,255,0.72)", fontWeight: 500 }}>hrs</span>
                    </div>
                    <p style={{ fontSize: 11, color: "rgba(255,255,255,0.6)", marginTop: 6 }}>{bobinas.length} bobina{bobinas.length > 1 ? "s" : ""} · {REGIMEN_LABELS[regimen]}</p>
                  </GlassCard>

                  {calculos.map((c, i) => (
                    <GlassCard key={i} style={{ padding: "18px 20px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 6 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</p>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: `${BOBINA_COLORS[i]}22`, color: BOBINA_COLORS[i] }}>{c.clase}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                        <span style={{ fontSize: 26, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.03em" }}>{c.horas !== null ? c.horas.toFixed(1) : "—"}</span>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>hrs</span>
                      </div>
                      <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 3 }}>
                        {c.peso > 0 ? `${c.peso} kg` : "Sin peso"}{c.coeficiente ? ` · ×${c.coeficiente}` : " · Sin coef."}
                      </p>
                    </GlassCard>
                  ))}
                </div>

                {/* MAIN LAYOUT */}
                <div className="main-layout">
                  {/* LEFT COLUMN */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
                    {/* Régimen */}
                    <GlassCard style={{ padding: "20px 22px" }}>
                      <SectionTitle>Régimen de Regulación</SectionTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                        {REGIMENES.map((r) => (
                          <button key={r} onClick={() => setRegimen(r)} style={{ width: "100%", textAlign: "left", padding: "9px 13px", borderRadius: 11, border: regimen === r ? "2px solid #f97316" : "2px solid transparent", background: regimen === r ? "rgba(249,115,22,0.08)" : "rgba(248,250,252,0.6)", cursor: "pointer", fontSize: 13, fontWeight: regimen === r ? 600 : 400, color: regimen === r ? "#ea580c" : "#64748b", fontFamily: "inherit" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 6, height: 6, borderRadius: "50%", background: regimen === r ? "#f97316" : "#cbd5e1", flexShrink: 0 }} />
                              {REGIMEN_LABELS[r]}
                              {r === "BT_Bajo_Carga" && <span style={{ fontSize: 10, marginLeft: "auto", color: "#3b82f6", fontWeight: 700 }}>EEUU</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </GlassCard>

                    {/* Bobinas */}
                    <GlassCard style={{ padding: "20px 22px" }}>
                      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                        <SectionTitle>Bobinas ({bobinas.length}/4)</SectionTitle>
                        {bobinas.length < 4 && (
                          <button className="btn-add" onClick={addBobina} style={{ padding: "5px 13px", background: "#f97316", color: "white", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 12, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 4 }}>
                            <span style={{ fontSize: 15, lineHeight: 1 }}>+</span> Agregar
                          </button>
                        )}
                      </div>

                      <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                        {bobinas.map((b, i) => {
                          const tipos = getTipos(b.clase);
                          const conductores = b.tipo ? getConductores(b.clase, b.tipo) : [];
                          return (
                            <div key={i} className="bobina-card" style={{ padding: "14px", borderRadius: 13, background: "rgba(248,250,252,0.7)", border: `1.5px solid ${BOBINA_COLORS[i]}40` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 11 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 7 }}>
                                  <div style={{ width: 22, height: 22, borderRadius: 6, background: BOBINA_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{i + 1}</span>
                                  </div>
                                  <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Bobina {i + 1}</span>
                                </div>
                                {bobinas.length > 1 && (
                                  <button className="btn-remove" onClick={() => removeBobina(i)} style={{ width: 22, height: 22, borderRadius: 6, border: "1px solid #e2e8f0", background: "white", cursor: "pointer", color: "#94a3b8", fontSize: 13, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
                                )}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 9 }}>
                                <SelectField label="Clase" value={b.clase} onChange={(v) => updateBobina(i, "clase", v)} options={CLASES} />
                                <SelectField label="Tipo" value={b.tipo} onChange={(v) => updateBobina(i, "tipo", v)}
                                  options={tipos.length > 0 ? [{ value: "", label: "Seleccionar..." }, ...tipos.map((t) => ({ value: t, label: capitalize(t) }))] : [{ value: "", label: "Sin tipos" }]}
                                  disabled={tipos.length === 0}
                                />
                                <div style={{ gridColumn: "span 2" }}>
                                  <SelectField label="Conductor" value={b.conductor} onChange={(v) => updateBobina(i, "conductor", v)}
                                    options={conductores.length > 0 ? [{ value: "", label: "Seleccionar..." }, ...conductores.map((c) => ({ value: c, label: c }))] : [{ value: "", label: b.tipo ? "Sin conductores" : "Elegí tipo primero" }]}
                                    disabled={conductores.length === 0}
                                  />
                                </div>
                                <div style={{ gridColumn: "span 2" }}>
                                  <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Peso (kg)</label>
                                  <input type="number" value={b.peso} onChange={(e) => updateBobina(i, "peso", e.target.value)} placeholder="0"
                                    style={{ width: "100%", padding: "8px 12px", background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(249,115,22,0.2)", borderRadius: 10, fontSize: 13, color: "#1e293b", fontFamily: "inherit", outline: "none" }}
                                    onFocus={(e) => e.target.style.borderColor = "#f97316"}
                                    onBlur={(e) => e.target.style.borderColor = "rgba(249,115,22,0.2)"}
                                  />
                                </div>
                              </div>
                              {calculos[i] && (
                                <div style={{ marginTop: 9, padding: "7px 10px", borderRadius: 8, background: calculos[i].sinDatos ? "rgba(239,68,68,0.06)" : calculos[i].coeficiente ? "rgba(249,115,22,0.07)" : "rgba(248,250,252,0.6)" }}>
                                  {calculos[i].sinDatos
                                    ? <span style={{ fontSize: 12, color: "#ef4444", display: "flex", alignItems: "center", gap: 4 }}>
                                      <span style={{ fontSize: 14 }}>⚠</span> No hay datos históricos para esta configuración
                                    </span>
                                    : calculos[i].coeficiente
                                      ? <span style={{ fontSize: 12, color: "#ea580c", fontWeight: 600 }}>
                                        ⚡ {calculos[i].peso} kg × {calculos[i].coeficiente} = <strong>{calculos[i].horas?.toFixed(1)} hrs</strong>
                                        <span style={{ fontWeight: 400, color: "#94a3b8", marginLeft: 6 }}>({calculos[i].casos} casos)</span>
                                      </span>
                                      : <span style={{ fontSize: 12, color: "#94a3b8" }}>Completá la configuración para calcular</span>
                                  }
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>
                  </div>

                  {/* RIGHT COLUMN */}
                  <div className="right-col">
                    {/* Chart */}
                    <GlassCard style={{ padding: "22px" }}>
                      <SectionTitle>Distribución de Horas por Bobina</SectionTitle>
                      {chartData.some((d) => d.horas > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.6)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(249,115,22,0.06)" }} />
                            <Bar dataKey="horas" radius={[8, 8, 0, 0]}>
                              {chartData.map((_, i) => <Cell key={i} fill={BOBINA_COLORS[i]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                          Ingresá el peso de las bobinas para ver el gráfico
                        </div>
                      )}
                    </GlassCard>

                    {/* Similar Machines */}
                    <GlassCard style={{ padding: "22px" }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                        <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
                        <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Máquinas Similares</h3>
                        <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(249,115,22,0.1)", color: "#f97316", fontWeight: 600, marginLeft: "auto" }}>Top 5</span>
                      </div>
                      <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 14, marginTop: 4 }}>
                        Peso total: {calculos.reduce((s, c) => s + c.peso, 0).toFixed(0)} kg · {REGIMEN_LABELS[regimen]}
                        <span style={{ marginLeft: 8, fontSize: 11 }}>· Rango ±20%</span>
                      </p>
                      {similares.length === 0 ? (
                        <div style={{ padding: "24px 0", textAlign: "center", color: "#94a3b8", fontSize: 13 }}>
                          Ingresá peso en las bobinas para buscar máquinas similares
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                            <thead>
                              <tr>
                                {["OT", "Tipo", "Peso P.A.", "Régimen", "Hs Reales", "Match"].map((h) => (
                                  <th key={h} style={{ textAlign: "left", padding: "7px 11px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(226,232,240,0.7)", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {similares.map((m) => (
                                <tr key={m.OT} className="clickable-row" onClick={() => openOTDetail(m.OT)}>
                                  <td style={{ padding: "9px 11px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.OT}</span>
                                  </td>
                                  <td style={{ padding: "9px 11px", fontWeight: 500, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)", whiteSpace: "nowrap" }}>{m["Tipo de Máquina"]}</td>
                                  <td style={{ padding: "9px 11px", fontWeight: 600, color: "#374151", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>{Math.round(m["Peso Parte Activa"]).toLocaleString()}</td>
                                  <td style={{ padding: "9px 11px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                    <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap", background: m.mismoRegimen ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.12)", color: m.mismoRegimen ? "#ea580c" : "#94a3b8" }}>
                                      {REGIMEN_LABELS[m.Regimen_Regulacion]}
                                    </span>
                                  </td>
                                  <td style={{ padding: "9px 11px", fontWeight: 700, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                    {(m["TOTAL OT"] || 0).toLocaleString()} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>hrs</span>
                                  </td>
                                  <td style={{ padding: "9px 11px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                    {m.enRango && m.mismoRegimen
                                      ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#16a34a" }}>● Exacto</span>
                                      : m.enRango
                                        ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(249,115,22,0.12)", color: "#f97316" }}>◐ Parcial</span>
                                        : <span style={{ fontSize: 10, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "rgba(148,163,184,0.1)", color: "#94a3b8" }}>○ Lejano</span>
                                    }
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </GlassCard>
                  </div>
                </div>
              </motion.div>

            ) : (
              /* ═══════════════════════════════════════════
                 TAB: BUSCADOR HISTÓRICO
                 ═══════════════════════════════════════════ */
              <motion.div key="buscador"
                initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -12 }}
                transition={{ duration: 0.25 }}
              >
                {/* Search Bar */}
                <GlassCard style={{ padding: "20px 24px", marginBottom: 20 }}>
                  <SectionTitle>Buscador Universal de OTs</SectionTitle>
                  <div style={{ position: "relative" }}>
                    <span style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)", fontSize: 16, color: "#94a3b8", pointerEvents: "none" }}>🔍</span>
                    <input
                      className="search-input"
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Buscar por N° de OT, tipo de máquina o régimen..."
                      style={{ width: "100%", padding: "12px 16px 12px 42px", background: "rgba(255,255,255,0.9)", border: "1.5px solid rgba(249,115,22,0.15)", borderRadius: 12, fontSize: 14, color: "#1e293b", fontFamily: "inherit", outline: "none", transition: "border-color 0.2s, box-shadow 0.2s" }}
                    />
                  </div>
                  <p style={{ fontSize: 12, color: "#94a3b8", marginTop: 8 }}>
                    {filteredMaquinas.length} resultado{filteredMaquinas.length !== 1 ? "s" : ""} de {data?.historico_maquinas?.length || 0} OTs totales
                  </p>
                </GlassCard>

                {/* Results Table */}
                <GlassCard style={{ padding: "22px" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                      <thead>
                        <tr>
                          {["OT", "Tipo de Máquina", "Régimen", "Peso P.A. (kg)", "Horas Reales", ""].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "8px 12px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1.5px solid rgba(226,232,240,0.7)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {filteredMaquinas.length === 0 ? (
                          <tr>
                            <td colSpan={6} style={{ padding: "40px 12px", textAlign: "center", color: "#94a3b8", fontSize: 14 }}>
                              No se encontraron OTs para &ldquo;{searchQuery}&rdquo;
                            </td>
                          </tr>
                        ) : (
                          filteredMaquinas.map((m) => (
                            <tr key={m.OT} className="clickable-row" onClick={() => openOTDetail(m.OT)}>
                              <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.OT}</span>
                              </td>
                              <td style={{ padding: "10px 12px", fontWeight: 500, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)", whiteSpace: "nowrap" }}>{m["Tipo de Máquina"]}</td>
                              <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                <span style={{
                                  fontSize: 11, padding: "2px 8px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap",
                                  background: m.Regimen_Regulacion === "AT_Bajo_Carga" ? "rgba(249,115,22,0.1)" : m.Regimen_Regulacion === "BT_Bajo_Carga" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.1)",
                                  color: m.Regimen_Regulacion === "AT_Bajo_Carga" ? "#ea580c" : m.Regimen_Regulacion === "BT_Bajo_Carga" ? "#2563eb" : "#64748b"
                                }}>
                                  {REGIMEN_LABELS[m.Regimen_Regulacion] || m.Regimen_Regulacion}
                                </span>
                              </td>
                              <td style={{ padding: "10px 12px", fontWeight: 600, color: "#374151", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                {Math.round(m["Peso Parte Activa"] || 0).toLocaleString()}
                              </td>
                              <td style={{ padding: "10px 12px", fontWeight: 700, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                {(m["TOTAL OT"] || 0).toLocaleString()} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>hrs</span>
                              </td>
                              <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                                <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600, cursor: "pointer" }}>Ver detalle →</span>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </GlassCard>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ textAlign: "center", marginTop: 40, paddingBottom: 8 }}>
            <p style={{ fontSize: 12, color: "#cbd5e1" }}>Cerebro PWA · Fábrica de Transformadores · {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      {/* ─── OT Detail Modal ─── */}
      {selectedOT && (
        <OTDetailModal
          maquina={selectedOT}
          coefMap={coefMap}
          allCoefs={data?.coeficientes_bobinados || []}
          onClose={() => setSelectedOT(null)}
        />
      )}
    </>
  );
}