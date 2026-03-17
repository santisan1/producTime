import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, Cell, LineChart, Line, ReferenceLine,
} from "recharts";
import { motion, AnimatePresence } from "framer-motion";

/* ═══════════════════════════════════════════════════════════════
   CONSTANTS & MAPPINGS
   ═══════════════════════════════════════════════════════════════ */
const CONS_LABELS = { disco: "Disco", doseps: "Dos Capas", helice: "Hélice", hmultiple: "H.Múltiple", ism: "ISM", wendel: "Wendel" };
const ROLE_LABELS = { primary: "Primario", secondary: "Secundario", tertiary: "Terciario", regulation: "Regulación", autotransformer_common: "Común (AT)", autotransformer_series: "Serie (AT)", compensation: "Compensación" };
const REGIME_LABELS = { Estandar: "Estándar", AT_Bajo_Carga: "AT Bajo Carga", BT_Bajo_Carga: "BT Bajo Carga" };
const CLASS_COLORS = { AT: "#f97316", BT: "#3b82f6", MT: "#8b5cf6", RF: "#10b981", SERIE: "#ec4899", COMUN: "#06b6d4", COMPENSACION: "#84cc16", TERC: "#eab308" };
const ACT_COLORS = { AT: "#f97316", BT: "#3b82f6", MT: "#8b5cf6", RF: "#10b981", montaje: "#e11d48", nucleo: "#0891b2", conexiones: "#ca8a04" };
const ACT_LABELS = { AT: "Bobinado AT", BT: "Bobinado BT", MT: "Bobinado MT", RF: "Bobinado RF", montaje: "Montaje", nucleo: "Núcleo", conexiones: "Conexiones" };
const POWER_PRESETS = [{ l: "0–10", a: 0, b: 10 }, { l: "10–40", a: 10, b: 40 }, { l: "40–80", a: 40, b: 80 }, { l: "80–120", a: 80, b: 120 }, { l: "120–200", a: 120, b: 200 }, { l: "200+", a: 200, b: 300 }];
const DESVIO_ALERT = 15;
const capitalize = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
const fmt = (n, d = 1) => n != null && isFinite(n) ? Number(n).toFixed(d) : "—";
const fmtK = (n) => n != null ? (n >= 1000 ? `${(n / 1000).toFixed(1)}T` : Math.round(n).toLocaleString()) : "—";

/* ═══════════════════════════════════════════════════════════════
   HOOKS
   ═══════════════════════════════════════════════════════════════ */
function useDebounce(v, ms) {
  const [d, setD] = useState(v);
  useEffect(() => { const t = setTimeout(() => setD(v), ms); return () => clearTimeout(t); }, [v, ms]);
  return d;
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY — Match score (0–100)
   ═══════════════════════════════════════════════════════════════ */
function jaccard(a, b) {
  const sa = new Set(a), sb = new Set(b);
  const inter = [...sa].filter(x => sb.has(x)).length;
  const union = new Set([...sa, ...sb]).size;
  return union > 0 ? inter / union : 0;
}

function computeMatchScore(ref, cand) {
  const rs = ref.search_index?.similarity_vector, cs = cand.search_index?.similarity_vector;
  if (!rs || !cs) return 0;
  const vScore = 1 - Math.min(Math.abs((rs.highest_voltage_kv || 1) - (cs.highest_voltage_kv || 1)) / Math.max(rs.highest_voltage_kv || 1, cs.highest_voltage_kv || 1), 1);
  const pScore = 1 - Math.min(Math.abs((rs.nominal_power_mva || 1) - (cs.nominal_power_mva || 1)) / Math.max(rs.nominal_power_mva || 1, cs.nominal_power_mva || 1), 1);
  const countScore = rs.winding_count === cs.winding_count ? 1 : Math.max(0, 1 - Math.abs(rs.winding_count - cs.winding_count) / 4);
  const rf = ref.search_index.filterable, cf = cand.search_index.filterable;
  const classJ = jaccard(rf.normalized_classes || [], cf.normalized_classes || []);
  const typeJ = jaccard(rf.construction_types || [], cf.construction_types || []);
  const condJ = jaccard(rf.conductor_types || [], cf.conductor_types || []);
  const archScore = countScore * 0.4 + classJ * 0.3 + typeJ * 0.2 + condJ * 0.1;
  const regScore = rs.regime === cs.regime ? 1 : 0;
  const wRef = ref.search_index.sortable?.active_part_weight_kg || 1, wCand = cand.search_index.sortable?.active_part_weight_kg || 1;
  const wScore = 1 - Math.min(Math.abs(wRef - wCand) / Math.max(wRef, wCand), 1);
  return Math.round((vScore * 0.30 + pScore * 0.20 + archScore * 0.30 + regScore * 0.10 + wScore * 0.10) * 100);
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY — Cumulative curve data
   ═══════════════════════════════════════════════════════════════ */
function prepareCumulativeData(activities) {
  let lastTheo = 0;
  const data = [{ name: "Inicio", real: 0, teorico: 0 }];
  for (const a of (activities || [])) {
    if (a.cumulative_theoretical_hours != null) lastTheo = a.cumulative_theoretical_hours;
    data.push({
      name: (a.activity_name || a.activity_code).replace("Bobinado ", "Bob. ").replace("Núcleo", "Núcleo"),
      code: a.activity_code, real: a.cumulative_real_hours || 0, teorico: lastTheo,
      isBob: a.group === "bobinado",
    });
  }
  return data;
}

/* ═══════════════════════════════════════════════════════════════
   UTILITY — Generate insights
   ═══════════════════════════════════════════════════════════════ */
function generateInsights(machine, family, siblings) {
  const ins = [];
  const bobActs = (machine.activities || []).filter(a => a.group === "bobinado" && a.deviation_pct != null && a.real_hours > 0);
  if (bobActs.length > 0) {
    const worst = bobActs.reduce((a, b) => (b.deviation_pct > a.deviation_pct ? b : a));
    if (worst.deviation_pct > 15) ins.push({ t: "warning", text: `${worst.activity_name} presenta un sobreconsumo del ${fmt(worst.deviation_pct)}% respecto al coeficiente técnico.` });
    const best = bobActs.reduce((a, b) => (b.deviation_pct < a.deviation_pct ? b : a));
    if (best.deviation_pct < -5) ins.push({ t: "success", text: `${best.activity_name} compensó parcialmente con un ahorro del ${fmt(Math.abs(best.deviation_pct))}%.` });
  }
  const am = machine.analytics?.activity_metrics;
  if (am && am.assembly_hours_total > am.winding_hours_total * 1.5)
    ins.push({ t: "info", text: `Ensamble (${fmt(am.assembly_hours_total, 0)}h) supera +50% al bobinado (${fmt(am.winding_hours_total, 0)}h). Revisar montaje y núcleo.` });
  const bp = machine.analytics?.benchmark_position;
  if (family && bp) {
    if (bp.real_hours_percentile <= 25) ins.push({ t: "success", text: `Percentil 25 más eficiente de su familia (${family.case_count} trafos).` });
    else if (bp.real_hours_percentile >= 75) ins.push({ t: "warning", text: `Cuartil superior en horas reales (percentil ${fmt(bp.real_hours_percentile, 0)}) entre ${family.case_count} trafos similares.` });
  }
  const wm = machine.analytics?.winding_metrics;
  if (wm?.dominant_winding_by_weight && wm.dominant_winding_by_voltage && wm.dominant_winding_by_weight !== wm.dominant_winding_by_voltage)
    ins.push({ t: "info", text: `Devanado de mayor peso (${wm.dominant_winding_by_weight}) difiere del de mayor tensión (${wm.dominant_winding_by_voltage}).` });
  if (machine.quality_flags?.length > 0)
    machine.quality_flags.forEach(f => ins.push({ t: "info", text: f.message || "Flag de calidad detectado." }));
  if (siblings?.length >= 3) {
    const devs = siblings.map(s => s.analytics?.totals?.deviation_pct).filter(d => d != null);
    const avgDev = devs.reduce((a, b) => a + b, 0) / devs.length;
    const thisDev = machine.analytics?.totals?.deviation_pct;
    if (thisDev != null && Math.abs(thisDev - avgDev) > 20)
      ins.push({ t: "warning", text: `Desvío de esta OT (${fmt(thisDev)}%) difiere significativamente del promedio familiar (${fmt(avgDev)}%).` });
  }
  if (ins.length === 0) ins.push({ t: "success", text: "OT dentro de parámetros esperados. Sin anomalías detectadas." });
  return ins;
}

/* ═══════════════════════════════════════════════════════════════
   ATOMIC COMPONENTS
   ═══════════════════════════════════════════════════════════════ */
const sGlass = { background: "rgba(15,23,42,0.55)", backdropFilter: "blur(18px)", WebkitBackdropFilter: "blur(18px)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 16, boxShadow: "0 8px 32px rgba(0,0,0,0.18)", color: "#e2e8f0" };
const GlassCard = ({ children, style = {}, className = "", onClick }) => (
  <div className={className} onClick={onClick} style={{ ...sGlass, ...style }}>{children}</div>
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
const Label = ({ children }) => (
  <label style={{ fontSize: 10, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em" }}>{children}</label>
);
const DevioBadge = ({ value, size = "sm" }) => {
  if (value == null || !isFinite(value)) return <span style={{ color: "#64748b", fontSize: 11 }}>—</span>;
  const neg = value < 0, color = neg ? "#34d399" : value > 0 ? "#fb7185" : "#94a3b8";
  const bg = neg ? "rgba(52,211,153,0.12)" : value > 0 ? "rgba(251,113,133,0.12)" : "rgba(148,163,184,0.08)";
  const sz = size === "lg" ? { fontSize: 14, padding: "4px 12px" } : { fontSize: 11, padding: "2px 8px" };
  return <span style={{ fontWeight: 700, borderRadius: 99, background: bg, color, whiteSpace: "nowrap", ...sz }}>{neg ? "↓" : value > 0 ? "↑" : "="} {Math.abs(value).toFixed(1)}%</span>;
};
const AlertIcon = () => <span title="Desvío > 15%" style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 18, height: 18, borderRadius: 99, background: "rgba(251,113,133,0.18)", color: "#fb7185", fontSize: 11, fontWeight: 700, flexShrink: 0, cursor: "help" }}>!</span>;
const SimilarityBadge = ({ score }) => {
  const color = score >= 90 ? "#34d399" : score >= 70 ? "#fbbf24" : score >= 50 ? "#f97316" : "#94a3b8";
  const bg = score >= 90 ? "rgba(52,211,153,0.12)" : score >= 70 ? "rgba(251,191,36,0.12)" : score >= 50 ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.08)";
  return <span style={{ fontSize: 12, fontWeight: 800, padding: "3px 10px", borderRadius: 99, background: bg, color, fontFamily: "monospace" }}>{score}%</span>;
};
const ArchTag = ({ label, color = "#475569" }) => (
  <span style={{ fontSize: 9, fontWeight: 600, padding: "1px 6px", borderRadius: 4, background: `${color}18`, color, whiteSpace: "nowrap", letterSpacing: "0.02em" }}>{label}</span>
);
const Chip = ({ label, onRemove, active = true }) => (
  <span style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 10, fontWeight: 600, padding: "3px 8px", borderRadius: 99, background: active ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.08)", color: active ? "#fb923c" : "#64748b", cursor: onRemove ? "pointer" : "default", whiteSpace: "nowrap" }}>
    {label}{onRemove && <span onClick={onRemove} style={{ marginLeft: 2, cursor: "pointer", fontWeight: 700, opacity: 0.6 }}>×</span>}
  </span>
);
const EmptyState = ({ icon = "🔍", title, text }) => (
  <div style={{ padding: "48px 24px", textAlign: "center" }}>
    <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
    <h3 style={{ fontSize: 15, fontWeight: 700, color: "#f8fafc", marginBottom: 6 }}>{title}</h3>
    <p style={{ fontSize: 12, color: "#64748b", maxWidth: 360, margin: "0 auto" }}>{text}</p>
  </div>
);
const SkeletonCard = () => (
  <div style={{ ...sGlass, padding: "20px", animation: "pulse 1.5s ease-in-out infinite" }}>
    <div style={{ height: 10, width: "40%", background: "rgba(148,163,184,0.12)", borderRadius: 4, marginBottom: 12 }} />
    <div style={{ height: 24, width: "60%", background: "rgba(148,163,184,0.08)", borderRadius: 4, marginBottom: 8 }} />
    <div style={{ height: 8, width: "80%", background: "rgba(148,163,184,0.06)", borderRadius: 4 }} />
  </div>
);
const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "rgba(15,23,42,0.95)", border: "1px solid rgba(148,163,184,0.2)", borderRadius: 10, padding: "10px 14px", boxShadow: "0 4px 20px rgba(0,0,0,0.3)" }}>
      <p style={{ fontWeight: 700, color: "#f8fafc", marginBottom: 4, fontSize: 12 }}>{label}</p>
      {payload.map(p => <p key={p.dataKey} style={{ color: p.color || p.stroke, fontWeight: 600, fontSize: 12 }}>{p.name}: {fmt(p.value)} hrs</p>)}
    </div>
  );
};

