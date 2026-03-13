import { useState, useEffect, useCallback, useMemo } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════ */
const CLASES = ["AT", "BT", "MT", "RF"];
const REGIMENES = ["Estandar", "AT_Bajo_Carga", "BT_Bajo_Carga"];
const REGIMEN_LABELS = { Estandar: "Estándar", AT_Bajo_Carga: "AT Bajo Carga", BT_Bajo_Carga: "BT Bajo Carga" };
const BOBINA_COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa"];
const ACTIVIDADES_BOB = ["AT", "BT", "MT", "RF"];
const ACTIVIDADES_ALL = ["AT", "BT", "MT", "RF", "montaje", "nucleo", "conexiones"];
const ACT_LABELS = { AT: "Bobinado AT", BT: "Bobinado BT", MT: "Bobinado MT", RF: "Bobinado RF", montaje: "Montaje", nucleo: "Núcleo", conexiones: "Conexiones" };
const ACT_COLORS = { AT: "#f97316", BT: "#3b82f6", MT: "#8b5cf6", RF: "#10b981", montaje: "#e11d48", nucleo: "#0891b2", conexiones: "#ca8a04" };
const DESVIO_ALERT = 15;
const TAB_SIM = "simulador";
const TAB_BUS = "buscador";

const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";

/* ═══════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════ */
function useDebounce(value, delay) {
  const [d, setD] = useState(value);
  useEffect(() => { const t = setTimeout(() => setD(value), delay); return () => clearTimeout(t); }, [value, delay]);
  return d;
}

/* ═══════════════════════════════════════════
   HELPERS — compute theoretical hours for an OT
   Uses each tube's peso_kg × matching coef for its clase/tipo/conductor/regimen.
   For non-bobinado activities (montaje, nucleo, conexiones) we don't have
   per-tube coefs, so theoretical = real (no deviation).
   ═══════════════════════════════════════════ */
function computeTeoricoForOT(maquina, coefMap) {
  const reg = maquina.regimen;
  const tubos = maquina.tubos || [];
  const desglose = maquina.desglose_horas || {};

  // Theoretical bobinado hours per clase, summing tube contributions
  const teoBob = {};
  for (const clase of ACTIVIDADES_BOB) teoBob[clase] = 0;

  for (const tubo of tubos) {
    const clase = tubo.clase_norm && tubo.clase_norm !== "None" ? tubo.clase_norm : null;
    if (!clase || !ACTIVIDADES_BOB.includes(clase)) continue;
    const key = `${clase}|${tubo.tipo}|${tubo.conductor}|${reg}`;
    const coef = coefMap.get(key);
    if (coef) {
      teoBob[clase] += tubo.peso_kg * coef.coeficiente;
    }
  }

  const rows = [];
  let totalReal = 0, totalTeo = 0;

  for (const act of ACTIVIDADES_ALL) {
    const real = desglose[act] || 0;
    const isBob = ACTIVIDADES_BOB.includes(act);
    const teo = isBob ? teoBob[act] : real; // non-bobinado: teo = real
    const desvio = teo > 0 ? ((real - teo) / teo) * 100 : (real > 0 ? 100 : 0);
    totalReal += real;
    totalTeo += teo;
    rows.push({ act, label: ACT_LABELS[act], real, teo, desvio, isBob, color: ACT_COLORS[act] });
  }

  const desvioTotal = totalTeo > 0 ? ((totalReal - totalTeo) / totalTeo) * 100 : 0;
  return { rows, totalReal, totalTeo, desvioTotal };
}

/* ═══════════════════════════════════════════
   SHARED UI ATOMS
   ═══════════════════════════════════════════ */
const GlassCard = ({ children, style = {}, className = "", onClick }) => (
  <div className={className} onClick={onClick} style={{
    background: "rgba(15,23,42,0.55)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)",
    border: "1px solid rgba(148,163,184,0.12)", borderRadius: 16,
    boxShadow: "0 8px 32px rgba(0,0,0,0.18)", color: "#e2e8f0", ...style,
  }}>{children}</div>
);

