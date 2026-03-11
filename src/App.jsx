import { useState, useEffect, useCallback } from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── MOCK DATA (replace fetch with actual /public/cerebro_pwa.json) ───────────
const MOCK_DATA = {
  coeficientes: [
    { clase: "AT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.85 },
    { clase: "AT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "AT_Bajo_Carga", coeficiente: 0.92 },
    { clase: "AT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "BT_Bajo_Carga", coeficiente: 0.78 },
    { clase: "AT", tipo: "Wendel", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 0.88 },
    { clase: "AT", tipo: "Wendel", conductor: "Cobre_Papel", regimen: "AT_Bajo_Carga", coeficiente: 0.95 },
    { clase: "AT", tipo: "Wendel", conductor: "Aluminio", regimen: "Estandar", coeficiente: 0.72 },
    { clase: "AT", tipo: "Disco", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.10 },
    { clase: "AT", tipo: "Disco", conductor: "Cobre_Esmaltado", regimen: "AT_Bajo_Carga", coeficiente: 1.20 },
    { clase: "AT", tipo: "Disco", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 1.15 },
    { clase: "AT", tipo: "Disco", conductor: "Aluminio", regimen: "Estandar", coeficiente: 0.95 },
    { clase: "AT", tipo: "Helicoidal", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.30 },
    { clase: "AT", tipo: "Helicoidal", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 1.35 },
    { clase: "AT", tipo: "Helicoidal", conductor: "Aluminio", regimen: "Estandar", coeficiente: 1.10 },
    { clase: "BT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.60 },
    { clase: "BT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "AT_Bajo_Carga", coeficiente: 0.65 },
    { clase: "BT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "BT_Bajo_Carga", coeficiente: 0.70 },
    { clase: "BT", tipo: "Wendel", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 0.63 },
    { clase: "BT", tipo: "Wendel", conductor: "Aluminio", regimen: "Estandar", coeficiente: 0.50 },
    { clase: "BT", tipo: "Disco", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.80 },
    { clase: "BT", tipo: "Disco", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 0.83 },
    { clase: "BT", tipo: "Disco", conductor: "Aluminio", regimen: "Estandar", coeficiente: 0.68 },
    { clase: "BT", tipo: "Helicoidal", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.95 },
    { clase: "BT", tipo: "Helicoidal", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 0.98 },
    { clase: "BT", tipo: "Capa", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.55 },
    { clase: "BT", tipo: "Capa", conductor: "Aluminio", regimen: "Estandar", coeficiente: 0.45 },
    { clase: "MT", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 0.95 },
    { clase: "MT", tipo: "Wendel", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 0.98 },
    { clase: "MT", tipo: "Disco", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.20 },
    { clase: "MT", tipo: "Disco", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 1.25 },
    { clase: "MT", tipo: "Disco", conductor: "Aluminio", regimen: "Estandar", coeficiente: 1.05 },
    { clase: "MT", tipo: "Helicoidal", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.40 },
    { clase: "RF", tipo: "Wendel", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.50 },
    { clase: "RF", tipo: "Disco", conductor: "Cobre_Esmaltado", regimen: "Estandar", coeficiente: 1.75 },
    { clase: "RF", tipo: "Helicoidal", conductor: "Cobre_Papel", regimen: "Estandar", coeficiente: 1.90 },
  ],
  historico_maquinas: [
    { id: "T-2024-001", nombre: "Trafo Distribución 1000kVA", peso_total_kg: 850, regimen: "Estandar", horas_reales: 720, bobinas: 2, cliente: "EPEC Córdoba" },
    { id: "T-2024-002", nombre: "Trafo Potencia 5MVA", peso_total_kg: 3200, regimen: "AT_Bajo_Carga", horas_reales: 2800, bobinas: 3, cliente: "Electroingeniería" },
    { id: "T-2024-003", nombre: "Trafo Distribución 630kVA", peso_total_kg: 520, regimen: "Estandar", horas_reales: 440, bobinas: 2, cliente: "EPEC Córdoba" },
    { id: "T-2024-004", nombre: "Trafo Industrial 2.5MVA", peso_total_kg: 1800, regimen: "BT_Bajo_Carga", horas_reales: 1580, bobinas: 3, cliente: "IMPSA" },
    { id: "T-2024-005", nombre: "Trafo Trifásico 400kVA", peso_total_kg: 380, regimen: "Estandar", horas_reales: 320, bobinas: 2, cliente: "Arcor" },
    { id: "T-2024-006", nombre: "Trafo AT 10MVA", peso_total_kg: 6500, regimen: "AT_Bajo_Carga", horas_reales: 5800, bobinas: 4, cliente: "Transener" },
    { id: "T-2024-007", nombre: "Trafo Rectificador 800kVA", peso_total_kg: 720, regimen: "Estandar", horas_reales: 680, bobinas: 3, cliente: "YPF" },
    { id: "T-2024-008", nombre: "Trafo Distribución 250kVA", peso_total_kg: 210, regimen: "Estandar", horas_reales: 185, bobinas: 2, cliente: "EPEC Córdoba" },
    { id: "T-2024-009", nombre: "Trafo Potencia 7.5MVA", peso_total_kg: 4800, regimen: "AT_Bajo_Carga", horas_reales: 4200, bobinas: 4, cliente: "ENARSA" },
    { id: "T-2024-010", nombre: "Trafo Especial 1.5MVA", peso_total_kg: 1200, regimen: "BT_Bajo_Carga", horas_reales: 1050, bobinas: 3, cliente: "Aluar" },
    { id: "T-2024-011", nombre: "Trafo Distribución 160kVA", peso_total_kg: 145, regimen: "Estandar", horas_reales: 130, bobinas: 2, cliente: "EPEC Córdoba" },
    { id: "T-2024-012", nombre: "Trafo Industrial 3.15MVA", peso_total_kg: 2300, regimen: "AT_Bajo_Carga", horas_reales: 2050, bobinas: 3, cliente: "Techint" },
    { id: "T-2024-013", nombre: "Trafo Trifásico 2MVA", peso_total_kg: 1560, regimen: "Estandar", horas_reales: 1380, bobinas: 3, cliente: "Peugeot Argentina" },
    { id: "T-2024-014", nombre: "Trafo AT 4MVA", peso_total_kg: 2900, regimen: "AT_Bajo_Carga", horas_reales: 2650, bobinas: 3, cliente: "Transener" },
    { id: "T-2024-015", nombre: "Trafo Distribución 1600kVA", peso_total_kg: 1100, regimen: "BT_Bajo_Carga", horas_reales: 980, bobinas: 2, cliente: "Edesur" },
    { id: "T-2024-016", nombre: "Trafo Rectificador 1.2MVA", peso_total_kg: 980, regimen: "Estandar", horas_reales: 870, bobinas: 3, cliente: "Minera Alumbrera" },
    { id: "T-2024-017", nombre: "Trafo Potencia 15MVA", peso_total_kg: 9200, regimen: "AT_Bajo_Carga", horas_reales: 8100, bobinas: 4, cliente: "Transener" },
    { id: "T-2024-018", nombre: "Trafo Industrial 500kVA", peso_total_kg: 430, regimen: "Estandar", horas_reales: 390, bobinas: 2, cliente: "Toyota Argentina" },
    { id: "T-2024-019", nombre: "Trafo Especial 4.5MVA", peso_total_kg: 3400, regimen: "BT_Bajo_Carga", horas_reales: 3000, bobinas: 4, cliente: "Nucleoeléctrica" },
    { id: "T-2024-020", nombre: "Trafo Distribución 750kVA", peso_total_kg: 640, regimen: "Estandar", horas_reales: 570, bobinas: 2, cliente: "Edelap" },
  ],
};

// ─── CONSTANTS ────────────────────────────────────────────────────────────────
const CLASES = ["AT", "BT", "MT", "RF"];
const TIPOS = ["Wendel", "Disco", "Helicoidal", "Capa", "Continuo"];
const CONDUCTORES = ["Cobre_Esmaltado", "Cobre_Papel", "Aluminio"];
const REGIMENES = ["Estandar", "AT_Bajo_Carga", "BT_Bajo_Carga"];
const REGIMEN_LABELS = { Estandar: "Estándar", AT_Bajo_Carga: "AT Bajo Carga", BT_Bajo_Carga: "BT Bajo Carga" };
const BOBINA_COLORS = ["#f97316", "#fb923c", "#fdba74", "#fed7aa"];

const defaultBobina = () => ({ clase: "AT", tipo: "Wendel", conductor: "Cobre_Esmaltado", peso: "" });

// ─── CUSTOM TOOLTIP ───────────────────────────────────────────────────────────
const CustomTooltip = ({ active, payload, label }) => {
  if (active && payload && payload.length) {
    return (
      <div style={{
        background: "rgba(255,255,255,0.92)",
        border: "1px solid #f97316",
        borderRadius: 12,
        padding: "10px 16px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 4px 24px rgba(249,115,22,0.15)",
      }}>
        <p style={{ fontWeight: 700, color: "#1e293b", marginBottom: 4 }}>{label}</p>
        <p style={{ color: "#f97316", fontWeight: 600 }}>{payload[0].value.toFixed(1)} <span style={{ color: "#64748b", fontWeight: 400 }}>hrs</span></p>
      </div>
    );
  }
  return null;
};

// ─── GLASS CARD ───────────────────────────────────────────────────────────────
const GlassCard = ({ children, style = {}, className = "" }) => (
  <div
    className={className}
    style={{
      background: "rgba(255,255,255,0.65)",
      backdropFilter: "blur(16px)",
      WebkitBackdropFilter: "blur(16px)",
      border: "1px solid rgba(255,255,255,0.85)",
      borderRadius: 20,
      boxShadow: "0 8px 32px rgba(30,41,59,0.08), 0 1px 2px rgba(249,115,22,0.04)",
      ...style,
    }}
  >
    {children}
  </div>
);

// ─── SELECT COMPONENT ─────────────────────────────────────────────────────────
const Select = ({ value, onChange, options, label }) => (
  <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
    {label && <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{label}</label>}
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      style={{
        background: "rgba(255,255,255,0.8)",
        border: "1.5px solid rgba(249,115,22,0.2)",
        borderRadius: 10,
        padding: "8px 12px",
        fontSize: 13,
        color: "#1e293b",
        fontFamily: "inherit",
        cursor: "pointer",
        outline: "none",
        transition: "border-color 0.2s",
      }}
      onFocus={(e) => e.target.style.borderColor = "#f97316"}
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

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function TransformerDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [regimen, setRegimen] = useState("Estandar");
  const [bobinas, setBobinas] = useState([defaultBobina()]);
  const [calculos, setCalculos] = useState([]);
  const [similares, setSimilares] = useState([]);

  // Load JSON
  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch("/cerebro_pwa.json");
        const json = await res.json();
        setData(json);
      } catch {
        setData(MOCK_DATA);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  // Calculations
  const calcular = useCallback(() => {
    if (!data || !data.coeficientes || !data.historico_maquinas) return;
    const nuevos = bobinas.map((b, i) => {
      const coef = data.coeficientes.find(
        (c) => c.clase === b.clase && c.tipo === b.tipo && c.conductor === b.conductor && c.regimen === regimen
      );
      const peso = parseFloat(b.peso) || 0;
      const coeficiente = coef ? coef.coeficiente : null;
      const horas = coeficiente !== null ? peso * coeficiente : null;
      return { id: i + 1, label: `Bobinna ${i + 1}`, clase: b.clase, tipo: b.tipo, conductor: b.conductor, peso, coeficiente, horas };
    });
    setCalculos(nuevos);

    // Find similar machines
    const pesoTotal = nuevos.reduce((s, c) => s + c.peso, 0);
    const scored = data.historico_maquinas
      .map((m) => {
        const pesoDiff = Math.abs(m.peso_total_kg - pesoTotal) / (pesoTotal || 1);
        const regimenBonus = m.regimen === regimen ? 0 : 0.5;
        return { ...m, score: pesoDiff + regimenBonus };
      })
      .sort((a, b) => a.score - b.score)
      .slice(0, 5);
    setSimilares(scored);
  }, [data, bobinas, regimen]);

  useEffect(() => { calcular(); }, [calcular]);

  // Bobina handlers
  const updateBobina = (idx, field, val) => {
    setBobinas((prev) => prev.map((b, i) => i === idx ? { ...b, [field]: val } : b));
  };
  const addBobina = () => { if (bobinas.length < 4) setBobinas((p) => [...p, defaultBobina()]); };
  const removeBobina = (idx) => { if (bobinas.length > 1) setBobinas((p) => p.filter((_, i) => i !== idx)); };

  const totalHoras = calculos.reduce((s, c) => s + (c.horas || 0), 0);
  const chartData = calculos.map((c) => ({ name: c.label, horas: c.horas || 0 }));

  if (loading) {
    return (
      <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "linear-gradient(135deg, #fff7ed 0%, #fef3c7 50%, #fff 100%)" }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ width: 56, height: 56, borderRadius: "50%", border: "4px solid #fed7aa", borderTopColor: "#f97316", animation: "spin 0.8s linear infinite", margin: "0 auto 16px" }} />
          <p style={{ color: "#94a3b8", fontFamily: "system-ui, sans-serif" }}>Cargando cerebro...</p>
        </div>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  return (
    <div style={{
      minHeight: "100vh",
      background: "linear-gradient(135deg, #fff7ed 0%, #fef9f0 40%, #f0f9ff 100%)",
      fontFamily: "'DM Sans', 'Segoe UI', system-ui, sans-serif",
      padding: "0 0 48px",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;0,9..40,700;0,9..40,800&display=swap');
        * { box-sizing: border-box; }
        ::-webkit-scrollbar { width: 6px; } ::-webkit-scrollbar-track { background: transparent; } ::-webkit-scrollbar-thumb { background: #fdba74; border-radius: 99px; }
        input[type=number]::-webkit-inner-spin-button { -webkit-appearance: none; } input[type=number] { -moz-appearance: textfield; }
        @keyframes fadeUp { from { opacity:0; transform:translateY(16px); } to { opacity:1; transform:translateY(0); } }
        .fade-up { animation: fadeUp 0.4s ease both; }
        .bobina-card:hover { transform: translateY(-2px); transition: transform 0.2s; }
        .similar-row:hover { background: rgba(249,115,22,0.06) !important; }
        .btn-add:hover { background: #ea580c !important; }
        .btn-remove:hover { background: #fef2f2 !important; border-color: #fca5a5 !important; color: #ef4444 !important; }
      `}</style>

      {/* HEADER */}
      <div style={{
        background: "rgba(255,255,255,0.7)",
        backdropFilter: "blur(20px)",
        borderBottom: "1px solid rgba(249,115,22,0.12)",
        padding: "0 32px",
        position: "sticky", top: 0, zIndex: 50,
      }}>
        <div style={{ maxWidth: 1280, margin: "0 auto", display: "flex", alignItems: "center", justifyContent: "space-between", height: 64 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{
              width: 36, height: 36, borderRadius: 10,
              background: "linear-gradient(135deg, #f97316, #ea580c)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 12px rgba(249,115,22,0.35)",
            }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </div>
            <div>
              <span style={{ fontSize: 17, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.02em" }}>Cerebro PWA</span>
              <span style={{ fontSize: 12, color: "#94a3b8", marginLeft: 8 }}>Estimador de Bobinado</span>
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <div style={{ width: 8, height: 8, borderRadius: "50%", background: "#22c55e", boxShadow: "0 0 6px #22c55e" }} />
            <span style={{ fontSize: 12, color: "#64748b", fontWeight: 500 }}>Sistema activo</span>
          </div>
        </div>
      </div>

      <div style={{ maxWidth: 1280, margin: "0 auto", padding: "32px 24px 0" }}>

        {/* TOP STATS */}
        <div className="fade-up" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: 16, marginBottom: 28 }}>
          {/* TOTAL HOURS HERO CARD */}
          <GlassCard style={{ padding: "24px 28px", gridColumn: "span 1", background: "linear-gradient(135deg, #f97316 0%, #ea580c 100%)", border: "none" }}>
            <p style={{ fontSize: 11, fontWeight: 600, color: "rgba(255,255,255,0.75)", textTransform: "uppercase", letterSpacing: "0.1em", marginBottom: 8 }}>Total Horas de Bobinado</p>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontSize: 42, fontWeight: 800, color: "white", letterSpacing: "-0.04em", lineHeight: 1 }}>{totalHoras.toFixed(1)}</span>
              <span style={{ fontSize: 16, color: "rgba(255,255,255,0.75)", fontWeight: 500 }}>hrs</span>
            </div>
            <p style={{ fontSize: 12, color: "rgba(255,255,255,0.65)", marginTop: 6 }}>{bobinas.length} bobina{bobinas.length > 1 ? "s" : ""} · {REGIMEN_LABELS[regimen]}</p>
          </GlassCard>

          {calculos.map((c, i) => (
            <GlassCard key={i} style={{ padding: "20px 22px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <p style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em" }}>{c.label}</p>
                <span style={{ fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 99, background: `${BOBINA_COLORS[i]}22`, color: BOBINA_COLORS[i] }}>{c.clase}</span>
              </div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 4 }}>
                <span style={{ fontSize: 28, fontWeight: 700, color: "#1e293b", letterSpacing: "-0.03em" }}>{c.horas !== null ? c.horas.toFixed(1) : "—"}</span>
                <span style={{ fontSize: 13, color: "#94a3b8" }}>hrs</span>
              </div>
              <p style={{ fontSize: 11, color: "#94a3b8", marginTop: 4 }}>
                {c.peso > 0 ? `${c.peso} kg` : "Sin peso"} {c.coeficiente ? `· ×${c.coeficiente}` : "· Sin coef."}
              </p>
            </GlassCard>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "380px 1fr", gap: 24, alignItems: "start" }}>

          {/* LEFT: CONFIG FORM */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Régimen */}
            <GlassCard className="fade-up" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16 }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: "#f97316" }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>Régimen de Regulación</h3>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                {REGIMENES.map((r) => (
                  <button
                    key={r}
                    onClick={() => setRegimen(r)}
                    style={{
                      width: "100%", textAlign: "left", padding: "10px 14px",
                      borderRadius: 12, border: regimen === r ? "2px solid #f97316" : "2px solid transparent",
                      background: regimen === r ? "rgba(249,115,22,0.08)" : "rgba(248,250,252,0.6)",
                      cursor: "pointer", transition: "all 0.15s",
                      fontSize: 13, fontWeight: regimen === r ? 600 : 400,
                      color: regimen === r ? "#ea580c" : "#64748b",
                      fontFamily: "inherit",
                    }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: "50%", background: regimen === r ? "#f97316" : "#cbd5e1", flexShrink: 0 }} />
                      {REGIMEN_LABELS[r]}
                    </span>
                  </button>
                ))}
              </div>
            </GlassCard>

            {/* Bobinas Config */}
            <GlassCard className="fade-up" style={{ padding: "22px 24px" }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 3, height: 18, borderRadius: 2, background: "#f97316" }} />
                  <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>Bobinas ({bobinas.length}/4)</h3>
                </div>
                {bobinas.length < 4 && (
                  <button
                    className="btn-add"
                    onClick={addBobina}
                    style={{
                      padding: "6px 14px", background: "#f97316", color: "white",
                      borderRadius: 99, border: "none", cursor: "pointer",
                      fontSize: 12, fontWeight: 600, fontFamily: "inherit",
                      transition: "background 0.15s", display: "flex", alignItems: "center", gap: 4,
                    }}
                  >
                    <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Agregar
                  </button>
                )}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                {bobinas.map((b, i) => (
                  <div
                    key={i}
                    className="bobina-card"
                    style={{
                      padding: "16px", borderRadius: 14,
                      background: "rgba(248,250,252,0.7)",
                      border: `1.5px solid ${BOBINA_COLORS[i]}40`,
                      position: "relative",
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        <div style={{ width: 24, height: 24, borderRadius: 6, background: BOBINA_COLORS[i], display: "flex", alignItems: "center", justifyContent: "center" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "white" }}>{i + 1}</span>
                        </div>
                        <span style={{ fontSize: 13, fontWeight: 600, color: "#374151" }}>Bobina {i + 1}</span>
                      </div>
                      {bobinas.length > 1 && (
                        <button
                          className="btn-remove"
                          onClick={() => removeBobina(i)}
                          style={{
                            width: 24, height: 24, borderRadius: 6, border: "1px solid #e2e8f0",
                            background: "white", cursor: "pointer", color: "#94a3b8",
                            fontSize: 14, display: "flex", alignItems: "center", justifyContent: "center",
                            transition: "all 0.15s", fontFamily: "inherit",
                          }}
                        >×</button>
                      )}
                    </div>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                      <Select label="Clase" value={b.clase} onChange={(v) => updateBobina(i, "clase", v)} options={CLASES} />
                      <Select label="Tipo" value={b.tipo} onChange={(v) => updateBobina(i, "tipo", v)} options={TIPOS} />
                      <div style={{ gridColumn: "span 2" }}>
                        <Select label="Conductor" value={b.conductor} onChange={(v) => updateBobina(i, "conductor", v)}
                          options={CONDUCTORES.map((c) => ({ value: c, label: c.replace("_", " ") }))} />
                      </div>
                      <div style={{ gridColumn: "span 2" }}>
                        <label style={{ fontSize: 11, fontWeight: 600, color: "#94a3b8", textTransform: "uppercase", letterSpacing: "0.08em", display: "block", marginBottom: 4 }}>Peso (kg)</label>
                        <input
                          type="number"
                          value={b.peso}
                          onChange={(e) => updateBobina(i, "peso", e.target.value)}
                          placeholder="0"
                          style={{
                            width: "100%", padding: "8px 12px",
                            background: "rgba(255,255,255,0.8)", border: "1.5px solid rgba(249,115,22,0.2)",
                            borderRadius: 10, fontSize: 13, color: "#1e293b",
                            fontFamily: "inherit", outline: "none",
                          }}
                          onFocus={(e) => e.target.style.borderColor = "#f97316"}
                          onBlur={(e) => e.target.style.borderColor = "rgba(249,115,22,0.2)"}
                        />
                      </div>
                    </div>

                    {calculos[i] && (
                      <div style={{ marginTop: 10, padding: "8px 10px", borderRadius: 8, background: calculos[i].coeficiente ? "rgba(249,115,22,0.07)" : "rgba(239,68,68,0.06)" }}>
                        {calculos[i].coeficiente ? (
                          <span style={{ fontSize: 12, color: "#ea580c", fontWeight: 600 }}>
                            ⚡ {calculos[i].peso} kg × {calculos[i].coeficiente} = <strong>{calculos[i].horas?.toFixed(1)} hrs</strong>
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: "#ef4444" }}>⚠ Sin coeficiente para esta combinación</span>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </GlassCard>
          </div>

          {/* RIGHT: CHARTS + TABLE */}
          <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>

            {/* Bar Chart */}
            <GlassCard className="fade-up" style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 20 }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: "#f97316" }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>Distribución de Horas por Bobina</h3>
              </div>
              {chartData.some((d) => d.horas > 0) ? (
                <ResponsiveContainer width="100%" height={240}>
                  <BarChart data={chartData} barCategoryGap="30%" margin={{ top: 4, right: 12, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(226,232,240,0.6)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 12, fill: "#94a3b8", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fontSize: 11, fill: "#94a3b8", fontFamily: "inherit" }} axisLine={false} tickLine={false} tickFormatter={(v) => `${v}h`} />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "rgba(249,115,22,0.06)" }} />
                    <Bar dataKey="horas" radius={[8, 8, 0, 0]}>
                      {chartData.map((_, i) => (
                        <Cell key={i} fill={BOBINA_COLORS[i]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div style={{ height: 240, display: "flex", alignItems: "center", justifyContent: "center", color: "#94a3b8", fontSize: 13 }}>
                  Ingresá el peso de las bobinas para ver el gráfico
                </div>
              )}
            </GlassCard>

            {/* Similar Machines Table */}
            <GlassCard className="fade-up" style={{ padding: "24px" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <div style={{ width: 3, height: 18, borderRadius: 2, background: "#f97316" }} />
                <h3 style={{ fontSize: 14, fontWeight: 700, color: "#1e293b", margin: 0 }}>Máquinas Similares</h3>
                <span style={{ fontSize: 11, padding: "2px 8px", borderRadius: 99, background: "rgba(249,115,22,0.1)", color: "#f97316", fontWeight: 600, marginLeft: "auto" }}>Top 5</span>
              </div>
              <p style={{ fontSize: 12, color: "#94a3b8", marginBottom: 16, marginTop: 4 }}>
                Histórico filtrado por peso total ({calculos.reduce((s, c) => s + c.peso, 0).toFixed(0)} kg) y régimen
              </p>

              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                  <thead>
                    <tr>
                      {["ID", "Máquina", "Cliente", "Peso (kg)", "Régimen", "Horas Reales"].map((h) => (
                        <th key={h} style={{
                          textAlign: "left", padding: "8px 12px",
                          fontSize: 11, fontWeight: 600, color: "#94a3b8",
                          textTransform: "uppercase", letterSpacing: "0.06em",
                          borderBottom: "1px solid rgba(226,232,240,0.6)",
                        }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {similares.map((m, i) => (
                      <tr key={m.id} className="similar-row" style={{ transition: "background 0.15s" }}>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                          <span style={{ fontSize: 11, fontWeight: 700, color: "#f97316", fontFamily: "monospace" }}>{m.id}</span>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 500, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>{m.nombre}</td>
                        <td style={{ padding: "10px 12px", color: "#64748b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>{m.cliente}</td>
                        <td style={{ padding: "10px 12px", color: "#374151", fontWeight: 600, borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                          {m.peso_total_kg.toLocaleString()}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                          <span style={{
                            fontSize: 11, padding: "3px 8px", borderRadius: 99, fontWeight: 600,
                            background: m.regimen === regimen ? "rgba(249,115,22,0.12)" : "rgba(148,163,184,0.12)",
                            color: m.regimen === regimen ? "#ea580c" : "#94a3b8",
                          }}>
                            {REGIMEN_LABELS[m.regimen]}
                          </span>
                        </td>
                        <td style={{ padding: "10px 12px", fontWeight: 700, color: "#1e293b", borderBottom: "1px solid rgba(241,245,249,0.8)" }}>
                          {m.horas_reales.toLocaleString()} <span style={{ fontWeight: 400, color: "#94a3b8", fontSize: 11 }}>hrs</span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </GlassCard>
          </div>
        </div>

        {/* FOOTER */}
        <div style={{ textAlign: "center", marginTop: 40, paddingBottom: 8 }}>
          <p style={{ fontSize: 12, color: "#cbd5e1" }}>Cerebro PWA · Fábrica de Transformadores · {new Date().getFullYear()}</p>
        </div>
      </div>
    </div>
  );
}