/* ═══════════════════════════════════════════════════════════════
   DUAL RANGE SLIDER
   ═══════════════════════════════════════════════════════════════ */
function DualRangeSlider({ min, max, value, onChange, step = 1, label, formatValue = String }) {
  const [low, high] = value;
  const range = max - min || 1;
  const pL = ((low - min) / range) * 100, pH = ((high - min) / range) * 100;
  return (
    <div style={{ padding: "0 0 4px" }}>
      {label && (
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
          <Label>{label}</Label>
          <span style={{ fontSize: 11, color: "#94a3b8", fontFamily: "monospace" }}>{formatValue(low)} — {formatValue(high)}</span>
        </div>
      )}
      <div className="range-track-wrap" style={{ position: "relative", height: 24 }}>
        <div style={{ position: "absolute", top: 10, left: 0, right: 0, height: 4, background: "rgba(30,41,59,0.8)", borderRadius: 2 }} />
        <div style={{ position: "absolute", top: 10, left: `${pL}%`, width: `${pH - pL}%`, height: 4, background: "#f97316", borderRadius: 2 }} />
        <input type="range" className="dual-range" min={min} max={max} step={step} value={low} onChange={e => { const v = +e.target.value; onChange([Math.min(v, high - step), high]); }} />
        <input type="range" className="dual-range" min={min} max={max} step={step} value={high} onChange={e => { const v = +e.target.value; onChange([low, Math.max(v, low + step)]); }} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   CHIP MULTI-SELECT
   ═══════════════════════════════════════════════════════════════ */
function ChipMultiSelect({ label, options, selected, onChange, colorMap = {} }) {
  const toggle = (v) => onChange(selected.includes(v) ? selected.filter(x => x !== v) : [...selected, v]);
  return (
    <div>
      {label && <div style={{ marginBottom: 4 }}><Label>{label}</Label></div>}
      <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
        {options.map(opt => {
          const val = typeof opt === "string" ? opt : opt.value;
          const lbl = typeof opt === "string" ? opt : opt.label;
          const active = selected.includes(val);
          const col = colorMap[val] || "#f97316";
          return (
            <button key={val} onClick={() => toggle(val)} style={{
              padding: "4px 10px", borderRadius: 99, border: active ? `1.5px solid ${col}` : "1.5px solid rgba(148,163,184,0.12)",
              background: active ? `${col}18` : "rgba(30,41,59,0.4)", cursor: "pointer", fontSize: 11,
              fontWeight: active ? 700 : 500, color: active ? col : "#94a3b8", fontFamily: "inherit", transition: "all 0.12s",
            }}>{lbl}</button>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   TRI-STATE TOGGLE (Yes / No / Any)
   ═══════════════════════════════════════════════════════════════ */
function TriToggle({ label, value, onChange }) {
  const opts = [{ v: null, l: "Todos" }, { v: true, l: "Sí" }, { v: false, l: "No" }];
  return (
    <div>
      <div style={{ marginBottom: 4 }}><Label>{label}</Label></div>
      <div style={{ display: "flex", gap: 2, background: "rgba(30,41,59,0.5)", padding: 2, borderRadius: 8 }}>
        {opts.map(o => (
          <button key={String(o.v)} onClick={() => onChange(o.v)} style={{
            flex: 1, padding: "4px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 10, fontWeight: value === o.v ? 700 : 500,
            background: value === o.v ? "rgba(249,115,22,0.15)" : "transparent", color: value === o.v ? "#fb923c" : "#64748b", fontFamily: "inherit",
          }}>{o.l}</button>
        ))}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   WINDING FILTER BLOCK
   ═══════════════════════════════════════════════════════════════ */
function WindingFilterBlock({ index, filter, onChange, onRemove, catalogs }) {
  const upd = (k, v) => onChange({ ...filter, [k]: v });
  const roles = ["primary", "secondary", "tertiary", "regulation"];
  const classes = catalogs?.winding_classes_normalized || ["AT", "BT", "MT", "RF"];
  const consTypes = catalogs?.construction_types || [];
  const conductors = catalogs?.conductors || [];
  return (
    <div style={{ padding: "12px 14px", borderRadius: 10, background: "rgba(30,41,59,0.5)", border: "1px solid rgba(148,163,184,0.1)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <span style={{ width: 22, height: 22, borderRadius: 6, background: CLASS_COLORS[filter.clase] || "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white" }}>{index + 1}</span>
          <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>Devanado {index + 1}</span>
        </div>
        <button onClick={onRemove} className="btn-remove" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#64748b", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
        <div>
          <Label>Rol</Label>
          <select value={filter.role} onChange={e => upd("role", e.target.value)} className="sel-field">
            <option value="">Cualquiera</option>
            {roles.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </div>
        <div>
          <Label>Clase</Label>
          <select value={filter.clase} onChange={e => upd("clase", e.target.value)} className="sel-field">
            <option value="">Cualquiera</option>
            {classes.map(c => <option key={c} value={c}>{c}</option>)}
          </select>
        </div>
      </div>
      <div style={{ marginTop: 8 }}>
        <ChipMultiSelect label="Tipo Constructivo" options={consTypes.map(t => ({ value: t, label: CONS_LABELS[t] || capitalize(t) }))} selected={filter.constructionTypes || []} onChange={v => upd("constructionTypes", v)} />
      </div>
      <div style={{ marginTop: 8 }}>
        <ChipMultiSelect label="Conductor" options={conductors.map(c => ({ value: c, label: c }))} selected={filter.conductors || []} onChange={v => upd("conductors", v)} />
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   FULL-SCREEN OT ANALYSIS MODAL
   ═══════════════════════════════════════════════════════════════ */
function OTAnalysisModal({ machine, data, onClose }) {
  const familyId = machine?.analytics?.benchmark_position?.family_group_id;
  const family = useMemo(() => (data.benchmarks?.families || []).find(f => f.family_group_id === familyId), [data, familyId]);
  const siblings = useMemo(() => (data.machines || []).filter(m => m.analytics?.benchmark_position?.family_group_id === familyId && m.ot_id !== machine.ot_id), [data, familyId, machine.ot_id]);
  const cumData = useMemo(() => prepareCumulativeData(machine.activities), [machine]);
  const insights = useMemo(() => generateInsights(machine, family, siblings), [machine, family, siblings]);
  const id = machine.identity || {};
  const an = machine.analytics || {};
  const tot = an.totals || {};
  const activities = machine.activities || [];
  const windings = machine.windings || [];

  // Activity chart data with benchmark overlay
  const actChartData = useMemo(() => activities.filter(a => a.real_hours > 0 || (a.theoretical_hours != null && a.theoretical_hours > 0)).map(a => ({
    name: (ACT_LABELS[a.activity_code] || a.activity_name || "").replace("Bobinado ", "Bob. "),
    real: a.real_hours, teorico: a.theoretical_hours,
    familia_mean: family?.activity_means?.[a.activity_code] ?? null,
    familia_median: family?.activity_medians?.[a.activity_code] ?? null,
    desvio: a.deviation_pct,
  })), [activities, family]);

  // Heatmap data
  const heatmapData = useMemo(() => {
    if (siblings.length === 0) return null;
    const allOTs = [machine, ...siblings].slice(0, 8);
    const actCodes = ["BT", "AT", "MT", "RF", "montaje", "nucleo", "conexiones"];
    return { ots: allOTs, actCodes, matrix: actCodes.map(code => ({ code, label: ACT_LABELS[code] || code, values: allOTs.map(ot => { const a = (ot.activities || []).find(x => x.activity_code === code); return a?.deviation_pct ?? null; }) })) };
  }, [machine, siblings]);

  // Escape key
  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const heatColor = (v) => {
    if (v == null) return "rgba(148,163,184,0.06)";
    if (v < -15) return "rgba(52,211,153,0.3)";
    if (v < -5) return "rgba(52,211,153,0.15)";
    if (v < 5) return "rgba(148,163,184,0.08)";
    if (v < 15) return "rgba(251,113,133,0.15)";
    return "rgba(251,113,133,0.3)";
  };

  if (!machine) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(2,6,23,0.95)", backdropFilter: "blur(10px)", overflowY: "auto", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 28px 60px" }}>
        {/* Header */}
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>←</button>
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2, flexWrap: "wrap" }}>
                <span style={{ fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 99, background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white" }}>OT {machine.ot_id}</span>
                <span style={{ fontSize: 11, fontWeight: 600, padding: "3px 10px", borderRadius: 99, background: "rgba(249,115,22,0.15)", color: "#fb923c" }}>{REGIME_LABELS[machine.regime] || machine.regime}</span>
                {id.topology_type && <ArchTag label={id.topology_type.replace(/_/g, " ")} />}
                {Math.abs(tot.deviation_pct || 0) > DESVIO_ALERT && <AlertIcon />}
              </div>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: "#f8fafc", letterSpacing: "-0.02em" }}>{machine.machine_type} — Análisis de Desvíos</h2>
            </div>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
        </div>

        {/* KPI row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))", gap: 12, marginBottom: 22 }}>
          {[
            { l: "Peso Parte Activa", v: fmtK(id.active_part_weight_kg) + " kg", a: "#f97316" },
            { l: "Potencia Nominal", v: `${fmt(id.power_nominal_mva_est, 0)} MVA`, a: "#8b5cf6" },
            { l: "Horas Reales", v: `${fmt(tot.real_hours, 0)} hrs`, a: "#fb7185" },
            { l: "Horas Teóricas (Bob.)", v: `${fmt(an.coefficient_estimates?.estimated_total_winding_hours, 0)} hrs`, a: "#3b82f6" },
            { l: "Desvío Total", v: <DevioBadge value={tot.deviation_pct} size="lg" />, a: Math.abs(tot.deviation_pct || 0) > DESVIO_ALERT ? "#fb7185" : "#34d399" },
            { l: "Devanados", v: `${id.winding_count || windings.length}`, a: "#0891b2" },
          ].map(kpi => (
            <GlassCard key={kpi.l} style={{ padding: "16px 18px" }}>
              <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>{kpi.l}</p>
              <div style={{ fontSize: 22, fontWeight: 800, color: kpi.a, letterSpacing: "-0.03em" }}>{kpi.v}</div>
            </GlassCard>
          ))}
        </div>

        {/* Cumulative curve */}
        <GlassCard style={{ padding: "22px", marginBottom: 18 }}>
          <SectionTitle>Curva Acumulada — Historia del Desvío</SectionTitle>
          <p style={{ fontSize: 11, color: "#475569", marginBottom: 12, marginTop: -6 }}>La línea teórica aplana tras bobinado (sin coeficiente para ensamble). El gap indica horas no modelizadas.</p>
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={cumData} margin={{ top: 8, right: 12, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#475569", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 11, color: "#94a3b8" }} />
              <Line type="monotone" dataKey="real" name="Real Acumulado" stroke="#fb7185" strokeWidth={2.5} dot={{ r: 3, fill: "#fb7185" }} />
              <Line type="monotone" dataKey="teorico" name="Teórico Acumulado" stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3" dot={{ r: 3, fill: "#3b82f6" }} />
              {family && <ReferenceLine y={family.real_hours.mean} stroke="#64748b" strokeDasharray="4 2" label={{ value: `Media familia: ${fmt(family.real_hours.mean, 0)}h`, fill: "#64748b", fontSize: 10, position: "right" }} />}
            </LineChart>
          </ResponsiveContainer>
        </GlassCard>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
          {/* Activity comparison bars with benchmark */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Real vs Teórico vs Familia</SectionTitle>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={actChartData} barGap={2} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "#475569", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
                <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
                <Bar dataKey="real" name="Real" fill="#fb7185" radius={[4, 4, 0, 0]} />
                <Bar dataKey="teorico" name="Teórico" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                {family && <Bar dataKey="familia_mean" name="Media Familia" fill="#475569" radius={[4, 4, 0, 0]} fillOpacity={0.5} />}
              </BarChart>
            </ResponsiveContainer>
          </GlassCard>

          {/* Benchmark position panel */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle right={family && <span style={{ fontSize: 10, fontWeight: 600, color: "#64748b" }}>{family.case_count} trafos en familia</span>}>
              Benchmark Familiar
            </SectionTitle>
            {family ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {[
                  { l: "Horas Reales", me: family.real_hours.mean, md: family.real_hours.median, mn: family.real_hours.min, mx: family.real_hours.max, cur: tot.real_hours },
                ].map(b => (
                  <div key={b.l}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                      <span style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8" }}>{b.l}</span>
                      <span style={{ fontSize: 11, fontWeight: 700, color: "#f8fafc" }}>{fmt(b.cur, 0)} hrs</span>
                    </div>
                    {/* Range bar */}
                    <div style={{ position: "relative", height: 20, background: "rgba(30,41,59,0.5)", borderRadius: 6, overflow: "hidden" }}>
                      {(() => {
                        const lo = b.mn, hi = b.mx, range = hi - lo || 1;
                        const curPct = Math.min(Math.max(((b.cur - lo) / range) * 100, 0), 100);
                        const meanPct = ((b.me - lo) / range) * 100;
                        return (<>
                          <div style={{ position: "absolute", top: 0, left: 0, height: "100%", width: `${curPct}%`, background: "linear-gradient(90deg, rgba(249,115,22,0.2), rgba(249,115,22,0.35))", borderRadius: 6 }} />
                          <div style={{ position: "absolute", top: 0, left: `${meanPct}%`, width: 2, height: "100%", background: "#64748b" }} title={`Media: ${fmt(b.me, 0)}`} />
                          <div style={{ position: "absolute", top: 0, left: `${curPct}%`, width: 3, height: "100%", background: "#f97316", borderRadius: 2 }} />
                        </>);
                      })()}
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9, color: "#475569", marginTop: 2 }}>
                      <span>Mín: {fmt(b.mn, 0)}</span>
                      <span>Media: {fmt(b.me, 0)}</span>
                      <span>Mediana: {fmt(b.md, 0)}</span>
                      <span>Máx: {fmt(b.mx, 0)}</span>
                    </div>
                  </div>
                ))}
                <div style={{ marginTop: 4, padding: "10px 12px", borderRadius: 8, background: "rgba(30,41,59,0.4)" }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                    <div><Label>Percentil Horas</Label><div style={{ fontSize: 18, fontWeight: 800, color: "#f97316", marginTop: 2 }}>{fmt(machine.analytics?.benchmark_position?.real_hours_percentile, 0)}</div></div>
                    <div><Label>Percentil Desvío</Label><div style={{ fontSize: 18, fontWeight: 800, color: tot.deviation_pct > 0 ? "#fb7185" : "#34d399", marginTop: 2 }}>{fmt(machine.analytics?.benchmark_position?.deviation_percentile, 0)}</div></div>
                    <div><Label>Desvío medio familia</Label><div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginTop: 2 }}>{fmt(family.outlier_stats?.deviation_mean)}%</div></div>
                    <div><Label>Std Horas familia</Label><div style={{ fontSize: 14, fontWeight: 700, color: "#94a3b8", marginTop: 2 }}>{fmt(family.outlier_stats?.real_hours_std, 0)} hrs</div></div>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState icon="📊" title="Sin familia benchmark" text="Esta OT no tiene suficientes trafos comparables para generar benchmark." />
            )}
          </GlassCard>
        </div>

        {/* Deviation table + Windings */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Desvío por Actividad</SectionTitle>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>
                {["Actividad", "Real", "Teórico", "Desvío"].map(h => <th key={h} style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>{h}</th>)}
              </tr></thead>
              <tbody>
                {activities.map(a => (
                  <tr key={a.activity_code}>
                    <td style={{ padding: "7px 10px", fontWeight: 600, color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 5 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 2, background: ACT_COLORS[a.activity_code] || "#475569", flexShrink: 0 }} />
                        {ACT_LABELS[a.activity_code] || a.activity_name}
                        {a.deviation_pct != null && Math.abs(a.deviation_pct) > DESVIO_ALERT && <AlertIcon />}
                      </span>
                    </td>
                    <td style={{ padding: "7px 10px", color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.06)", fontFamily: "monospace" }}>{fmt(a.real_hours)}</td>
                    <td style={{ padding: "7px 10px", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.06)", fontFamily: "monospace" }}>{a.theoretical_hours != null ? fmt(a.theoretical_hours) : "—"}</td>
                    <td style={{ padding: "7px 10px", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{a.deviation_pct != null ? <DevioBadge value={a.deviation_pct} /> : <span style={{ color: "#475569", fontSize: 11 }}>n/a</span>}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot><tr>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: "#f8fafc", borderTop: "2px solid rgba(148,163,184,0.15)" }}>Total</td>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: "#fb7185", borderTop: "2px solid rgba(148,163,184,0.15)", fontFamily: "monospace" }}>{fmt(tot.real_hours, 0)}</td>
                <td style={{ padding: "9px 10px", fontWeight: 700, color: "#3b82f6", borderTop: "2px solid rgba(148,163,184,0.15)", fontFamily: "monospace" }}>{fmt(an.coefficient_estimates?.estimated_total_winding_hours, 0)}</td>
                <td style={{ padding: "9px 10px", borderTop: "2px solid rgba(148,163,184,0.15)" }}><DevioBadge value={tot.deviation_pct} size="lg" /></td>
              </tr></tfoot>
            </table>
          </GlassCard>

          {/* Winding cards */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Configuración de Devanados</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {windings.map(w => (
                <div key={w.winding_id} style={{ padding: "10px 12px", borderRadius: 8, background: "rgba(30,41,59,0.5)", border: `1px solid ${CLASS_COLORS[w.normalized_class] || "#475569"}25` }}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 4 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                      <span style={{ width: 20, height: 20, borderRadius: 5, background: CLASS_COLORS[w.normalized_class] || "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, fontWeight: 700, color: "white" }}>{w.order}</span>
                      <span style={{ fontSize: 12, fontWeight: 600, color: "#e2e8f0" }}>{ROLE_LABELS[w.functional_role] || capitalize(w.functional_role)}</span>
                      <ArchTag label={w.normalized_class} color={CLASS_COLORS[w.normalized_class]} />
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316" }}>{fmtK(w.weight_kg)} kg</span>
                  </div>
                  <div style={{ display: "flex", gap: 12, fontSize: 11, color: "#94a3b8", flexWrap: "wrap" }}>
                    <span>Tipo: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{CONS_LABELS[w.construction_type] || capitalize(w.construction_type)}</span></span>
                    <span>Conductor: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{w.conductor_type}</span></span>
                    <span>Tensión: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{fmt(w.voltage_kv)} kV</span></span>
                    <span>Potencia: <span style={{ color: "#cbd5e1", fontWeight: 600 }}>{fmt(w.power_mva, 0)} MVA</span></span>
                  </div>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>

        {/* Heatmap + Insights */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginBottom: 18 }}>
          {/* Heatmap */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle right={heatmapData && <span style={{ fontSize: 10, color: "#64748b" }}>{heatmapData.ots.length} OTs</span>}>
              Heatmap — Familia de Desvíos
            </SectionTitle>
            {heatmapData && heatmapData.ots.length > 1 ? (
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
                  <thead><tr>
                    <th style={{ padding: "4px 8px", textAlign: "left", color: "#475569", fontWeight: 700 }}>Actividad</th>
                    {heatmapData.ots.map(ot => (
                      <th key={ot.ot_id} style={{ padding: "4px 6px", textAlign: "center", color: ot.ot_id === machine.ot_id ? "#f97316" : "#64748b", fontWeight: ot.ot_id === machine.ot_id ? 800 : 600, fontSize: 9 }}>{ot.ot_id}</th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {heatmapData.matrix.map(row => (
                      <tr key={row.code}>
                        <td style={{ padding: "4px 8px", fontWeight: 600, color: "#94a3b8", whiteSpace: "nowrap" }}>
                          <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: ACT_COLORS[row.code] || "#475569" }} />{row.label}</span>
                        </td>
                        {row.values.map((v, i) => (
                          <td key={i} style={{ padding: "3px 4px", textAlign: "center" }}>
                            <span style={{ display: "inline-block", padding: "3px 6px", borderRadius: 4, background: heatColor(v), color: v == null ? "#334155" : v < -5 ? "#34d399" : v > 15 ? "#fb7185" : v > 5 ? "#fca5a5" : "#94a3b8", fontWeight: 600, fontSize: 9, minWidth: 36, fontFamily: "monospace", border: heatmapData.ots[i].ot_id === machine.ot_id ? "1px solid #f97316" : "1px solid transparent" }}>
                              {v != null ? `${v > 0 ? "+" : ""}${fmt(v)}` : "—"}
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <EmptyState icon="🗺️" title="Familia insuficiente" text="Se necesitan ≥2 trafos en la misma familia para construir el heatmap." />
            )}
          </GlassCard>

          {/* Insights */}
          <GlassCard style={{ padding: "22px" }}>
            <SectionTitle>Hallazgos del Sistema</SectionTitle>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {insights.map((ins, i) => (
                <div key={i} style={{ padding: "10px 12px", borderRadius: 8, background: ins.t === "warning" ? "rgba(251,113,133,0.06)" : ins.t === "success" ? "rgba(52,211,153,0.06)" : "rgba(148,163,184,0.04)", borderLeft: `3px solid ${ins.t === "warning" ? "#fb7185" : ins.t === "success" ? "#34d399" : "#64748b"}` }}>
                  <p style={{ fontSize: 12, fontWeight: 500, color: ins.t === "warning" ? "#fca5a5" : ins.t === "success" ? "#6ee7b7" : "#94a3b8", lineHeight: 1.5 }}>
                    {ins.t === "warning" ? "⚠ " : ins.t === "success" ? "✓ " : "ℹ "}{ins.text}
                  </p>
                </div>
              ))}
            </div>
          </GlassCard>
        </div>
      </div>
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════════════════
   COMPARISON VIEW (2–4 OTs side by side)
   ═══════════════════════════════════════════════════════════════ */
function ComparisonView({ machines, data, onClose }) {
  const activities = ["BT", "AT", "MT", "RF", "montaje", "nucleo", "conexiones"];

  useEffect(() => { const h = e => { if (e.key === "Escape") onClose(); }; window.addEventListener("keydown", h); return () => window.removeEventListener("keydown", h); }, [onClose]);

  const compChartData = useMemo(() => activities.map(code => {
    const row = { name: (ACT_LABELS[code] || code).replace("Bobinado ", "Bob. ") };
    machines.forEach((m, i) => { const a = (m.activities || []).find(x => x.activity_code === code); row[`ot_${i}`] = a?.real_hours || 0; });
    return row;
  }), [machines]);

  const barColors = ["#f97316", "#3b82f6", "#10b981", "#8b5cf6"];

  if (!machines || machines.length < 2) return null;

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
      style={{ position: "fixed", inset: 0, zIndex: 2000, background: "rgba(2,6,23,0.95)", backdropFilter: "blur(10px)", overflowY: "auto", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "24px 28px 60px" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 24 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>←</button>
            <h2 style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>Comparación — {machines.length} OTs</h2>
          </div>
          <button onClick={onClose} style={{ width: 36, height: 36, borderRadius: 10, border: "1px solid rgba(148,163,184,0.2)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#94a3b8", fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>
        </div>

        {/* KPIs side by side */}
        <div style={{ overflowX: "auto", marginBottom: 20 }}>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
            <thead><tr>
              <th style={{ textAlign: "left", padding: "8px 12px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>Métrica</th>
              {machines.map(m => <th key={m.ot_id} style={{ textAlign: "center", padding: "8px 12px", fontSize: 11, fontWeight: 700, color: "#f97316", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>OT {m.ot_id}</th>)}
            </tr></thead>
            <tbody>
              {[
                { l: "Tipo", fn: m => m.machine_type },
                { l: "Régimen", fn: m => REGIME_LABELS[m.regime] || m.regime },
                { l: "Potencia (MVA)", fn: m => fmt(m.identity?.power_nominal_mva_est, 0) },
                { l: "Peso PA (kg)", fn: m => fmtK(m.identity?.active_part_weight_kg) },
                { l: "Devanados", fn: m => m.identity?.winding_count || (m.windings || []).length },
                { l: "Horas Reales", fn: m => fmt(m.analytics?.totals?.real_hours, 0) },
                { l: "Horas Teóricas (Bob.)", fn: m => fmt(m.analytics?.coefficient_estimates?.estimated_total_winding_hours, 0) },
                { l: "Desvío Total", fn: m => <DevioBadge value={m.analytics?.totals?.deviation_pct} /> },
                { l: "Topología", fn: m => m.identity?.topology_type?.replace(/_/g, " ") || "—" },
              ].map(row => (
                <tr key={row.l}>
                  <td style={{ padding: "7px 12px", fontWeight: 600, color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.06)", whiteSpace: "nowrap" }}>{row.l}</td>
                  {machines.map(m => <td key={m.ot_id} style={{ padding: "7px 12px", textAlign: "center", color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>{row.fn(m)}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Comparison chart */}
        <GlassCard style={{ padding: "22px", marginBottom: 20 }}>
          <SectionTitle>Horas Reales por Actividad</SectionTitle>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={compChartData} barGap={2} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: "#475569", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
              <Tooltip content={<CustomTooltip />} />
              <Legend wrapperStyle={{ fontSize: 10, color: "#94a3b8" }} />
              {machines.map((m, i) => <Bar key={m.ot_id} dataKey={`ot_${i}`} name={`OT ${m.ot_id}`} fill={barColors[i]} radius={[4, 4, 0, 0]} />)}
            </BarChart>
          </ResponsiveContainer>
        </GlassCard>

        {/* Activity hours table */}
        <GlassCard style={{ padding: "22px", marginBottom: 20 }}>
          <SectionTitle>Desglose por Actividad</SectionTitle>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead><tr>
                <th style={{ textAlign: "left", padding: "6px 10px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>Actividad</th>
                {machines.map(m => <th key={m.ot_id} style={{ textAlign: "center", padding: "6px 10px", fontSize: 10, fontWeight: 700, color: "#f97316", borderBottom: "1px solid rgba(148,163,184,0.12)" }}>OT {m.ot_id}</th>)}
              </tr></thead>
              <tbody>
                {activities.map(code => (
                  <tr key={code}>
                    <td style={{ padding: "6px 10px", fontWeight: 600, color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 6, height: 6, borderRadius: 2, background: ACT_COLORS[code] || "#475569" }} />{ACT_LABELS[code] || code}</span>
                    </td>
                    {machines.map(m => {
                      const a = (m.activities || []).find(x => x.activity_code === code);
                      return (
                        <td key={m.ot_id} style={{ padding: "6px 10px", textAlign: "center", borderBottom: "1px solid rgba(148,163,184,0.06)" }}>
                          <span style={{ fontFamily: "monospace", color: "#cbd5e1" }}>{fmt(a?.real_hours)}</span>
                          {a?.deviation_pct != null && <span style={{ marginLeft: 6 }}><DevioBadge value={a.deviation_pct} /></span>}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </GlassCard>

        {/* Winding comparison */}
        <GlassCard style={{ padding: "22px" }}>
          <SectionTitle>Configuración de Devanados</SectionTitle>
          <div style={{ display: "grid", gridTemplateColumns: `repeat(${machines.length}, 1fr)`, gap: 14 }}>
            {machines.map(m => (
              <div key={m.ot_id}>
                <p style={{ fontSize: 11, fontWeight: 700, color: "#f97316", marginBottom: 8 }}>OT {m.ot_id}</p>
                {(m.windings || []).map(w => (
                  <div key={w.winding_id} style={{ padding: "8px 10px", borderRadius: 6, background: "rgba(30,41,59,0.5)", marginBottom: 4, border: `1px solid ${CLASS_COLORS[w.normalized_class] || "#475569"}25` }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 2 }}>
                      <ArchTag label={w.normalized_class} color={CLASS_COLORS[w.normalized_class]} />
                      <span style={{ fontSize: 10, fontWeight: 600, color: "#cbd5e1" }}>{ROLE_LABELS[w.functional_role] || capitalize(w.functional_role)}</span>
                    </div>
                    <div style={{ fontSize: 10, color: "#64748b" }}>
                      {CONS_LABELS[w.construction_type] || w.construction_type} · {w.conductor_type} · {fmt(w.voltage_kv)}kV · {fmtK(w.weight_kg)}kg
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        </GlassCard>
      </div>
    </motion.div>
  );
}

const LoginPage = ({ onLogin }) => {
  const [pass, setPass] = useState("");
  const [error, setError] = useState(false);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (pass.trim() === "TTE123") {
      onLogin();
    } else {
      setError(true);
      setPass("");
    }
  };

  return (
    <div style={{
      position: "fixed", inset: 0, zIndex: 9999,
      display: "flex", alignItems: "center", justifyContent: "center",
      background: "radial-gradient(circle at center, #1e293b 0%, #0f172a 100%)",
      fontFamily: "'DM Sans', sans-serif"
    }}>
      <motion.div initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }}>
        <GlassCard style={{ padding: "40px", width: "360px", textAlign: "center", border: "1px solid rgba(249,115,22,0.2)" }}>
          <div style={{ width: 60, height: 60, borderRadius: 16, background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 20px", boxShadow: "0 10px 25px rgba(249,115,22,0.3)" }}>
            <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
          </div>
          <h2 style={{ fontSize: 22, fontWeight: 800, color: "#f8fafc", marginBottom: 8 }}>Cerebro PWA</h2>
          <p style={{ fontSize: 13, color: "#64748b", marginBottom: 24 }}>Inteligencia Operativa TTE</p>

          <form onSubmit={handleSubmit}>
            <input
              type="password"
              autoFocus
              placeholder="Contraseña de acceso"
              value={pass}
              onChange={(e) => { setPass(e.target.value); setError(false); }}
              className="search-input"
              style={{
                width: "100%", padding: "12px", background: "rgba(15,23,42,0.6)",
                textAlign: "center", fontSize: 16, letterSpacing: "4px"
              }}
            />
            {error && <p style={{ color: "#fb7185", fontSize: 11, marginTop: 8, fontWeight: 600 }}>Clave incorrecta, intentá de nuevo.</p>}
            <button type="submit" style={{
              width: "100%", marginTop: 16, padding: "12px", borderRadius: 10, border: "none",
              background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white",
              fontWeight: 700, cursor: "pointer", fontSize: 14
            }}>
              Ingresar al Sistema
            </button>
          </form>
        </GlassCard>
      </motion.div>
    </div>
  );
};
/* ═══════════════════════════════════════════════════════════════
   MAIN DASHBOARD COMPONENT
   ═══════════════════════════════════════════════════════════════ */
export default function TransformerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState(null);
  const [activeTab, setActiveTab] = useState("buscador");

  // Simulator state
  const [simRegimen, setSimRegimen] = useState("Estandar");
  const [simBobinas, setSimBobinas] = useState([{ clase: "AT", tipo: "", conductor: "", peso: "" }]);

  // Buscador state
  const [searchText, setSearchText] = useState("");
  const [selectedRegimes, setSelectedRegimes] = useState([]);
  const [powerRange, setPowerRange] = useState([0, 250]);
  const [weightRange, setWeightRange] = useState([0, 100]);
  const [deviationRange, setDeviationRange] = useState([-100, 100]);
  const [hoursRange, setHoursRange] = useState([0, 9000]);
  const [windingCountFilter, setWindingCountFilter] = useState(null);
  const [hasRF, setHasRF] = useState(null);
  const [hasMT, setHasMT] = useState(null);
  const [hasTertiary, setHasTertiary] = useState(null);
  const [windingFilters, setWindingFilters] = useState([]);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [showWindingFilters, setShowWindingFilters] = useState(false);
  const [referenceOT, setReferenceOT] = useState(null);
  const [refOTInput, setRefOTInput] = useState("");
  const [sortField, setSortField] = useState("similarity");
  const [sortDir, setSortDir] = useState("desc");
  const [viewMode, setViewMode] = useState("table");
  const [selectedForCompare, setSelectedForCompare] = useState(new Set());

  // Analysis / Comparison modals
  const [analyzedMachine, setAnalyzedMachine] = useState(null);
  const [showComparison, setShowComparison] = useState(false);
  const [isAuthenticated, setIsAuthenticated] = useState(
    sessionStorage.getItem('auth_access') === 'true'
  );

  const handleLogin = () => {
    sessionStorage.setItem('auth_access', 'true');
    setIsAuthenticated(true);
  };
  /* ─── Fetch ─── */
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/cerebro_pwa_v3_definitive.json");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) { if (!cancelled) setFetchError(err.message); }
      finally { if (!cancelled) setLoading(false); }
    })();
    return () => { cancelled = true; };
  }, []);

  /* ─── Coef map for simulator ─── */
  const coefMap = useMemo(() => {
    if (!data?.coefficients?.winding_labor_coefficients) return new Map();
    const m = new Map();
    for (const c of data.coefficients.winding_labor_coefficients) m.set(`${c.class}|${c.construction_type}|${c.conductor}|${c.regime}`, c);
    return m;
  }, [data]);

  /* ─── Dynamic options per clase for simulator ─── */
  const opcionesPorClase = useMemo(() => {
    if (!data?.coefficients?.winding_labor_coefficients) return {};
    const map = {};
    for (const c of data.coefficients.winding_labor_coefficients) {
      if (!map[c.class]) map[c.class] = { tipos: new Set(), conductores: new Map() };
      map[c.class].tipos.add(c.construction_type);
      if (!map[c.class].conductores.has(c.construction_type)) map[c.class].conductores.set(c.construction_type, new Set());
      map[c.class].conductores.get(c.construction_type).add(c.conductor);
    }
    return map;
  }, [data]);

  const getTipos = useCallback(cl => { const e = opcionesPorClase[cl]; return e ? [...e.tipos].sort() : []; }, [opcionesPorClase]);
  const getConds = useCallback((cl, tp) => { const e = opcionesPorClase[cl]; if (!e) return []; const s = e.conductores.get(tp); return s ? [...s].sort() : []; }, [opcionesPorClase]);

  /* ─── Bobina CRUD ─── */
  const updateBob = useCallback((i, f, v) => setSimBobinas(p => p.map((b, j) => {
    if (j !== i) return b; const u = { ...b, [f]: v }; if (f === "clase") { u.tipo = ""; u.conductor = ""; } if (f === "tipo") u.conductor = ""; return u;
  })), []);
  const addBob = useCallback(() => setSimBobinas(p => p.length < 4 ? [...p, { clase: "AT", tipo: "", conductor: "", peso: "" }] : p), []);
  const removeBob = useCallback(i => setSimBobinas(p => p.length > 1 ? p.filter((_, j) => j !== i) : p), []);
  const debouncedBob = useDebounce(simBobinas, 300);

  /* ─── Simulator calculations ─── */
  const simCalcRows = useMemo(() => {
    if (!coefMap.size) return [];
    return debouncedBob.map((b, i) => {
      const key = `${b.clase}|${b.tipo}|${b.conductor}|${simRegimen}`;
      const c = coefMap.get(key); const peso = parseFloat(b.peso) || 0;
      return { id: i, label: `Devanado ${i + 1}`, clase: b.clase, tipo: b.tipo, conductor: b.conductor, peso, coef: c?.hours_per_kg ?? null, cases: c?.case_count ?? 0, confidence: c?.confidence_level, hours: c ? peso * c.hours_per_kg : null, noData: !c && b.tipo && b.conductor };
    });
  }, [debouncedBob, simRegimen, coefMap]);
  const simTotal = useMemo(() => simCalcRows.reduce((s, r) => s + (r.hours || 0), 0), [simCalcRows]);

  /* ─── Buscador filtering ─── */
  const debouncedSearch = useDebounce(searchText, 200);

  const filteredMachines = useMemo(() => {
    if (!data?.machines) return [];
    return data.machines.filter(m => {
      const si = m.search_index || {};
      const so = si.sortable || {};
      const fi = si.filterable || {};
      const id = m.identity || {};
      const tot = m.analytics?.totals || {};
      // Text search
      if (debouncedSearch.trim()) {
        const q = debouncedSearch.toLowerCase().trim();
        const tags = (m.features?.search_tags || []).join(" ").toLowerCase();
        if (!m.ot_id.includes(q) && !(m.machine_type || "").toLowerCase().includes(q) && !tags.includes(q)) return false;
      }
      // Regime
      if (selectedRegimes.length > 0 && !selectedRegimes.includes(m.regime)) return false;
      // Power
      const pwr = so.nominal_power_mva || id.power_nominal_mva_est || 0;
      if (pwr < powerRange[0] || pwr > powerRange[1]) return false;
      // Weight (in tons for slider)
      const wt = (so.active_part_weight_kg || 0) / 1000;
      if (wt < weightRange[0] || wt > weightRange[1]) return false;
      // Deviation
      const dev = tot.deviation_pct;
      if (dev != null && (dev < deviationRange[0] || dev > deviationRange[1])) return false;
      // Hours
      const hrs = tot.real_hours || 0;
      if (hrs < hoursRange[0] || hrs > hoursRange[1]) return false;
      // Winding count
      if (windingCountFilter != null && (id.winding_count || (m.windings || []).length) !== windingCountFilter) return false;
      // Has RF / MT / Tertiary
      if (hasRF != null && fi.has_rf !== hasRF) return false;
      if (hasMT != null && fi.has_mt !== hasMT) return false;
      if (hasTertiary != null && fi.has_tertiary !== hasTertiary) return false;
      // Winding filters (flexible: each block must be satisfied by at least one winding)
      if (windingFilters.length > 0) {
        const ws = m.windings || [];
        for (const wf of windingFilters) {
          const match = ws.some(w => {
            if (wf.role && w.functional_role !== wf.role) return false;
            if (wf.clase && w.normalized_class !== wf.clase) return false;
            if (wf.constructionTypes?.length > 0 && !wf.constructionTypes.includes(w.construction_type)) return false;
            if (wf.conductors?.length > 0 && !wf.conductors.includes(w.conductor_type)) return false;
            return true;
          });
          if (!match) return false;
        }
      }
      return true;
    });
  }, [data, debouncedSearch, selectedRegimes, powerRange, weightRange, deviationRange, hoursRange, windingCountFilter, hasRF, hasMT, hasTertiary, windingFilters]);

  // Compute match scores
  const scoredMachines = useMemo(() => {
    return filteredMachines.map(m => ({
      ...m,
      _score: referenceOT ? computeMatchScore(referenceOT, m) : null,
    }));
  }, [filteredMachines, referenceOT]);

  // Sort
  const sortedMachines = useMemo(() => {
    const arr = [...scoredMachines];
    const dir = sortDir === "desc" ? -1 : 1;
    arr.sort((a, b) => {
      let va, vb;
      switch (sortField) {
        case "similarity": va = a._score ?? -1; vb = b._score ?? -1; break;
        case "deviation": va = Math.abs(a.analytics?.totals?.deviation_pct ?? 0); vb = Math.abs(b.analytics?.totals?.deviation_pct ?? 0); break;
        case "hours": va = a.analytics?.totals?.real_hours ?? 0; vb = b.analytics?.totals?.real_hours ?? 0; break;
        case "weight": va = a.search_index?.sortable?.active_part_weight_kg ?? 0; vb = b.search_index?.sortable?.active_part_weight_kg ?? 0; break;
        case "power": va = a.search_index?.sortable?.nominal_power_mva ?? 0; vb = b.search_index?.sortable?.nominal_power_mva ?? 0; break;
        default: va = 0; vb = 0;
      }
      return (va - vb) * dir;
    });
    return arr;
  }, [scoredMachines, sortField, sortDir]);

  /* ─── Actions ─── */
  const clearFilters = useCallback(() => {
    setSearchText(""); setSelectedRegimes([]); setPowerRange([0, 250]); setWeightRange([0, 100]);
    setDeviationRange([-100, 100]); setHoursRange([0, 9000]); setWindingCountFilter(null);
    setHasRF(null); setHasMT(null); setHasTertiary(null); setWindingFilters([]); setReferenceOT(null); setRefOTInput("");
  }, []);

  const useAsTemplate = useCallback(() => {
    if (!data?.machines || !refOTInput.trim()) return;
    const m = data.machines.find(x => x.ot_id === refOTInput.trim());
    if (!m) return;
    setReferenceOT(m);
    setSelectedRegimes([m.regime]);
    const pwr = m.identity?.power_nominal_mva_est || 0;
    setPowerRange([Math.max(0, Math.round(pwr * 0.8)), Math.round(pwr * 1.2)]);
    const wt = (m.identity?.active_part_weight_kg || 0) / 1000;
    setWeightRange([Math.max(0, Math.round(wt * 0.8)), Math.round(wt * 1.2)]);
    const wfs = (m.windings || []).map(w => ({
      role: w.functional_role || "", clase: w.normalized_class || "",
      constructionTypes: w.construction_type ? [w.construction_type] : [], conductors: w.conductor_type ? [w.conductor_type] : [],
    }));
    setWindingFilters(wfs);
    setShowWindingFilters(true);
    setSortField("similarity");
  }, [data, refOTInput]);

  const toggleCompare = useCallback(otId => {
    setSelectedForCompare(prev => {
      const next = new Set(prev);
      if (next.has(otId)) next.delete(otId); else if (next.size < 4) next.add(otId);
      return next;
    });
  }, []);

  const compareMachines = useMemo(() => {
    if (!data?.machines || selectedForCompare.size < 2) return [];
    return [...selectedForCompare].map(id => data.machines.find(m => m.ot_id === id)).filter(Boolean);
  }, [data, selectedForCompare]);

  /* ─── Active filter chips ─── */
  const activeChips = useMemo(() => {
    const ch = [];
    selectedRegimes.forEach(r => ch.push({ id: `reg-${r}`, label: REGIME_LABELS[r] || r, rm: () => setSelectedRegimes(p => p.filter(x => x !== r)) }));
    if (powerRange[0] > 0 || powerRange[1] < 250) ch.push({ id: "pwr", label: `${powerRange[0]}–${powerRange[1]} MVA`, rm: () => setPowerRange([0, 250]) });
    if (weightRange[0] > 0 || weightRange[1] < 100) ch.push({ id: "wt", label: `${weightRange[0]}–${weightRange[1]}T peso`, rm: () => setWeightRange([0, 100]) });
    if (deviationRange[0] > -100 || deviationRange[1] < 100) ch.push({ id: "dev", label: `Desvío ${deviationRange[0]}% ~ ${deviationRange[1]}%`, rm: () => setDeviationRange([-100, 100]) });
    if (windingCountFilter != null) ch.push({ id: "wc", label: `${windingCountFilter} devanados`, rm: () => setWindingCountFilter(null) });
    if (hasRF != null) ch.push({ id: "rf", label: hasRF ? "Con RF" : "Sin RF", rm: () => setHasRF(null) });
    if (hasMT != null) ch.push({ id: "mt", label: hasMT ? "Con MT" : "Sin MT", rm: () => setHasMT(null) });
    if (hasTertiary != null) ch.push({ id: "ter", label: hasTertiary ? "Con Terciario" : "Sin Terciario", rm: () => setHasTertiary(null) });
    if (referenceOT) ch.push({ id: "ref", label: `Ref: OT ${referenceOT.ot_id}`, rm: () => setReferenceOT(null) });
    windingFilters.forEach((_, i) => ch.push({ id: `wf-${i}`, label: `Devanado ${i + 1} filtro`, rm: () => setWindingFilters(p => p.filter((__, j) => j !== i)) }));
    return ch;
  }, [selectedRegimes, powerRange, weightRange, deviationRange, windingCountFilter, hasRF, hasMT, hasTertiary, referenceOT, windingFilters]);

  /* ─── Loading / Error ─── */
  if (loading) return (
    <div style={{ minHeight: "100vh", background: "#0f172a", padding: "80px 28px" }}>
      <div style={{ maxWidth: 800, margin: "0 auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 14 }}>
          {[1, 2, 3, 4].map(i => <SkeletonCard key={i} />)}
        </div>
      </div>
      <style>{`@keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}`}</style>
    </div>
  );
  if (fetchError) return (
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0f172a" }}>
      <GlassCard style={{ padding: "32px 40px", textAlign: "center", maxWidth: 420 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>⚠️</div>
        <h2 style={{ fontSize: 18, fontWeight: 700, color: "#f8fafc", marginBottom: 8 }}>Error al cargar datos</h2>
        <p style={{ fontSize: 13, color: "#94a3b8" }}>No se pudo cargar <strong>cerebro_pwa_v3_definitive.json</strong></p>
        <p style={{ fontSize: 12, color: "#64748b", fontFamily: "monospace", background: "rgba(30,41,59,0.6)", padding: "8px 12px", borderRadius: 8, marginTop: 12 }}>{fetchError}</p>
      </GlassCard>
    </div>
  );

  const CLASES = data?.catalogs?.winding_classes_normalized?.filter(c => ["AT", "BT", "MT", "RF"].includes(c)) || ["AT", "BT", "MT", "RF"];
  const REGIMENES = data?.catalogs?.regimes || ["Estandar", "AT_Bajo_Carga", "BT_Bajo_Carga"];
  // Si no está autenticado, mostramos la pantalla de login
  if (!isAuthenticated && window.location.hostname !== 'localhost') {
    return <LoginPage onLogin={handleLogin} />;
  }

  // De acá para abajo sigue tu return normal con el Dashboard...

  /* ═══════════════════════════════════════════════════════════════
     RENDER
     ═══════════════════════════════════════════════════════════════ */
  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700;800&display=swap');
        *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
        html,body,#root{width:100%}body{overflow-x:hidden;background:#0f172a}
        ::-webkit-scrollbar{width:6px}::-webkit-scrollbar-thumb{background:#334155;border-radius:99px}::-webkit-scrollbar-track{background:transparent}
        input[type=number]{-moz-appearance:textfield}input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes spin{to{transform:rotate(360deg)}}
        .clickable-row{cursor:pointer;transition:background 0.12s}.clickable-row:hover td{background:rgba(249,115,22,0.04)}
        .btn-remove:hover{border-color:#fb7185!important;color:#fb7185!important}
        .search-input{outline:none;transition:border-color 0.2s,box-shadow 0.2s}.search-input:focus{border-color:#f97316!important;box-shadow:0 0 0 3px rgba(249,115,22,0.12)}
        .filter-input,.sel-field{outline:none;transition:border-color 0.15s;background:rgba(30,41,59,0.7);border:1px solid rgba(148,163,184,0.15);border-radius:8px;padding:6px 10px;font-size:12px;color:#e2e8f0;font-family:inherit;width:100%}
        .filter-input:focus,.sel-field:focus{border-color:#f97316!important}
        .sel-field{cursor:pointer;-webkit-appearance:none;appearance:none}
        .dual-range{position:absolute;top:0;left:0;width:100%;height:100%;background:none;pointer-events:none;-webkit-appearance:none;appearance:none;z-index:3;margin:0;padding:0}
        .dual-range::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;background:#f97316;border:2px solid #0f172a;cursor:grab;pointer-events:all;box-shadow:0 2px 6px rgba(249,115,22,0.3)}
        .dual-range::-moz-range-thumb{width:14px;height:14px;border-radius:50%;background:#f97316;border:2px solid #0f172a;cursor:grab;pointer-events:all}
        .dual-range::-webkit-slider-runnable-track{background:transparent;height:4px}
        .dual-range::-moz-range-track{background:transparent;height:4px}
        .compare-check{width:16px;height:16px;accent-color:#f97316;cursor:pointer}
        .bobina-card{transition:transform 0.15s,box-shadow 0.15s}.bobina-card:hover{transform:translateY(-2px);box-shadow:0 6px 24px rgba(0,0,0,0.25)}
        .toggle-section{cursor:pointer;user-select:none;transition:background 0.15s}.toggle-section:hover{background:rgba(249,115,22,0.04)!important}
        .app-wrap{width:100%;min-height:100vh;background:#0f172a;font-family:'DM Sans','Segoe UI',system-ui,sans-serif;color:#e2e8f0;padding-bottom:56px}
        .page-body{width:100%;padding:20px 28px 0}
        @media(max-width:1100px){.page-body{padding:16px 14px 0}}
        @media(max-width:600px){.page-body{padding:12px 10px 0}}
      `}</style>

      <div className="app-wrap">
        {/* ─── HEADER ─── */}
        <header style={{ background: "rgba(15,23,42,0.85)", backdropFilter: "blur(20px)", borderBottom: "1px solid rgba(148,163,184,0.08)", padding: "0 28px", position: "sticky", top: 0, zIndex: 100 }}>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", height: 52 }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg,#f97316,#ea580c)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 4px 12px rgba(249,115,22,0.3)" }}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" /></svg>
              </div>
              <div>
                <span style={{ fontSize: 14, fontWeight: 700, color: "#f8fafc", letterSpacing: "-0.02em" }}>Cerebro PWA</span>
                <span style={{ fontSize: 10, color: "#475569", marginLeft: 6 }}>Inteligencia Operativa Industrial TTE</span>
              </div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <div style={{ width: 6, height: 6, borderRadius: "50%", background: "#34d399", boxShadow: "0 0 6px #34d399" }} />
              <span style={{ fontSize: 10, color: "#64748b", fontWeight: 500 }}>v3.0 · {data?.machines?.length || 0} OTs · {data?.benchmarks?.families?.length || 0} familias</span>
            </div>
          </div>
        </header>

        <div className="page-body">
          {/* ─── TABS ─── */}
          <div style={{ display: "flex", gap: 3, marginBottom: 18, background: "rgba(30,41,59,0.5)", padding: 3, borderRadius: 10, width: "fit-content", border: "1px solid rgba(148,163,184,0.08)" }}>
            {[{ id: "buscador", l: "🔍 Buscador Estructural" }, { id: "simulador", l: "⚡ Simulador" }].map(tab => (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)} style={{
                padding: "7px 18px", borderRadius: 8, border: "none", cursor: "pointer", fontSize: 11, fontWeight: activeTab === tab.id ? 700 : 500,
                background: activeTab === tab.id ? "rgba(249,115,22,0.15)" : "transparent", color: activeTab === tab.id ? "#fb923c" : "#64748b", fontFamily: "inherit", transition: "all 0.15s",
              }}>{tab.l}</button>
            ))}
          </div>

          <AnimatePresence mode="wait">
            {activeTab === "buscador" ? (
              /* ═══════════════════════════════════════════════════
                 BUSCADOR ESTRUCTURAL
                 ═══════════════════════════════════════════════════ */
              <motion.div key="bus" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
                {/* Search + OT-as-template */}
                <div style={{ display: "grid", gridTemplateColumns: "1fr auto", gap: 12, marginBottom: 14 }}>
                  <div>
                    <input className="search-input" type="text" value={searchText} onChange={e => setSearchText(e.target.value)}
                      placeholder="Buscar por N° de OT, tipo de máquina, tensión, potencia..."
                      style={{ width: "100%", padding: "10px 14px", background: "rgba(30,41,59,0.7)", border: "1px solid rgba(148,163,184,0.12)", borderRadius: 10, fontSize: 13, color: "#e2e8f0", fontFamily: "inherit" }} />
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <input className="filter-input" type="text" value={refOTInput} onChange={e => setRefOTInput(e.target.value)}
                      placeholder="OT referencia" onKeyDown={e => e.key === "Enter" && useAsTemplate()}
                      style={{ width: 120, padding: "10px 12px", borderRadius: 10 }} />
                    <button onClick={useAsTemplate} style={{ padding: "10px 16px", borderRadius: 10, border: "none", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit", whiteSpace: "nowrap" }}>Usar como plantilla</button>
                  </div>
                </div>

                {/* Filter chips */}
                {activeChips.length > 0 && (
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 12, alignItems: "center" }}>
                    {activeChips.map(c => <Chip key={c.id} label={c.label} onRemove={c.rm} />)}
                    <button onClick={clearFilters} style={{ fontSize: 10, color: "#64748b", background: "none", border: "none", cursor: "pointer", fontFamily: "inherit", textDecoration: "underline" }}>Limpiar todo</button>
                  </div>
                )}

                {/* Header filters: regime + presets + sliders */}
                <GlassCard style={{ padding: "16px 18px", marginBottom: 12 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
                    <div>
                      <ChipMultiSelect label="Régimen" options={REGIMENES.map(r => ({ value: r, label: REGIME_LABELS[r] || r }))} selected={selectedRegimes} onChange={setSelectedRegimes} colorMap={{ Estandar: "#94a3b8", AT_Bajo_Carga: "#f97316", BT_Bajo_Carga: "#3b82f6" }} />
                    </div>
                    <div>
                      <Label>Presets de Potencia (MVA)</Label>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                        {POWER_PRESETS.map(p => (
                          <button key={p.l} onClick={() => setPowerRange([p.a, p.b])} style={{
                            padding: "4px 10px", borderRadius: 99, border: powerRange[0] === p.a && powerRange[1] === p.b ? "1.5px solid #f97316" : "1.5px solid rgba(148,163,184,0.1)",
                            background: powerRange[0] === p.a && powerRange[1] === p.b ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.4)",
                            color: powerRange[0] === p.a && powerRange[1] === p.b ? "#fb923c" : "#64748b", fontSize: 10, fontWeight: 600, cursor: "pointer", fontFamily: "inherit",
                          }}>{p.l}</button>
                        ))}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: 14, marginTop: 12 }}>
                    <DualRangeSlider label="Potencia (MVA)" min={0} max={250} step={1} value={powerRange} onChange={setPowerRange} formatValue={v => `${v}`} />
                    <DualRangeSlider label="Peso PA (Ton)" min={0} max={100} step={1} value={weightRange} onChange={setWeightRange} formatValue={v => `${v}T`} />
                    <DualRangeSlider label="Desvío (%)" min={-100} max={100} step={1} value={deviationRange} onChange={setDeviationRange} formatValue={v => `${v}%`} />
                    <DualRangeSlider label="Horas Reales" min={0} max={9000} step={50} value={hoursRange} onChange={setHoursRange} formatValue={v => `${v}h`} />
                  </div>
                </GlassCard>

                {/* Advanced filters (collapsible) */}
                <GlassCard style={{ padding: 0, marginBottom: 12, overflow: "hidden" }}>
                  <div className="toggle-section" onClick={() => setShowAdvancedFilters(p => !p)} style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Filtros Avanzados</span>
                    <span style={{ fontSize: 14, color: "#64748b", transform: showAdvancedFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
                  </div>
                  {showAdvancedFilters && (
                    <div style={{ padding: "4px 18px 16px", display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 12 }}>
                      <div>
                        <Label>Devanados</Label>
                        <div style={{ display: "flex", gap: 3, marginTop: 4 }}>
                          {[null, 2, 3, 4].map(n => (
                            <button key={String(n)} onClick={() => setWindingCountFilter(n)} style={{
                              flex: 1, padding: "5px 0", borderRadius: 6, border: "none", cursor: "pointer", fontSize: 11, fontWeight: windingCountFilter === n ? 700 : 500,
                              background: windingCountFilter === n ? "rgba(249,115,22,0.15)" : "rgba(30,41,59,0.4)", color: windingCountFilter === n ? "#fb923c" : "#64748b", fontFamily: "inherit",
                            }}>{n === null ? "Todos" : n}</button>
                          ))}
                        </div>
                      </div>
                      <TriToggle label="Con RF" value={hasRF} onChange={setHasRF} />
                      <TriToggle label="Con MT" value={hasMT} onChange={setHasMT} />
                      <TriToggle label="Con Terciario" value={hasTertiary} onChange={setHasTertiary} />
                    </div>
                  )}
                </GlassCard>

                {/* Winding filters (collapsible) */}
                <GlassCard style={{ padding: 0, marginBottom: 16, overflow: "hidden" }}>
                  <div className="toggle-section" onClick={() => setShowWindingFilters(p => !p)} style={{ padding: "12px 18px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <span style={{ fontSize: 12, fontWeight: 600, color: "#94a3b8" }}>Arquitectura de Devanados {windingFilters.length > 0 && <span style={{ color: "#f97316" }}>({windingFilters.length})</span>}</span>
                    <span style={{ fontSize: 14, color: "#64748b", transform: showWindingFilters ? "rotate(180deg)" : "rotate(0deg)", transition: "transform 0.2s" }}>▾</span>
                  </div>
                  {showWindingFilters && (
                    <div style={{ padding: "4px 18px 16px" }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: 10, marginBottom: 10 }}>
                        {windingFilters.map((wf, i) => (
                          <WindingFilterBlock key={i} index={i} filter={wf} catalogs={data?.catalogs}
                            onChange={upd => setWindingFilters(p => p.map((x, j) => j === i ? upd : x))}
                            onRemove={() => setWindingFilters(p => p.filter((_, j) => j !== i))} />
                        ))}
                      </div>
                      {windingFilters.length < 4 && (
                        <button onClick={() => setWindingFilters(p => [...p, { role: "", clase: "", constructionTypes: [], conductors: [] }])} style={{ padding: "6px 16px", borderRadius: 8, border: "1px dashed rgba(249,115,22,0.3)", background: "rgba(249,115,22,0.04)", color: "#f97316", fontSize: 11, fontWeight: 600, cursor: "pointer", fontFamily: "inherit" }}>+ Agregar bloque de devanado</button>
                      )}
                    </div>
                  )}
                </GlassCard>

                {/* Results controls */}
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12, flexWrap: "wrap", gap: 8 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span style={{ fontSize: 13, fontWeight: 700, color: "#f8fafc" }}>{sortedMachines.length}</span>
                    <span style={{ fontSize: 12, color: "#64748b" }}>resultado{sortedMachines.length !== 1 ? "s" : ""} de {data?.machines?.length || 0}</span>
                    {referenceOT && <span style={{ fontSize: 11, color: "#f97316", fontWeight: 600 }}>· Similitud vs OT {referenceOT.ot_id}</span>}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    {selectedForCompare.size >= 2 && (
                      <button onClick={() => setShowComparison(true)} style={{ padding: "6px 14px", borderRadius: 8, border: "none", background: "linear-gradient(135deg,#f97316,#ea580c)", color: "white", fontSize: 11, fontWeight: 700, cursor: "pointer", fontFamily: "inherit" }}>
                        ⚖️ Comparar {selectedForCompare.size} OTs
                      </button>
                    )}
                    <select value={sortField} onChange={e => setSortField(e.target.value)} className="sel-field" style={{ width: "auto", padding: "5px 10px", fontSize: 11 }}>
                      <option value="similarity">Similitud</option>
                      <option value="deviation">Desvío</option>
                      <option value="hours">Horas</option>
                      <option value="weight">Peso</option>
                      <option value="power">Potencia</option>
                    </select>
                    <button onClick={() => setSortDir(p => p === "desc" ? "asc" : "desc")} style={{ padding: "5px 8px", borderRadius: 6, border: "1px solid rgba(148,163,184,0.12)", background: "rgba(30,41,59,0.5)", color: "#94a3b8", fontSize: 11, cursor: "pointer", fontFamily: "inherit" }}>
                      {sortDir === "desc" ? "↓" : "↑"}
                    </button>
                    <div style={{ display: "flex", gap: 2, background: "rgba(30,41,59,0.5)", padding: 2, borderRadius: 6 }}>
                      {[{ v: "table", l: "≡" }, { v: "cards", l: "▤" }].map(o => (
                        <button key={o.v} onClick={() => setViewMode(o.v)} style={{
                          padding: "4px 8px", borderRadius: 4, border: "none", cursor: "pointer", fontSize: 12,
                          background: viewMode === o.v ? "rgba(249,115,22,0.15)" : "transparent", color: viewMode === o.v ? "#fb923c" : "#64748b", fontFamily: "inherit",
                        }}>{o.l}</button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Results */}
                {sortedMachines.length === 0 ? (
                  <GlassCard style={{ padding: 0 }}>
                    <EmptyState icon="🔍" title="Sin resultados" text="Probá ajustar los filtros o limpiar la búsqueda para ver más OTs." />
                  </GlassCard>
                ) : viewMode === "table" ? (
                  <GlassCard style={{ padding: "4px 0", overflowX: "auto" }}>
                    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                      <thead><tr>
                        <th style={{ width: 32, padding: "8px 6px" }} />
                        <th style={{ width: 20, padding: "8px 2px" }} />
                        {["OT", "Tipo", "Régimen", "Potencia", "Peso PA", "Dev.", "Hs Real", "Desvío", referenceOT ? "Match" : null, "Arquitectura", ""].filter(Boolean).map((h, i) => (
                          <th key={i} style={{ textAlign: "left", padding: "8px 8px", fontSize: 9, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid rgba(148,163,184,0.1)", whiteSpace: "nowrap" }}>{h}</th>
                        ))}
                      </tr></thead>
                      <tbody>
                        {sortedMachines.map(m => {
                          const tot = m.analytics?.totals || {};
                          const id = m.identity || {};
                          return (
                            <tr key={m.ot_id} className="clickable-row">
                              <td style={{ padding: "6px 6px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                <input type="checkbox" className="compare-check" checked={selectedForCompare.has(m.ot_id)} onChange={() => toggleCompare(m.ot_id)} onClick={e => e.stopPropagation()} />
                              </td>
                              <td style={{ padding: "6px 2px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                {Math.abs(tot.deviation_pct || 0) > DESVIO_ALERT && <AlertIcon />}
                              </td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.ot_id}</span>
                              </td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.04)", whiteSpace: "nowrap", fontWeight: 500 }}>{m.machine_type}</td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 99, fontWeight: 600, background: m.regime === "AT_Bajo_Carga" ? "rgba(249,115,22,0.1)" : m.regime === "BT_Bajo_Carga" ? "rgba(59,130,246,0.1)" : "rgba(148,163,184,0.06)", color: m.regime === "AT_Bajo_Carga" ? "#fb923c" : m.regime === "BT_Bajo_Carga" ? "#60a5fa" : "#94a3b8" }}>
                                  {REGIME_LABELS[m.regime] || m.regime}
                                </span>
                              </td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", color: "#94a3b8", borderBottom: "1px solid rgba(148,163,184,0.04)", fontFamily: "monospace", fontSize: 11 }}>{fmt(id.power_nominal_mva_est, 0)}</td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", color: "#cbd5e1", borderBottom: "1px solid rgba(148,163,184,0.04)", fontWeight: 600 }}>{fmtK(id.active_part_weight_kg)}</td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)", fontSize: 11 }}>{id.winding_count || "—"}</td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", color: "#e2e8f0", borderBottom: "1px solid rgba(148,163,184,0.04)", fontFamily: "monospace", fontWeight: 600 }}>{fmt(tot.real_hours, 0)}</td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}><DevioBadge value={tot.deviation_pct} /></td>
                              {referenceOT && (
                                <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                  <SimilarityBadge score={m._score ?? 0} />
                                </td>
                              )}
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                  {(m.features?.architecture_tags || []).slice(0, 4).map(t => <ArchTag key={t} label={t.replace(/_/g, " ")} color={CLASS_COLORS[t.split("_")[0]] || "#475569"} />)}
                                </div>
                              </td>
                              <td onClick={() => setAnalyzedMachine(m)} style={{ padding: "6px 8px", borderBottom: "1px solid rgba(148,163,184,0.04)" }}>
                                <span style={{ fontSize: 10, color: "#f97316", fontWeight: 600, whiteSpace: "nowrap" }}>Analizar →</span>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </GlassCard>
                ) : (
                  /* Card view */
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 12 }}>
                    {sortedMachines.map(m => {
                      const tot = m.analytics?.totals || {};
                      const id = m.identity || {};
                      return (
                        <GlassCard key={m.ot_id} onClick={() => setAnalyzedMachine(m)} style={{ padding: "16px 18px", cursor: "pointer", transition: "transform 0.15s, border-color 0.15s", border: selectedForCompare.has(m.ot_id) ? "1px solid #f97316" : undefined }}>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                              <span style={{ fontSize: 13, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>OT {m.ot_id}</span>
                              {m._score != null && <SimilarityBadge score={m._score} />}
                              {Math.abs(tot.deviation_pct || 0) > DESVIO_ALERT && <AlertIcon />}
                            </div>
                            <input type="checkbox" className="compare-check" checked={selectedForCompare.has(m.ot_id)} onChange={e => { e.stopPropagation(); toggleCompare(m.ot_id); }} />
                          </div>
                          <p style={{ fontSize: 11, color: "#94a3b8", marginBottom: 6 }}>{m.machine_type} · {REGIME_LABELS[m.regime] || m.regime}</p>
                          <div style={{ display: "flex", gap: 12, fontSize: 11, marginBottom: 8 }}>
                            <span style={{ color: "#cbd5e1" }}><span style={{ color: "#64748b" }}>Pot:</span> {fmt(id.power_nominal_mva_est, 0)} MVA</span>
                            <span style={{ color: "#cbd5e1" }}><span style={{ color: "#64748b" }}>Peso:</span> {fmtK(id.active_part_weight_kg)}</span>
                            <span style={{ color: "#cbd5e1" }}><span style={{ color: "#64748b" }}>Dev:</span> {id.winding_count}</span>
                          </div>
                          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <span style={{ fontSize: 18, fontWeight: 800, color: "#f8fafc" }}>{fmt(tot.real_hours, 0)}h</span>
                              <DevioBadge value={tot.deviation_pct} />
                            </div>
                            <div style={{ display: "flex", gap: 3 }}>
                              {(m.features?.architecture_tags || []).slice(0, 3).map(t => <ArchTag key={t} label={t.replace(/_/g, " ")} color={CLASS_COLORS[t.split("_")[0]] || "#475569"} />)}
                            </div>
                          </div>
                        </GlassCard>
                      );
                    })}
                  </div>
                )}
              </motion.div>

            ) : (
              /* ═══════════════════════════════════════════════════
                 SIMULADOR
                 ═══════════════════════════════════════════════════ */
              <motion.div key="sim" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} transition={{ duration: 0.18 }}>
                {/* Summary */}
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12, marginBottom: 20 }}>
                  <GlassCard style={{ padding: "18px 20px", background: "linear-gradient(135deg,#f97316,#ea580c)", border: "none" }}>
                    <p style={{ fontSize: 9, fontWeight: 700, color: "rgba(255,255,255,0.7)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 5 }}>Total Horas Estimadas</p>
                    <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                      <span style={{ fontSize: 32, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1 }}>{simTotal.toFixed(1)}</span>
                      <span style={{ fontSize: 13, color: "rgba(255,255,255,0.7)" }}>hrs</span>
                    </div>
                    <p style={{ fontSize: 10, color: "rgba(255,255,255,0.55)", marginTop: 3 }}>{debouncedBob.length} devanado{debouncedBob.length > 1 ? "s" : ""} · {REGIME_LABELS[simRegimen]}</p>
                  </GlassCard>
                  {simCalcRows.map((c, i) => (
                    <GlassCard key={i} style={{ padding: "14px 16px" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 3 }}>
                        <p style={{ fontSize: 9, fontWeight: 700, color: "#64748b", textTransform: "uppercase" }}>{c.label}</p>
                        <ArchTag label={c.clase} color={CLASS_COLORS[c.clase]} />
                      </div>
                      <span style={{ fontSize: 22, fontWeight: 700, color: "#f8fafc" }}>{c.hours != null ? c.hours.toFixed(1) : "—"}</span>
                      <span style={{ fontSize: 11, color: "#64748b", marginLeft: 3 }}>hrs</span>
                      <p style={{ fontSize: 10, color: "#475569", marginTop: 2 }}>
                        {c.peso > 0 ? `${c.peso}kg` : "Sin peso"}{c.coef != null ? ` · ×${c.coef}` : ""}
                        {c.confidence && <span style={{ marginLeft: 4, color: c.confidence === "high" ? "#34d399" : c.confidence === "medium" ? "#fbbf24" : "#fb7185" }}>● {c.confidence}</span>}
                      </p>
                    </GlassCard>
                  ))}
                </div>

                <div style={{ display: "grid", gridTemplateColumns: "350px 1fr", gap: 18, alignItems: "start" }}>
                  {/* Left: Config */}
                  <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                    <GlassCard style={{ padding: "16px 18px" }}>
                      <SectionTitle>Régimen de Regulación</SectionTitle>
                      {REGIMENES.map(r => (
                        <button key={r} onClick={() => setSimRegimen(r)} style={{
                          width: "100%", textAlign: "left", padding: "7px 12px", borderRadius: 8, marginBottom: 4,
                          border: simRegimen === r ? "1.5px solid #f97316" : "1.5px solid transparent",
                          background: simRegimen === r ? "rgba(249,115,22,0.1)" : "rgba(30,41,59,0.4)",
                          cursor: "pointer", fontSize: 12, fontWeight: simRegimen === r ? 600 : 400, color: simRegimen === r ? "#fb923c" : "#94a3b8", fontFamily: "inherit",
                        }}>{REGIME_LABELS[r]}</button>
                      ))}
                    </GlassCard>

                    <GlassCard style={{ padding: "16px 18px" }}>
                      <SectionTitle right={debouncedBob.length < 4 && (
                        <button onClick={addBob} style={{ padding: "4px 12px", background: "#f97316", color: "white", borderRadius: 99, border: "none", cursor: "pointer", fontSize: 11, fontWeight: 600, fontFamily: "inherit" }}>+ Agregar</button>
                      )}>Devanados ({debouncedBob.length}/4)</SectionTitle>
                      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                        {simBobinas.map((b, i) => {
                          const tipos = getTipos(b.clase);
                          const conds = b.tipo ? getConds(b.clase, b.tipo) : [];
                          return (
                            <div key={i} className="bobina-card" style={{ padding: "12px", borderRadius: 10, background: "rgba(30,41,59,0.5)", border: `1px solid ${CLASS_COLORS[b.clase] || "#475569"}30` }}>
                              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                  <span style={{ width: 20, height: 20, borderRadius: 5, background: CLASS_COLORS[b.clase] || "#475569", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 10, fontWeight: 700, color: "white" }}>{i + 1}</span>
                                  <span style={{ fontSize: 12, fontWeight: 600, color: "#cbd5e1" }}>Devanado {i + 1}</span>
                                </div>
                                {simBobinas.length > 1 && <button onClick={() => removeBob(i)} className="btn-remove" style={{ width: 20, height: 20, borderRadius: 5, border: "1px solid rgba(148,163,184,0.15)", background: "rgba(30,41,59,0.6)", cursor: "pointer", color: "#64748b", fontSize: 12, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "inherit" }}>×</button>}
                              </div>
                              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
                                <div><Label>Clase</Label><select className="sel-field" value={b.clase} onChange={e => updateBob(i, "clase", e.target.value)}>{CLASES.map(c => <option key={c}>{c}</option>)}</select></div>
                                <div><Label>Tipo</Label><select className="sel-field" value={b.tipo} onChange={e => updateBob(i, "tipo", e.target.value)} disabled={!tipos.length}>
                                  <option value="">Seleccionar...</option>{tipos.map(t => <option key={t} value={t}>{CONS_LABELS[t] || capitalize(t)}</option>)}
                                </select></div>
                                <div style={{ gridColumn: "span 2" }}><Label>Conductor</Label><select className="sel-field" value={b.conductor} onChange={e => updateBob(i, "conductor", e.target.value)} disabled={!conds.length}>
                                  <option value="">{b.tipo ? (conds.length ? "Seleccionar..." : "Sin conductores") : "Elegí tipo"}</option>{conds.map(c => <option key={c} value={c}>{c}</option>)}
                                </select></div>
                                <div style={{ gridColumn: "span 2" }}><Label>Peso (kg)</Label><input className="filter-input" type="number" value={b.peso} onChange={e => updateBob(i, "peso", e.target.value)} placeholder="0" /></div>
                              </div>
                              {simCalcRows[i] && (
                                <div style={{ marginTop: 6, padding: "5px 8px", borderRadius: 6, background: simCalcRows[i].noData ? "rgba(251,113,133,0.08)" : simCalcRows[i].coef != null ? "rgba(249,115,22,0.06)" : "rgba(30,41,59,0.3)", fontSize: 11 }}>
                                  {simCalcRows[i].noData ? <span style={{ color: "#fb7185" }}>⚠ Sin datos históricos</span>
                                    : simCalcRows[i].coef != null ? <span style={{ color: "#fb923c", fontWeight: 600 }}>⚡ {simCalcRows[i].peso}kg × {simCalcRows[i].coef} = <b>{simCalcRows[i].hours?.toFixed(1)}h</b> <span style={{ color: "#64748b" }}>({simCalcRows[i].cases} casos)</span></span>
                                      : <span style={{ color: "#475569" }}>Completá la configuración</span>}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </GlassCard>
                  </div>

                  {/* Right: Chart */}
                  <div>
                    <GlassCard style={{ padding: "18px" }}>
                      <SectionTitle>Distribución de Horas por Devanado</SectionTitle>
                      {simCalcRows.some(c => c.hours > 0) ? (
                        <ResponsiveContainer width="100%" height={220}>
                          <BarChart data={simCalcRows.map(c => ({ name: c.label, horas: c.hours || 0 }))} barCategoryGap="30%" margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
                            <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.08)" vertical={false} />
                            <XAxis dataKey="name" tick={{ fontSize: 11, fill: "#64748b", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                            <YAxis tick={{ fontSize: 10, fill: "#475569", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={v => `${v}h`} />
                            <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(148,163,184,0.04)" }} />
                            <Bar dataKey="horas" radius={[6, 6, 0, 0]}>
                              {simCalcRows.map((c, i) => <Cell key={i} fill={CLASS_COLORS[c.clase] || "#f97316"} />)}
                            </Bar>
                          </BarChart>
                        </ResponsiveContainer>
                      ) : (
                        <div style={{ height: 220, display: "flex", alignItems: "center", justifyContent: "center", color: "#475569", fontSize: 12 }}>
                          Ingresá el peso para ver la estimación
                        </div>
                      )}
                    </GlassCard>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          <div style={{ textAlign: "center", marginTop: 32 }}>
            <p style={{ fontSize: 10, color: "#1e293b" }}>Cerebro PWA · Inteligencia Operativa · Fábrica de Transformadores · {new Date().getFullYear()}</p>
          </div>
        </div>
      </div>

      {/* ─── Full-screen Analysis Modal ─── */}
      <AnimatePresence>
        {analyzedMachine && <OTAnalysisModal machine={analyzedMachine} data={data} onClose={() => setAnalyzedMachine(null)} />}
      </AnimatePresence>

      {/* ─── Comparison Modal ─── */}
      <AnimatePresence>
        {showComparison && compareMachines.length >= 2 && (
          <ComparisonView machines={compareMachines} data={data} onClose={() => setShowComparison(false)} />
        )}
      </AnimatePresence>
    </>
  );
}