const SelectField = ({ value, onChange, options, label, disabled, style: sx = {} }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4, ...sx }}>
    {label && <label style={{ fontSize: 10, fontWeight: 700, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
    <select value={value} onChange={(e) => onChange(e.target.value)} disabled={disabled}
      style={{ background: disabled ? "rgba(30,41,59,0.5)" : "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, padding: "7px 10px", fontSize: 12, color: disabled ? "#64748b" : "#e2e8f0", fontFamily: "inherit", cursor: disabled ? "not-allowed" : "pointer", outline: "none", width: "100%" }}
    >
      {options.map((opt) => (
        <option key={typeof opt === "string" ? opt : opt.value} value={typeof opt === "string" ? opt : opt.value}>
          {typeof opt === "string" ? opt : opt.label}
        </option>
      ))}
    </select>
  </div>
);

const SectionTitle = ({ children, right }) => (
  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 14 }}>
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div style={{ width: 3, height: 16, borderRadius: 2, background: "#f97316", flexShrink: 0 }} />
      <h3 style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>{children}</h3>
    </div>
    {right}
  </div>
);

const DevioBadge = ({ value, size = "sm" }) => {
  if (value == null || !isFinite(value)) return <span style={{ color: "#64748b", fontSize: 11 }}>—</span>;
  const isNeg = value < 0;
  const color = isNeg ? "#34d399" : value > 0 ? "#fb7185" : "#94a3b8";
  const bg = isNeg ? "rgba(52,211,153,0.12)" : value > 0 ? "rgba(251,113,133,0.12)" : "rgba(148,163,184,0.08)";
  const sz = size === "lg" ? { fontSize: 14, padding: "4px 12px" } : { fontSize: 11, padding: "2px 8px" };
  return (
    <span style={{ fontWeight: 700, borderRadius: 99, background: bg, color, whiteSpace: "nowrap", ...sz }}>
      {isNeg ? "↓" : value > 0 ? "↑" : "="} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

const AlertIcon = () => (
  <span title="Desvío > 15%" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 99, background: "rgba(251,113,133,0.18)", color: "#fb7185", fontSize: 11, fontWeight: 700, flexShrink: 0, cursor: "help" }}>!</span>
);

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
      <p style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4, fontSize: 12 }}>{label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} style={{ color: p.color, fontWeight: 600, fontSize: 12 }}>{p.name}: {p.value?.toFixed(1)} hrs</p>
      ))}
    </div>
  );
};

/* ═══════════════════════════════════════════
   FULL-SCREEN OT ANALYSIS MODAL
   ═══════════════════════════════════════════ */
