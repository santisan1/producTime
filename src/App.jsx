import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from "recharts";

const CLASES = ["AT", "BT", "MT", "RF"];
const REGIMENES = ["Estandar", "AT_Bajo_Carga", "BT_Bajo_Carga"];
const REGIMEN_LABELS = { Estandar: "Estándar", AT_Bajo_Carga: "AT Bajo Carga", BT_Bajo_Carga: "BT Bajo Carga" };
const BOBINA_COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa"];

const capitalize = (s) => s.charAt(0).toUpperCase() + s.slice(1);

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

const GlassCard = ({ children, style = {}, className = "" }) => (
  <div className={className} style={{ background: "rgba(255,255,255,0.65)", backdropFilter: "blur(16px)", WebkitBackdropFilter: "blur(16px)", border: "1px solid rgba(255,255,255,0.85)", borderRadius: 20, boxShadow: "0 8px 32px rgba(30,41,59,0.08)", ...style }}>
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

function useDebounce(value, delay) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

export default function TransformerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [regimen, setRegimen] = useState("Estandar");
  const [bobinas, setBobinas] = useState([{ clase: "AT", tipo: "", conductor: "", peso: "" }]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/cerebro_pwa.json");
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

  // Build lookup maps from real JSON data
  const coefMap = useMemo(() => {
    if (!data?.coeficientes_bobinados) return new Map();
    const m = new Map();
    for (const c of data.coeficientes_bobinados) {
      m.set(`${c.clase}|${c.tipo}|${c.conductor}|${c.regimen}`, c);
    }
    return m;
  }, [data]);

  // Dynamic options per clase
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

  // Auto-fix bobina selects when data loads or clase/tipo changes
  const updateBobina = useCallback((idx, field, val) => {
    setBobinas((prev) => prev.map((b, i) => {
      if (i !== idx) return b;
      const updated = { ...b, [field]: val };
      if (field === "clase") {
        updated.tipo = "";
        updated.conductor = "";
      }
      if (field === "tipo") {
        updated.conductor = "";
      }
      return updated;
    }));
  }, []);

  const addBobina = useCallback(() => {
    setBobinas((p) => p.length < 4 ? [...p, { clase: "AT", tipo: "", conductor: "", peso: "" }] : p);
  }, []);

  const removeBobina = useCallback((idx) => {
    setBobinas((p) => p.length > 1 ? p.filter((_, i) => i !== idx) : p);
  }, []);

  // Debounced bobinas for chart/calculation reactivity while typing peso
  const debouncedBobinas = useDebounce(bobinas, 300);

  // Core calculation
  const calculos = useMemo(() => {
    if (!data?.coeficientes_bobinados) return [];
    return debouncedBobinas.map((b, i) => {
      const key = `${b.clase}|${b.tipo}|${b.conductor}|${regimen}`;
      const coef = coefMap.get(key);
      const peso = parseFloat(b.peso) || 0;
      const coeficiente = coef ? coef.coeficiente : null;
      const casos = coef ? coef.casos : 0;
      return {
        id: i + 1,
        label: `Bobina ${i + 1}`,
        clase: b.clase,
        tipo: b.tipo,
        conductor: b.conductor,
        peso,
        coeficiente,
        casos,
        horas: coeficiente !== null && peso > 0 ? peso * coeficiente : null,
        sinDatos: !coef && b.tipo !== "" && b.conductor !== "",
      };
    });
  }, [data, debouncedBobinas, regimen, coefMap]);

  // Improved similarity: +/- 20% weight, same regimen priority
  const similares = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    const pesoTotal = calculos.reduce((s, c) => s + c.peso, 0);
    if (pesoTotal <= 0) return [];
    const lower = pesoTotal * 0.8;
    const upper = pesoTotal * 1.2;
    return data.historico_maquinas
      .map((m) => {
        const peso = m["Peso Parte Activa"];
        const mismoRegimen = m.Regimen_Regulacion === regimen;
        const enRango = peso >= lower && peso <= upper;
        const distPeso = Math.abs(peso - pesoTotal) / pesoTotal;
        // Score: lower is better. Prioritize same regimen + within 20% range
        const score = distPeso + (mismoRegimen ? 0 : 1) + (enRango ? 0 : 0.5);
        return { ...m, score, mismoRegimen, enRango };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
  }, [data, calculos, regimen]);

  const totalHoras = useMemo(() => calculos.reduce((s, c) => s + (c.horas || 0), 0), [calculos]);
  const chartData = useMemo(() => calculos.map((c) => ({ name: c.label, horas: c.horas || 0 })), [calculos]);

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
        <p style={{ fontSize: 13, color: "#64748b", marginBottom: 16 }}>No se pudo cargar <strong>cerebro_pwa.json</strong></p>
        <p style={{ fontSize: 12, color: "#94a3b8", fontFamily: "monospace", background: "rgba(248,250,252,0.8)", padding: "8px 12px", borderRadius: 8 }}>{fetchError}</p>
      </GlassCard>
    </div>
  );

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
        @keyframes fadeUp { from { opacity:0; transform:translateY(14px); } to { opacity:1; transform:translateY(0); } }
        @keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.7; } }
        .fade-up { animation: fadeUp 0.35s ease both; }
        .bobina-card { transition: transform 0.2s; }
        .bobina-card:hover { transform: translateY(-2px); }
        .similar-row:hover td { background: rgba(249,115,22,0.04); }
        .btn-add:hover { background: #ea580c !important; }
        .btn-remove:hover { border-color: #fca5a5 !important; color: #ef4444 !important; }
        .badge-eeuu { animation: pulse 2s ease-in-out infinite; }

        /* ── LAYOUT ── */
        .app-wrapper {
          width: 100%;
          min-height: 100vh;
          background: linear-gradient(135deg, #fff7ed 0%, #fef9f0 45%, #f0f9ff 100%);
          font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
          padding-bottom: 56px;
        }
        .page-body {
          width: 100%;
          padding: 28px 32px 0;
        }
        .stats-row {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
          gap: 16px;
          margin-bottom: 24px;
        }
        .main-layout {
          display: grid;
          grid-template-columns: 360px 1fr;
          gap: 24px;
          align-items: start;
        }
        .right-col { min-width: 0; display: flex; flex-direction: column; gap: 20px; }

        @media (max-width: 1100px) {
          .main-layout { grid-template-columns: 1fr; }
          .page-body { padding: 20px 20px 0; }
        }
        @media (max-width: 600px) {
          .page-body { padding: 12px 12px 0; }
          .stats-row { grid-template-columns: 1fr 1fr; }
        }
      `}</style>

      <div className="app-wrapper">

        {/* HEADER */}
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
                <span className="badge-eeuu" style={{ fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 99, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "white", boxShadow: "0 2px 8px rgba(59,130,246,0.35)", letterSpacing: "0.02em" }}>
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

          {/* STATS ROW */}
          <div className="stats-row fade-up">
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
              <GlassCard className="fade-up" style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Régimen de Regulación</h3>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
                  {REGIMENES.map((r) => (
                    <button key={r} onClick={() => setRegimen(r)} style={{ width: "100%", textAlign: "left", padding: "9px 13px", borderRadius: 11, border: regimen === r ? "2px solid #f97316" : "2px solid transparent", background: regimen === r ? "rgba(249,115,22,0.08)" : "rgba(248,250,252,0.6)", cursor: "pointer", fontSize: 13, fontWeight: regimen === r ? 600 : 400, color: regimen === r ? "#ea580c" : "#64748b", fontFamily: "inherit" }}>
                      <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: regimen === r ? "#f97316" : "#cbd5e1", flexShrink: 0 }} />
                        {REGIMEN_LABELS[r]}
                      </span>
                    </button>
                  ))}
                </div>
              </GlassCard>

              {/* Bobinas */}
              <GlassCard className="fade-up" style={{ padding: "20px 22px" }}>
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
                    <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Bobinas ({bobinas.length}/4)</h3>
                  </div>
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
              <GlassCard className="fade-up" style={{ padding: "22px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 18 }}>
                  <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
                  <h3 style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>Distribución de Horas por Bobina</h3>
                </div>
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
              <GlassCard className="fade-up" style={{ padding: "22px" }}>
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
                          {["OT", "Tipo", "Peso P.A. (kg)", "Régimen", "Hs Reales", "Match"].map((h) => (
                            <th key={h} style={{ textAlign: "left", padding: "7px 11px", fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(226,232,240,0.7)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {similares.map((m) => (
                          <tr key={m.OT} className="similar-row">
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
                              {m["TOTAL OT"].toLocaleString()} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>hrs</span>
                            </td>
                            <td style={{ padding: "9px 11px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                              {m.enRango && m.mismoRegimen
                                ? <span style={{ fontSize: 10, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(34,197,94,0.12)", color: "#16a34a" }}>●  Exacto</span>
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

          <div style={{ textAlign: "center", marginTop: 40, paddingBottom: 8 }}>
            <p style={{ fontSize: 12, color: "#cbd5e1" }}>Cerebro PWA · Fábrica de Transformadores · {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>
    </>
  );
}