function OTAnalysisModal({ maquina, coefMap, onClose }) {
  if (!maquina) return null;
  const analysis = useMemo(() => computeTeoricoForOT(maquina, coefMap), [maquina, coefMap]);

  const chartData = useMemo(() =>
    analysis.rows.filter((r) => r.real > 0 || r.teo > 0).map((r) => ({
      name: r.label, real: r.real, teorico: r.teo, desvio: r.desvio,
    })), [analysis]);

  const tubos = maquina.tubos || [];

  return (
    <motion.div
      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(2,6,23,0.92)", backdropFilter: "blur(8px)", overflowY: "auto", fontFamily: "'DM Sans', system-ui, sans-serif" }}
    >
      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 28px 48px" }}>
        {/* Header bar */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 28 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>←</button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 2 }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white" }}>OT {maquina.OT}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(249,115,22,0.15)", color: "#fb923c" }}>
                  {REGIMEN_LABELS[maquina.regimen] || maquina.regimen}
                </span>
                {Math.abs(analysis.desvioTotal) > DESVIO_ALERT && <AlertIcon />}
              </div>
              <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>{maquina.tipo_maquina} — Análisis de Desvíos</h2>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14, marginBottom: 24 }}>
          {[
            { label: "Peso Parte Activa", value: `${Math.round(maquina.peso_parte_activa).toLocaleString()} kg`, accent: "#f97316" },
            { label: "Horas Reales (OT)", value: `${analysis.totalReal.toFixed(1)} hrs`, accent: "#fb7185" },
            { label: "Horas Teóricas", value: `${analysis.totalTeo.toFixed(1)} hrs`, accent: "#3b82f6" },
            { label: "Desvío Total", value: <DevioBadge value={analysis.desvioTotal} size="lg" />, accent: Math.abs(analysis.desvioTotal) > DESVIO_ALERT ? "#fb7185" : "#34d399" },
            { label: "Tubos", value: `${tubos.length}`, accent: "#8b5cf6" },
          ].map((kpi) => (
            <GlassCard key={kpi.label} style={{ padding: "18px 20px" }}>
              <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>{kpi.label}</p>
              <div style={{ fontSize: 24, fontWeight: 800, color: kpi.accent, letterSpacing: "-0.03em" }}>{kpi.value}</div>
            </GlassCard>
          ))}
        </div>

        {/* Chart: Real vs Teórico */}
        <GlassCard style={{ padding: "24px", marginBottom: 24 }}>
          <SectionTitle>Comparativa por Actividad — Real vs Teórico</SectionTitle>
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={chartData} barGap={4} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.1)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.06)" }} />
              <Legend wrapperStyle={{ fontSize: 12, color: "#94a3b8" }} />
              <Bar dataKey="real" name="Horas Reales" fill="#fb7185" radius={[6, 6, 0, 0]} />
              <Bar dataKey="teorico" name="Horas Teóricas" fill="#3b82f6" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 20 }}>
          {/* Deviation table */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Desvío por Actividad</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr>
                  {["Actividad", "Real", "Teórico", "Desvío"].map((h) => (
                    <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {analysis.rows.map((r) => (
                  <tr key={r.act}>
                    <td style={{ padding: "8px 10px", fontWeight: 600, color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                        <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, flexShrink: 0 }} />
                        {r.label}
                        {r.isBob && Math.abs(r.desvio) > DESVIO_ALERT && <AlertIcon />}
                      </span>
                    </td>
                    <td style={{ padding: "8px 10px", color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.08)", fontFamily: "monospace" }}>{r.real.toFixed(1)}</td>
                    <td style={{ padding: "8px 10px", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.08)", fontFamily: "monospace" }}>{r.isBob ? r.teo.toFixed(1) : "≡"}</td>
                    <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.08)" }}>
                      {r.isBob ? <DevioBadge value={r.desvio} /> : <span style={{ fontSize: 11, color: "#475569" }}>n/a</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#f8fafc", borderTop: "2px solid rgba(148,163,184,0.15)" }}>Total</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#fb7185", borderTop: "2px solid rgba(148,163,184,0.15)", fontFamily: "monospace" }}>{analysis.totalReal.toFixed(1)}</td>
                  <td style={{ padding: "10px 10px", fontWeight: 700, color: "#3b82f6", borderTop: "2px solid rgba(148,163,184,0.15)", fontFamily: "monospace" }}>{analysis.totalTeo.toFixed(1)}</td>
                  <td style={{ padding: "10px 10px", borderTop: "2px solid rgba(148,163,184,0.15)" }}><DevioBadge value={analysis.desvioTotal} size="lg" /></td>
                </tr>
              </tfoot>
            </table>
          </GlassCard>

          {/* Tubes detail */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Configuración de Tubos</SectionTitle>
            {tubos.length === 0 ? (
              <p style={{ color: "#64748b", fontSize: 13, textAlign: "center", padding: 20 }}>Sin datos de tubos</p>
            ) : (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {tubos.map((t) => (
                  <div key={t.nro} style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(30,41,59,0.5)", border: "1px solid rgba(148,163,184,0.1)" }}>
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 22, height: 22, borderRadius: 6, background: ACT_COLORS[t.clase_norm] || "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white", flexShrink: 0 }}>{t.nro}</span>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#e2e8f0" }}>Tubo {t.nro}</span>
                        {t.clase_norm && t.clase_norm !== "None" && (
                          <span style={{ fontSize: 10, fontWeight: 700, padding: "1px 7px", borderRadius: 99, background: `${ACT_COLORS[t.clase_norm] || "#475569"}22`, color: ACT_COLORS[t.clase_norm] || "#94a3b8" }}>{t.clase_norm}</span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>{Math.round(t.peso_kg).toLocaleString()} kg</span>
                    </div>
                    <div style={{ display: "flex", gap: 16, fontSize: 11, color: "#94a3b8" }}>
                      <span>Tipo: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{capitalize(t.tipo)}</span></span>
                      <span>Conductor: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{t.conductor}</span></span>
                      {t.tension_kv != null && <span>Tensión: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{t.tension_kv} kV</span></span>}
                      {t.potencia_mva != null && <span>Potencia: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{t.potencia_mva} MVA</span></span>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </GlassCard>
        </div>

        {/* Summary insight */}
        <GlassCard style={{ padding: "18px 22px", marginTop: 20, background: analysis.desvioTotal < -5 ? "rgba(52,211,153,0.08)" : analysis.desvioTotal > DESVIO_ALERT ? "rgba(251,113,133,0.08)" : "rgba(15,23,42,0.55)" }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: analysis.desvioTotal < -5 ? "#34d399" : analysis.desvioTotal > DESVIO_ALERT ? "#fb7185" : "#94a3b8" }}>
            {analysis.desvioTotal < -5
              ? `✓ Esta OT fue ${Math.abs(analysis.desvioTotal).toFixed(1)}% más eficiente que el estándar teórico.`
              : analysis.desvioTotal > DESVIO_ALERT
                ? `⚠ Alerta: Desvío de +${analysis.desvioTotal.toFixed(1)}% sobre el teórico. Investigar causas de retraso.`
                : `OT dentro del rango esperado (desvío ${analysis.desvioTotal > 0 ? "+" : ""}${analysis.desvioTotal.toFixed(1)}%).`}
          </p>
        </GlassCard>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════
   MAIN COMPONENT
   ═══════════════════════════════════════════ */
export default function TransformerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState(TAB_SIM);
  const [regimen, setRegimen] = useState("Estandar");
  const [bobinas, setBobinas] = useState([{ clase: "AT", tipo: "", conductor: "", peso: "" }]);
  const [selectedOT, setSelectedOT] = useState(null);

  // Buscador filters
  const [fRegimen, setFRegimen] = useState("");
  const [fPesoMin, setFPesoMin] = useState("");
  const [fPesoMax, setFPesoMax] = useState("");
  const [fTuboClase, setFTuboClase] = useState("");
  const [fTuboTipo, setFTuboTipo] = useState("");
  const [fTensionMin, setFTensionMin] = useState("");
  const [fSearchText, setFSearchText] = useState("");

  /* ─── Fetch ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/cerebro_pwa_v3.json");
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
    const e = opcionesPorClase[clase]; return e ? [...e.tipos].sort() : [];
  }, [opcionesPorClase]);

  const getConductores = useCallback((clase, tipo) => {
    const e = opcionesPorClase[clase]; if (!e) return [];
    const s = e.conductores.get(tipo); return s ? [...s].sort() : [];
  }, [opcionesPorClase]);

  /* ─── Bobina CRUD ─── */
  const updateBobina = useCallback((idx, field, val) => {
    setBobinas((prev) => prev.map((b, i) => {
      if (i !== idx) return b;
      const u = { ...b, [field]: val };
      if (field === "clase") { u.tipo = ""; u.conductor = ""; }
      if (field === "tipo") { u.conductor = ""; }
      return u;
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

  /* ─── Improved match: weight ±20%, same regimen, SIMILAR TUBE CONFIG ─── */
  const similares = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    const pesoTotal = calculos.reduce((s, c) => s + c.peso, 0);
    if (pesoTotal <= 0) return [];
    const lower = pesoTotal * 0.8;
    const upper = pesoTotal * 1.2;
    const numBob = debouncedBobinas.length;
    const clasesConfig = debouncedBobinas.map((b) => b.clase).sort().join(",");

    return data.historico_maquinas
      .map((m) => {
        const peso = m.peso_parte_activa || 0;
        const mismoRegimen = m.regimen === regimen;
        const enRango = peso >= lower && peso <= upper;
        const distPeso = pesoTotal > 0 ? Math.abs(peso - pesoTotal) / pesoTotal : 1;

        // Tube config similarity
        const tubos = m.tubos || [];
        const mismaCantTubos = tubos.length === numBob;
        const clasesHist = tubos.map((t) => t.clase_norm && t.clase_norm !== "None" ? t.clase_norm : "?").sort().join(",");
        const mismasClases = clasesHist === clasesConfig;

        // Score: lower = better. Weight: pesoDistance, regimen, range, tube config
        let score = distPeso;
        if (!mismoRegimen) score += 1;
        if (!enRango) score += 0.5;
        if (!mismaCantTubos) score += 0.3;
        if (!mismasClases) score += 0.2;

        // Compute desvio for badge
        const analysis = computeTeoricoForOT(m, coefMap);

        return { ...m, score, mismoRegimen, enRango, mismaCantTubos, mismasClases, desvioTotal: analysis.desvioTotal };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 6);
  }, [data, calculos, regimen, debouncedBobinas, coefMap]);

  const totalHoras = useMemo(() => calculos.reduce((s, c) => s + (c.horas || 0), 0), [calculos]);
  const chartData = useMemo(() => calculos.map((c) => ({ name: c.label, horas: c.horas || 0 })), [calculos]);

  /* ─── Buscador filtering ─── */
  const debouncedSearchText = useDebounce(fSearchText, 250);
  const filteredMaquinas = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    return data.historico_maquinas.filter((m) => {
      // Text
      if (debouncedSearchText.trim()) {
        const q = debouncedSearchText.toLowerCase().trim();
        const hay = String(m.OT).includes(q) || (m.tipo_maquina || "").toLowerCase().includes(q);
        if (!hay) return false;
      }
      // Regimen
      if (fRegimen && m.regimen !== fRegimen) return false;
      // Peso range
      const peso = m.peso_parte_activa || 0;
      if (fPesoMin && peso < parseFloat(fPesoMin)) return false;
      if (fPesoMax && peso > parseFloat(fPesoMax)) return false;
      // Tube filters
      const tubos = m.tubos || [];
      if (fTuboClase || fTuboTipo || fTensionMin) {
        const match = tubos.some((t) => {
          if (fTuboClase && t.clase_norm !== fTuboClase) return false;
          if (fTuboTipo && t.tipo !== fTuboTipo) return false;
          if (fTensionMin && (t.tension_kv == null || t.tension_kv < parseFloat(fTensionMin))) return false;
          return true;
        });
        if (!match) return false;
      }
      return true;
    });
  }, [data, debouncedSearchText, fRegimen, fPesoMin, fPesoMax, fTuboClase, fTuboTipo, fTensionMin]);

  // Pre-compute desvios for buscador table rows
  const maquinasConDesvio = useMemo(() => {
    return filteredMaquinas.map((m) => {
      const a = computeTeoricoForOT(m, coefMap);
      return { ...m, _desvioTotal: a.desvioTotal, _totalTeo: a.totalTeo };
    });
  }, [filteredMaquinas, coefMap]);

  /* ─── Open OT detail ─── */
  const openOT = useCallback((ot) => {
    if (!data?.historico_maquinas) return;
    const maq = data.historico_maquinas.find((m) => String(m.OT) === String(ot));
    if (maq) setSelectedOT(maq);
  }, [data]);

  /* ─── Unique tube types for filter dropdown ─── */
  const uniqueTuboTipos = useMemo(() => {
    if (!data?.historico_maquinas) return [];
    const set = new Set();
    for (const m of data.historico_maquinas) for (const t of (m.tubos || [])) if (t.tipo) set.add(t.tipo);
    return [...set].sort();
  }, [data]);

  /* ─── Loading / Error ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
      <div style={{ textAlign: "center" }}>
        <div style={{ width: 48, height: 48, borderRadius: "50%", border: "4px solid #1e293b", borderTopColor: "#f97316", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
        <p style={{ color: "#64748b", fontFamily: "system-ui" }}>Cargando datos del cerebro...</p>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );

  if (fetchError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
      <GlassCard style={{ padding: "32px 40px", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>Error al cargar datos</h2>
        <p style={{ fontSize: 13, color: "#94a3b8", marginBottom: 16 }}>No se pudo cargar <strong>cerebro_pwa_v3.json</strong></p>
        <p style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace", background: "rgba(30,41,59,0.6)", padding: "8px 12px", borderRadius: 8 }}>{fetchError}</p>
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
        html, body, #root { width: 100%; }
        body { overflow-x: hidden; background: #0f172a; }
        ::-webkit-scrollbar { width: 6px; }
        ::-webkit-scrollbar-thumb { background: #334155; border-radius: 99px; }
        ::-webkit-scrollbar-track { background: transparent; }
        input[type=number] { -moz-appearance: textfield; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes pulse { 0%,100%{opacity:1} 50%{opacity:0.6} }
        .bobina-card { transition: transform 0.15s, box-shadow 0.15s; }
        .bobina-card:hover { transform: translateY(-2px); box-shadow: 0 6px 24px rgba(0,0,0,0.25); }
        .clickable-row { cursor: pointer; transition: background 0.12s; }
        .clickable-row:hover td { background: rgba(249,115,22,0.06); }
        .btn-add:hover { background: #ea580c !important; }
        .btn-remove:hover { border-color: #fb7185 !important; color: #fb7185 !important; }
        .badge-eeuu { animation: pulse 2s ease-in-out infinite; }
        .search-input { outline: none; transition: border-color 0.2s, box-shadow 0.2s; }
        .search-input:focus { border-color: #f97316 !important; box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
        .filter-input { outline: none; transition: border-color 0.15s; }
        .filter-input:focus { border-color: #f97316 !important; }
        .app-wrapper {
          width: 100%; min-height: 100vh;
          background: #0f172a;
          font-family: 'DM Sans', 'Segoe UI', system-ui, sans-serif;
          color: #e2e8f0;
          padding-bottom: 56px;
        }
        .page-body { width: 100%; padding: 24px 28px 0; }
        .stats-row { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 14px; margin-bottom: 22px; }
        .main-layout { display: grid; grid-template-columns: 350px 1fr; gap: 20px; align-items: start; }
        .right-col { min-width: 0; display: flex; flex-direction: column; gap: 18px; }
        @media (max-width: 1100px) { .main-layout { grid-template-columns: 1fr; } .page-body { padding: 18px 16px 0; } }
        @media (max-width: 600px) { .page-body { padding: 12px 10px 0; } .stats-row { grid-template-columns: 1fr 1fr; } }
      `}</style>

      <div className="app-wrapper">

        {/* ─── HEADER ─── */}
        <header style={{ background: "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(148,163,184,0.08)", padding: "0 28px", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 56 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(249,115,22,0.3)", flexShrink: 0 }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <div>
                <span style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em" }}>Cerebro PWA</span>
                <span style={{ fontSize: 11, color: "#64748b", marginLeft: 8 }}>Control de Desvíos Industriales</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {regimen === "BT_Bajo_Carga" && (
                <span className="badge-eeuu" style={{ fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "linear-gradient(135deg,#3b82f6,#1d4ed8)", color: "white", boxShadow: "0 2px 8px rgba(59,130,246,0.3)" }}>
                  🇺🇸 EEUU
                </span>
              )}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
                <span style={{ fontSize: 11, color: "#64748b", fontWeight: 500 }}>Activo · {data?.historico_maquinas?.length || 0} OTs</span>
              </div>
            </div>
          </div>
        </header>

        <div className="page-body">

          {/* ─── TABS ─── */}
          <div style={{ display: "flex", gap: 3, marginBottom: 22, background: "rgba(30,41,59,0.5)", padding: 3, borderRadius: 12, width: "fit-content", border: "1px solid rgba(148,163,184,0.08)" }}>
            {[
              { id: TAB_SIM, label: "⚡ Simulador" },
              { id: TAB_BUS, label: "🔍 Buscador" },
            ].map((tab) => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{
                  padding: "8px 20px", borderRadius: 10, border: "none", cursor: "pointer",
                  fontSize: 12, fontWeight: activeTab === tab.id ? 700 : 500, fontFamily: "inherit",
                  background: activeTab === tab.id ? "rgba(249,115,22,0.15)" : "transparent",
                  color: activeTab === tab.id ? "#fb923c" : "#64748b",
                  transition: "all 0.15s ease",
                }}
              >{tab.label}</button>
            ))}
          </div>

          {/* ─── TAB CONTENT ─── */}
          <AnimatePresence mode="wait">
            {activeTab === TAB_SIM ? (
              /* ═══════════════════════════════════════════
                 TAB: SIMULADOR
                 ═══════════════════════════════════════════ */
              <motion.div key="sim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {/* Stats row */}
                <div className="stats-row">
                  <GlassCard style={{ padding: "20px 22px", background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none" }}>
                    <p style={{ fontSize: 10, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 6 }}>Total Horas Bobinado</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 36, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1 }}>{totalHoras.toFixed(1)}</span>
                      <span style={{ fontSize: 14, color: "rgba(255,255,255,0.7)", fontWeight: 500 }}>hrs</span>
                    </div>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 4 }}>{bobinas.length} bobina{bobinas.length > 1 ? "s" : ""} · {REGIMEN_LABELS[regimen]}</p>
                  </GlassCard>

                  {calculos.map((c, i) => (
                    <GlassCard key={i} style={{ padding: "16px 18px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 4 }}>
                        <p style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</p>
                        <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 99, background: `${BOBINA_COLORS[i]}18`, color: BOBINA_COLORS[i] }}>{c.clase}</span>
                      </div>
                      <div style={{ display: "flex", alignItems: "baseline", gap: 3 }}>
                        <span style={{ fontSize: 24, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.03em" }}>{c.horas !== null ? c.horas.toFixed(1) : "—"}</span>
                        <span style={{ fontSize: 11, color: "#64748b" }}>hrs</span>
                      </div>
                      <p style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                        {c.peso > 0 ? `${c.peso} kg` : "Sin peso"}{c.coeficiente ? ` · ×${c.coeficiente}` : " · Sin coef."}
                      </p>
                    </GlassCard>
                  ))}
                </div>

                {/* Main layout */}
                <div className="main-layout">
                  {/* Left column */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
                    {/* Régimen */}
                    <GlassCard style={{ padding: "18px 20px" }}>
                      <SectionTitle>Régimen de Regulación</SectionTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                        {REGIMENES.map((r) => (
                          <button key={r} onClick={() => setRegimen(r)} style={{ width: "100%", textAlign: "left", padding: "8px 12px", borderRadius: 9, border: regimen === r ? "1.5px solid #f97316" : "1.5px solid transparent", background: regimen === r ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.4)", cursor: "pointer", fontSize: 12, fontWeight: regimen === r ? 600 : 400, color: regimen === r ? "#fb923c" : "#94a3b8", fontFamily: "inherit", transition: "all 0.12s" }}>
                            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ width: 5, height: 5, borderRadius: "50%", background: regimen === r ? "#f97316" : "#475569", flexShrink: 0 }} />
                              {REGIMEN_LABELS[r]}
                              {r === "BT_Bajo_Carga" && <span style={{ fontSize: 9, marginLeft: "auto", color: "#3b82f6", fontWeight: 700 }}>EEUU</span>}
                            </span>
                          </button>
                        ))}
                      </div>
                    </GlassCard>

                    {/* Bobinas */}
                    <GlassCard style={{ padding: "18px 20px" }}>
                      <SectionTitle right={bobinas.length < 4 && (
                        <button className="btn-add" onClick={addBobina} style={{ padding: "4px 12px", background: "#f97316", color: "white", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit", display: "flex", alignItems: "center", gap: 3 }}>
                          <span style={{ fontSize: 14, lineHeight: 1 }}>+</span> Agregar
                        </button>
                      )}>Bobinas ({bobinas.length}/4)</SectionTitle>

                      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                        {bobinas.map((b, i) => {
                          const tipos = getTipos(b.clase);
                          const conds = b.tipo ? getConductores(b.clase, b.tipo) : [];
                          return (
                            <div key={i} className="bobina-card" style={{ padding: "12px", borderRadius: 11, background: "rgba(30,41,59,0.5)", border: `1px solid ${BOBINA_COLORS[i]}30` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <div style={{ width: 20, height: 20, borderRadius: 5, background: BOBINA_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
                                    <span style={{ fontSize: 10, fontWeight: 700, color: "white" }}>{i + 1}</span>
                                  </div>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>Bobina {i + 1}</span>
                                </div>
                                {bobinas.length > 1 && (
                                  <button className="btn-remove" onClick={() => removeBobina(i)} style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#64748b", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
                                )}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                                <SelectField label="Clase" value={b.clase} onChange={(v) => updateBobina(i, "clase", v)} options={CLASES} />
                                <SelectField label="Tipo" value={b.tipo} onChange={(v) => updateBobina(i, "tipo", v)}
                                  options={tipos.length > 0 ? [{ value: "", label: "Seleccionar..." }, ...tipos.map((t) => ({ value: t, label: capitalize(t) }))] : [{ value: "", label: "Sin tipos" }]}
                                  disabled={tipos.length === 0}
                                />
                                <div style={{ gridColumn: "span 2" }}>
                                  <SelectField label="Conductor" value={b.conductor} onChange={(v) => updateBobina(i, "conductor", v)}
                                    options={conds.length > 0 ? [{ value: "", label: "Seleccionar..." }, ...conds.map((c) => ({ value: c, label: c }))] : [{ value: "", label: b.tipo ? "Sin conductores" : "Elegí tipo" }]}
                                    disabled={conds.length === 0}
                                  />
                                </div>
                                <div style={{ gridColumn: "span 2" }}>
                                  <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>Peso (kg)</label>
                                  <input type="number" value={b.peso} onChange={(e) => updateBobina(i, "peso", e.target.value)} placeholder="0"
                                    className="filter-input"
                                    style={{ width: "100%", padding: "7px 10px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 8, fontSize: 12, color: "#e2e8f0", fontFamily: "inherit" }}
                                  />
                                </div>
                              </div>
                              {calculos[i] && (
                                <div style={{ marginTop: 8, padding: "6px 10px", borderRadius: 7, background: calculos[i].sinDatos ? "rgba(251,113,133,0.08)" : calculos[i].coeficiente ? "rgba(249,115,22,0.08)" : "rgba(30,41,59,0.3)" }}>
                                  {calculos[i].sinDatos
                                    ? <span style={{ fontSize: 11, color: "#fb7185" }}>⚠ Sin datos históricos</span>
                                    : calculos[i].coeficiente
                                      ? <span style={{ fontSize: 11, color: "#fb923c", fontWeight: 600 }}>
                                        ⚡ {calculos[i].peso} kg × {calculos[i].coeficiente} = <strong>{calculos[i].horas?.toFixed(1)} hrs</strong>
                                        <span style={{ fontWeight: 400, color: "#64748b", marginLeft: 4 }}>({calculos[i].casos} casos)</span>
                                      </span>
                                      : <span style={{ fontSize: 11, color: "#475569" }}>Completá la configuración</span>
                                  }
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>
                  </div>

                  {/* Right column */}
                  <div className="right-col">
                    {/* Chart */}
                    <GlassCard style={{ padding: "20px" }}>
                      <SectionTitle>Distribución de Horas por Bobina</SectionTitle>
                      {chartData.some((d) => d.horas > 0) ? (
                        <ResponsiveContainer width="100%" height={210}>
                          <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#475569", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
                            <Bar dataKey="horas" radius={[6, 6, 0, 0]}>
                              {chartData.map((_, i) => <Cell key={i} fill={BOBINA_COLORS[i]} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 210, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>
                          Ingresá el peso de las bobinas para ver el gráfico
                        </div>
                      )}
                    </GlassCard>

                    {/* Similar Machines */}
                    <GlassCard style={{ padding: "20px" }}>
                      <SectionTitle right={<span style={{ fontSize: 10, padding: "2px 8px", borderRadius: 99, background: "rgba(249,115,22,0.1)", color: "#f97316", fontWeight: 600 }}>Top 6</span>}>
                        Máquinas Similares
                      </SectionTitle>
                      <p style={{ fontSize: 11, color: "#475569", marginBottom: 12, marginTop: -6 }}>
                        Peso: {calculos.reduce((s, c) => s + c.peso, 0).toFixed(0)} kg · {REGIMEN_LABELS[regimen]} · {bobinas.length} bobina{bobinas.length > 1 ? "s" : ""} · ±20%
                      </p>
                      {similares.length === 0 ? (
                        <div style={{ padding: "20px 0", textAlign: "center", color: "#475569", fontSize: 12 }}>
                          Ingresá peso en las bobinas para buscar similares
                        </div>
                      ) : (
                        <div style={{ overflowX: "auto" }}>
                          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                            <thead>
                              <tr>
                                {["", "OT", "Tubos", "Peso P.A.", "Hs Real", "Desvío", "Match"].map((h) => (
                                  <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "nowrap" }}>{h}</th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {similares.map((m) => (
                                <tr key={m.OT} className="clickable-row" onClick={() => openOT(m.OT)}>
                                  <td style={{ padding: "8px 6px", borderBottom: "1px solid rgba(148,163,184,0.06)", width: 20 }}>
                                    {Math.abs(m.desvioTotal) > DESVIO_ALERT && <AlertIcon />}
                                  </td>
                                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                    <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.OT}</span>
                                  </td>
                                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)", color: "#94a3b8" }}>{(m.tubos || []).length}</td>
                                  <td style={{ padding: "8px 10px", fontWeight: 600, color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{Math.round(m.peso_parte_activa || 0).toLocaleString()}</td>
                                  <td style={{ padding: "8px 10px", fontWeight: 600, color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{(m.total_hs_real || 0).toLocaleString()}</td>
                                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                    <DevioBadge value={m.desvioTotal} />
                                  </td>
                                  <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                    {m.enRango && m.mismoRegimen && m.mismasClases
                                      ? <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(52,211,153,0.12)", color: "#34d399" }}>● Exacto</span>
                                      : m.enRango && m.mismoRegimen
                                        ? <span style={{ fontSize: 9, fontWeight: 700, padding: "2px 7px", borderRadius: 99, background: "rgba(249,115,22,0.12)", color: "#f97316" }}>◐ Parcial</span>
                                        : m.enRango
                                          ? <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "rgba(148,163,184,0.08)", color: "#94a3b8" }}>○ Rango</span>
                                          : <span style={{ fontSize: 9, fontWeight: 600, padding: "2px 7px", borderRadius: 99, background: "rgba(148,163,184,0.06)", color: "#475569" }}>· Lejano</span>
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
                 TAB: BUSCADOR AVANZADO
                 ═══════════════════════════════════════════ */
              <motion.div key="bus" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.2 }}>
                {/* Filters */}
                <GlassCard style={{ padding: "20px 22px", marginBottom: 18 }}>
                  <SectionTitle>Filtros Avanzados</SectionTitle>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: 12 }}>
                    {/* Text search */}
                    <div style={{ gridColumn: "span 2" }}>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>Buscar OT / Tipo</label>
                      <input className="search-input" type="text" value={fSearchText} onChange={(e) => setFSearchText(e.target.value)}
                        placeholder="N° de OT o tipo de máquina..."
                        style={{ width: "100%", padding: "8px 12px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12, color: "#e2e8f0", fontFamily: "inherit" }}
                      />
                    </div>

                    {/* Regimen */}
                    <SelectField label="Régimen" value={fRegimen} onChange={setFRegimen}
                      options={[{ value: "", label: "Todos" }, ...REGIMENES.map((r) => ({ value: r, label: REGIMEN_LABELS[r] }))]}
                    />

                    {/* Peso min/max */}
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>Peso P.A. Mín (kg)</label>
                      <input className="filter-input" type="number" value={fPesoMin} onChange={(e) => setFPesoMin(e.target.value)} placeholder="0"
                        style={{ width: "100%", padding: "7px 10px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12, color: "#e2e8f0", fontFamily: "inherit" }}
                      />
                    </div>
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>Peso P.A. Máx (kg)</label>
                      <input className="filter-input" type="number" value={fPesoMax} onChange={(e) => setFPesoMax(e.target.value)} placeholder="∞"
                        style={{ width: "100%", padding: "7px 10px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12, color: "#e2e8f0", fontFamily: "inherit" }}
                      />
                    </div>

                    {/* Tube filters */}
                    <SelectField label="Tubo: Clase" value={fTuboClase} onChange={setFTuboClase}
                      options={[{ value: "", label: "Cualquiera" }, ...CLASES.map((c) => ({ value: c, label: c }))]}
                    />
                    <SelectField label="Tubo: Tipo" value={fTuboTipo} onChange={setFTuboTipo}
                      options={[{ value: "", label: "Cualquiera" }, ...uniqueTuboTipos.map((t) => ({ value: t, label: capitalize(t) }))]}
                    />
                    <div>
                      <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 3 }}>Tubo: Tensión mín (kV)</label>
                      <input className="filter-input" type="number" value={fTensionMin} onChange={(e) => setFTensionMin(e.target.value)} placeholder="0"
                        style={{ width: "100%", padding: "7px 10px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.15)", borderRadius: 8, fontSize: 12, color: "#e2e8f0", fontFamily: "inherit" }}
                      />
                    </div>
                  </div>
                  <p style={{ fontSize: 11, color: "#475569", marginTop: 10 }}>
                    {maquinasConDesvio.length} resultado{maquinasConDesvio.length !== 1 ? "s" : ""} de {data?.historico_maquinas?.length || 0} OTs
                    {(fTuboClase || fTuboTipo || fTensionMin) && <span style={{ color: "#f97316", marginLeft: 6 }}>· Filtro de tubo activo</span>}
                  </p>
                </GlassCard>

                {/* Results */}
                <GlassCard style={{ padding: "20px" }}>
                  <div style={{ overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead>
                        <tr>
                          {["", "OT", "Tipo", "Régimen", "Peso P.A.", "Tubos", "Hs Real", "Hs Teórico", "Desvío", ""].map((h, idx) => (
                            <th key={idx} style={{ textAlign: "left", padding: "7px 10px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", letterSpacing: "0.06em", borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "nowrap" }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {maquinasConDesvio.length === 0 ? (
                          <tr><td colSpan={10} style={{ padding: "36px 12px", textAlign: "center", color: "#475569", fontSize: 13 }}>Sin resultados para los filtros seleccionados</td></tr>
                        ) : (
                          maquinasConDesvio.map((m) => (
                            <tr key={m.OT} className="clickable-row" onClick={() => openOT(m.OT)}>
                              <td style={{ padding: "8px 6px", borderBottom: "1px solid rgba(148,163,184,0.06)", width: 20 }}>
                                {Math.abs(m._desvioTotal) > DESVIO_ALERT && <AlertIcon />}
                              </td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.OT}</span>
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 500, color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.06)", whiteSpace: "nowrap" }}>{m.tipo_maquina}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                <span style={{
                                  fontSize: 10, padding: "2px 7px", borderRadius: 99, fontWeight: 600, whiteSpace: "nowrap",
                                  background: m.regimen === "AT_Bajo_Carga" ? "rgba(249,115,22,0.1)" : m.regimen === "BT_Bajo_Carga" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.08)",
                                  color: m.regimen === "AT_Bajo_Carga" ? "#fb923c" : m.regimen === "BT_Bajo_Carga" ? "#60a5fa" : "#94a3b8"
                                }}>{REGIMEN_LABELS[m.regimen] || m.regimen}</span>
                              </td>
                              <td style={{ padding: "8px 10px", fontWeight: 600, color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{Math.round(m.peso_parte_activa || 0).toLocaleString()}</td>
                              <td style={{ padding: "8px 10px", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{(m.tubos || []).length}</td>
                              <td style={{ padding: "8px 10px", fontWeight: 600, color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{(m.total_hs_real || 0).toLocaleString()}</td>
                              <td style={{ padding: "8px 10px", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.06)", fontFamily: "monospace" }}>{m._totalTeo.toFixed(0)}</td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                <DevioBadge value={m._desvioTotal} />
                              </td>
                              <td style={{ padding: "8px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                                <span style={{ fontSize: 10, color: "#f97316", fontWeight: 600 }}>Analizar →</span>
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

          <div style={{ textAlign: "center", marginTop: 36, paddingBottom: 8 }}>
            <p style={{ fontSize: 11, color: "#334155" }}>Cerebro PWA · Control de Desvíos · Fábrica de Transformadores · {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      {/* ─── Full-screen OT Analysis Modal ─── */}
      <AnimatePresence>
        {selectedOT && (
          <OTAnalysisModal
            maquina={selectedOT}
            coefMap={coefMap}
            onClose={() => setSelectedOT(null)}
          />
        )}
      </AnimatePresence>
    </>
  );
}
