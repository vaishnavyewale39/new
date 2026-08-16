/**
 * PRAGATI AI — SIH Spatial Lattice design reminder
 * Civic spatial computing: deep signal blue, quantum teal, translucent depth planes,
 * precise coordinate motifs, and purposeful motion that clarifies data hierarchy.
 */

import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownRight,
  ArrowUpRight,
  Bell,
  Bot,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  CloudRain,
  Download,
  FileDown,
  FileText,
  Gauge,
  LayoutDashboard,
  Menu,
  MessageCircle,
  MoreHorizontal,
  PackageCheck,
  PanelLeftClose,
  PanelLeftOpen,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  SunMedium,
  Target,
  TrendingUp,
  TriangleAlert,
  X,
} from "lucide-react";
import { toast } from "sonner";
import indiaMap from "@svg-maps/india";
import { getLatestPrediction, type ModelPrediction, type ModelStatus } from "@/lib/model-api";
import {
  commodities,
  getCommodity,
  priceRows,
  riskClass,
  timeline,
  type CommodityProfile,
  type RiskLevel,
} from "@/lib/pragati-data";

type ViewKey =
  | "Dashboard"
  | "Price Intelligence"
  | "Rainfall & Weather"
  | "Price Alerts"
  | "Commodity Analysis"
  | "Buffer Stock"
  | "Reports"
  | "About Us";

const navigation: { label: ViewKey; icon: typeof LayoutDashboard }[] = [
  { label: "Dashboard", icon: LayoutDashboard },
  { label: "Price Intelligence", icon: ChartNoAxesCombined },
  { label: "Rainfall & Weather", icon: CloudRain },
  { label: "Price Alerts", icon: Bell },
  { label: "Commodity Analysis", icon: Gauge },
  { label: "Buffer Stock", icon: PackageCheck },
  { label: "Reports", icon: FileText },
  { label: "About Us", icon: ShieldCheck },
];

const pageCopy: Record<ViewKey, { eyebrow: string; title: string; description: string }> = {
  Dashboard: {
    eyebrow: "NATIONAL MARKET BRIEF",
    title: "India Commodity Price Intelligence",
    description: "Simplified price monitoring and local model signals, updated through 14 August 2026.",
  },
  "Price Intelligence": {
    eyebrow: "PRICE INTELLIGENCE",
    title: "Observed price signals",
    description: "Compare retail, wholesale and moving-average patterns across reporting centres.",
  },
  "Rainfall & Weather": {
    eyebrow: "CLIMATE SIGNALS",
    title: "Rainfall & Weather Intelligence",
    description: "Review selected rainfall, temperature and humidity observations alongside price movements.",
  },
  "Price Alerts": {
    eyebrow: "RISK MONITORING",
    title: "Price Spike Alerts",
    description: "Prioritise commodities showing price pressure, volatility or forecast deviations.",
  },
  "Commodity Analysis": {
    eyebrow: "COMMODITY EXPLORER",
    title: "Commodity Analysis",
    description: "Move from current price to weather conditions, trend context and explainable forecast signals.",
  },
  "Buffer Stock": {
    eyebrow: "DECISION SUPPORT",
    title: "Buffer Stock Decision Support",
    description: "AI-supported guidance for reviewing procurement, holding and release decisions.",
  },
  Reports: {
    eyebrow: "EVIDENCE EXPORT",
    title: "Decision Support Reports",
    description: "Create structured briefs for price, weather, buffer stock and intervention reviews.",
  },
  "About Us": {
    eyebrow: "THE PLATFORM",
    title: "About Pragati AI",
    description: "Predictive price intelligence and decision support for essential commodity stability.",
  },
};

function formatRupee(value: number, digits = 1) {
  return `₹${value.toLocaleString("en-IN", { minimumFractionDigits: digits, maximumFractionDigits: digits })}`;
}

function riskText(risk: RiskLevel) {
  const labels: Record<RiskLevel, string> = {
    Low: "Low price pressure",
    Stable: "Within expected range",
    Moderate: "Monitor movement",
    High: "Price pressure",
    Critical: "Intervention attention",
  };
  return labels[risk];
}

function predictionRisk(probability: number): RiskLevel {
  if (probability >= 0.75) return "Critical";
  if (probability >= 0.5) return "High";
  if (probability >= 0.25) return "Moderate";
  return "Stable";
}

function signedPercent(value: number) {
  return `${value >= 0 ? "+" : ""}${value.toFixed(1)}%`;
}

function StatusPill({ risk, compact = false }: { risk: RiskLevel; compact?: boolean }) {
  return (
    <span className={`risk-pill ${riskClass(risk)} ${compact ? "risk-pill-compact" : ""}`}>
      <span className="risk-dot" /> {compact ? risk : riskText(risk)}
    </span>
  );
}

function SelectControl({
  value,
  onChange,
  className = "",
}: {
  value: string;
  onChange: (value: string) => void;
  className?: string;
}) {
  return (
    <label className={`select-control ${className}`}>
      <select value={value} onChange={(event) => onChange(event.target.value)} aria-label="Select commodity">
        {commodities.map((commodity) => (
          <option value={commodity.id} key={commodity.id}>
            {commodity.name}
          </option>
        ))}
      </select>
      <ChevronDown size={14} aria-hidden="true" />
    </label>
  );
}

function TooltipContent({ active, payload, label }: { active?: boolean; payload?: any[]; label?: string }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="chart-tooltip">
      <strong>{label}</strong>
      {payload.map((entry) => (
        <span key={entry.dataKey} style={{ color: entry.stroke || entry.fill }}>
          {entry.name}: {typeof entry.value === "number" ? formatRupee(entry.value) : entry.value}
        </span>
      ))}
    </div>
  );
}

function SparkLine({ values, color }: { values: number[]; color: string }) {
  const points = values.map((value, index) => `${(index / (values.length - 1)) * 100},${36 - ((value - Math.min(...values)) / (Math.max(...values) - Math.min(...values) || 1)) * 30}`).join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 100 40" preserveAspectRatio="none" aria-label="Trend sparkline">
      <polyline points={points} fill="none" stroke={color} strokeWidth="2.2" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

function MetricCard({
  label,
  value,
  detail,
  trend,
  icon: Icon,
  delay = 0,
}: {
  label: string;
  value: string;
  detail: string;
  trend?: "up" | "down" | "neutral";
  icon: typeof Gauge;
  delay?: number;
}) {
  return (
    <article className="metric-card entrance" style={{ animationDelay: `${delay}ms` }}>
      <div className="metric-topline">
        <span>{label}</span>
        <span className="metric-icon"><Icon size={16} /></span>
      </div>
      <strong>{value}</strong>
      <small className={trend === "up" ? "signal-up" : trend === "down" ? "signal-down" : "signal-neutral"}>
        {trend === "up" ? <ArrowUpRight size={13} /> : trend === "down" ? <ArrowDownRight size={13} /> : <TrendingUp size={13} />}
        {detail}
      </small>
    </article>
  );
}

function SectionTitle({ eyebrow, title, action }: { eyebrow: string; title: string; action?: React.ReactNode }) {
  return (
    <div className="section-title">
      <div>
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </div>
      {action}
    </div>
  );
}

function PriceChart({ commodity, forecastOnly = false }: { commodity: CommodityProfile; forecastOnly?: boolean }) {
  const [series, setSeries] = useState<"retail" | "wholesale" | "seven" | "thirty">("retail");
  const [windowSize, setWindowSize] = useState<"30D" | "60D" | "90D">("90D");
  const allValues = commodity.history.map((price, index) => ({
    date: timeline[index],
    retail: price,
    wholesale: price - (commodity.retailPrice - commodity.wholesalePrice) * 0.78,
    seven: price - (commodity.retailPrice - commodity.roll7) * (index / (commodity.history.length - 1)),
    thirty: price - (commodity.retailPrice - commodity.roll30) * (index / (commodity.history.length - 1)),
  }));
  const values = allValues.slice(windowSize === "30D" ? -6 : windowSize === "60D" ? -9 : 0);
  const forecastValues = [
    { date: "23 Sep", forecast: commodity.forecast * 0.96 },
    { date: "30 Sep", forecast: commodity.forecast * 0.98 },
    { date: "07 Oct", forecast: commodity.forecast },
    { date: "14 Oct", forecast: commodity.forecast * 1.01 },
  ];
  const chartValues = [...values, ...forecastValues.map((item) => ({ ...item, retail: undefined, wholesale: undefined, seven: undefined, thirty: undefined }))];
  const label = { retail: "Retail Price", wholesale: "Wholesale Price", seven: "7-day average", thirty: "30-day average" }[series];
  const colour = { retail: "#15609b", wholesale: "#42a16b", seven: "#d98b25", thirty: "#5c7797" }[series];

  return (
    <section className={`panel price-chart-panel sih-chart ${forecastOnly ? "forecast-panel" : ""}`}>
      <div className="chart-heading">
        <div>
          <p className="micro-label">{forecastOnly ? "PREDICTED PRICE" : "OBSERVED PRICE"}</p>
          <h3>{forecastOnly ? "Historical & Predicted Price" : "Commodity Price Trend"}</h3>
        </div>
        <div className="chart-controls">
          {!forecastOnly && (
            <div className="segmented-control" aria-label="Price chart series">
              {(["retail", "wholesale", "seven", "thirty"] as const).map((item) => (
                <button className={series === item ? "active" : ""} onClick={() => setSeries(item)} key={item}>
                  {{ retail: "Retail", wholesale: "Wholesale", seven: "7D Avg", thirty: "30D Avg" }[item]}
                </button>
              ))}
            </div>
          )}
          <div className="window-control" aria-label="Selected chart period">
            {(["30D", "60D", "90D"] as const).map((item) => <button onClick={() => setWindowSize(item)} className={windowSize === item ? "active" : ""} key={item}>{item}</button>)}
          </div>
        </div>
      </div>
      <div className="chart-meta">
        <span><i style={{ background: colour }} /> {label}</span>
        <span><i className="legend-dashed" /> AI forecast</span>
        <span>Unit: ₹ / {commodity.unit}</span>
      </div>
      <div className="chart-frame"><span className="chart-hud-label">TRACE / LIVE</span>
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartValues} margin={{ top: 12, right: 14, bottom: 4, left: -12 }}>
            <defs>
              <linearGradient id="forecastFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#e9a341" stopOpacity="0.22" />
                <stop offset="100%" stopColor="#e9a341" stopOpacity="0" />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#dce5ed" strokeDasharray="3 4" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7d91" }} interval="preserveStartEnd" />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7d91" }} width={42} />
            <Tooltip content={<TooltipContent />} />
            <Area type="monotone" dataKey="forecast" name="Forecast band" fill="url(#forecastFill)" stroke="none" />
            <Line type="monotone" dataKey={series} name={label} stroke={colour} strokeWidth={2.8} dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }} animationDuration={850} />
            <Line type="monotone" dataKey="forecast" name="AI forecast" stroke="#e18e28" strokeWidth={2.5} strokeDasharray="6 5" dot={false} activeDot={{ r: 4, strokeWidth: 2, fill: "#fff" }} animationDuration={750} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="chart-footer"><span>Historical data</span><span className="forecast-rule">Forecast horizon</span><span>{commodity.confidence}% confidence</span></div>
    </section>
  );
}

function IndiaSignalMap({ commodity }: { commodity: CommodityProfile }) {
  const [active, setActive] = useState(commodity.centres[0]);
  return (
    <section className="panel map-panel">
      <div className="chart-heading">
        <div>
          <p className="micro-label">PRICE INTENSITY</p>
          <h3>India market overview</h3>
        </div>
        <StatusPill risk={commodity.risk} compact />
      </div>
      <div className="map-body">
        <div className="india-map" style={{ backgroundImage: "url(/manus-storage/pragati-map-texture_2c22ee05.png)" }}>
          <svg viewBox={indiaMap.viewBox} role="img" aria-label="Detailed India market signal map" preserveAspectRatio="xMidYMid meet">
            <title>India state and union territory market overview</title>
            {indiaMap.locations.map((location: { id: string; name: string; path: string }) => (
              <path className="india-state-map" key={location.id} d={location.path} data-state={location.name} />
            ))}
          </svg>
          {commodity.centres.map((centre) => (
            <button
              className={`map-point ${riskClass(centre.risk)} ${active.centre === centre.centre ? "selected" : ""}`}
              style={{ left: `${centre.x}%`, top: `${centre.y}%` }}
              key={centre.centre}
              onMouseEnter={() => setActive(centre)}
              onFocus={() => setActive(centre)}
              onClick={() => setActive(centre)}
              aria-label={`${centre.centre}, ${centre.state}`}
            ><span /></button>
          ))}
        </div>
        <aside className="map-callout">
          <span className="map-callout-kicker">SELECTED CENTRE</span>
          <h4>{active.centre}</h4>
          <p>{active.state}</p>
          <div className="map-stat-grid">
            <span><b>{formatRupee(active.price)}</b>Retail / {commodity.unit}</span>
            <span><b>{formatRupee(Math.max(active.price - 9.2, 1))}</b>Wholesale</span>
            <span><b>{active.rainfall} mm</b>Rainfall</span>
            <span><StatusPill risk={active.risk} compact /></span>
          </div>
        </aside>
      </div>
      <div className="map-legend"><span className="risk-low-dot" />Stable / low <span className="risk-moderate-dot" />Watch <span className="risk-high-dot" />High pressure <span className="map-source">State geometry: SVG Maps India · CC BY 4.0</span></div>
    </section>
  );
}

function InsightCard({ commodity }: { commodity: CommodityProfile }) {
  return (
    <section className="analysis-card">
      <div className="analysis-head"><span className="spark-orb"><Sparkles size={17} /></span><span>PRAGATI AI ANALYSIS</span><span className="confidence-chip">{commodity.confidence}% confidence</span></div>
      <h3>{commodity.name} is showing {commodity.risk === "High" ? "upward price pressure" : "a monitored price pattern"}.</h3>
      <p>Observed price movement is {commodity.retailPrice >= commodity.roll30 ? "above" : "near"} the 30-day mean. Recent rainfall and seasonal conditions are reviewed as contextual signals; the current forecast indicates {commodity.change > 5 ? "a moderate increase" : "limited change"} over the selected horizon.</p>
      <div className="factor-list">
        <span><TrendingUp size={15} />Trend above baseline</span>
        <span><CloudRain size={15} />{commodity.rainfall} mm rainfall</span>
        <span><Target size={15} />Forecast: {formatRupee(commodity.forecast)}</span>
      </div>
    </section>
  );
}

function CommoditySummary({ commodity, prediction }: { commodity: CommodityProfile; prediction?: ModelPrediction | null }) {
  const activeRisk = prediction ? predictionRisk(prediction.spikeProbability) : commodity.risk;
  const currentRetail = prediction?.observedPricePerKg ?? commodity.retailPrice;
  const forecastPrice = prediction?.predictedPricePerKg ?? commodity.forecast;
  const forecastMovement = prediction?.predictedReturn7dPct ?? commodity.change;
  const summary = [
    ["Current retail", formatRupee(currentRetail), prediction ? "Model source centre" : "Observed"],
    ["Wholesale", formatRupee(commodity.wholesalePrice), "Selected centre"],
    ["7-day average", formatRupee(commodity.roll7), "Rolling mean"],
    ["30-day average", formatRupee(commodity.roll30), "Rolling mean"],
    [prediction ? "7-day model estimate" : "Forecast price", formatRupee(forecastPrice), `${signedPercent(forecastMovement)} expected`],
  ];
  return (
    <section className="summary-card-row">
      {summary.map(([label, value, detail]) => <article className="summary-card" key={label} style={{color: '#290958'}}><span style={{color: '#290958'}}>{label}</span><strong style={{color: '#290958'}}>{value}</strong><small style={{color: '#290958'}}>{detail}</small></article>)}
      <article className="summary-card risk-summary"><span>Price risk</span><StatusPill risk={activeRisk} /><small>{riskText(activeRisk)}</small></article>
    </section>
  );
}

function WatchList({ commodity, onSelect }: { commodity: CommodityProfile; onSelect: (id: string) => void }) {
  const list = commodities.filter((item) => item.change > 4).sort((a, b) => b.change - a.change).slice(0, 4);
  return (
    <section className="panel watch-panel">
      <SectionTitle eyebrow="FORECAST WATCH" title="AI price rise watchlist" action={<button className="quiet-button">Trace signals <ChevronRight size={15} /></button>} />
      <div className="watch-stack">
        {list.map((item) => (
          <button className={`watch-item ${item.id === commodity.id ? "watch-active" : ""}`} onClick={() => onSelect(item.id)} key={item.id}>
            <span className="watch-icon" style={{ color: item.colour }}>{item.icon}</span>
            <span className="watch-copy"><b>{item.name}</b><small>{formatRupee(item.retailPrice)} now · {item.risk} risk</small></span>
            <span className="watch-change"><b>+{item.change}%</b><small>forecast</small></span>
            <SparkLine values={item.history.slice(-6)} color={item.change > 8 ? "#d66b3f" : "#d5902d"} />
          </button>
        ))}
      </div>
    </section>
  );
}

function WeatherImpact({ commodity }: { commodity: CommodityProfile }) {
  const rainData = commodity.rainfallSeries.map((rainfall, index) => ({ date: timeline[index], rainfall, price: commodity.history[index] }));
  return (
    <section className="panel weather-impact-panel">
      <SectionTitle eyebrow="WEATHER IMPACT" title="Rainfall and price context" action={<span className="period-pill">Selected period</span>} />
      <div className="weather-numbers">
        <span><CloudRain size={17} /><b>{commodity.rainfall} mm</b><small>Rainfall</small></span>
        <span><SunMedium size={17} /><b>{commodity.tempMax}°C</b><small>Max temp</small></span>
        <span><Gauge size={17} /><b>{commodity.humidity}%</b><small>Humidity</small></span>
      </div>
      <div className="weather-chart">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={rainData} margin={{ top: 8, right: 2, left: -28, bottom: 0 }}>
            <CartesianGrid vertical={false} stroke="#dce5ed" strokeDasharray="3 4" />
            <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#6b7d91" }} interval={2} />
            <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: "#6b7d91" }} />
            <Tooltip content={<TooltipContent />} />
            <Bar name="Rainfall (mm)" dataKey="rainfall" fill="#4d94c5" radius={[3, 3, 0, 0]} maxBarSize={18} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <p className="context-note"><span>Model context</span> Rainfall is treated as an associated external input, not as a standalone explanation for price movement.</p>
    </section>
  );
}

function DashboardPage({ commodity, onSelect, prediction, modelStatus }: { commodity: CommodityProfile; onSelect: (id: string) => void; prediction: ModelPrediction | null; modelStatus: ModelStatus }) {
  const liveRisk = prediction ? predictionRisk(prediction.spikeProbability) : commodity.risk;
  const forecastPrice = prediction?.predictedPricePerKg ?? commodity.forecast;
  const forecastMovement = prediction?.predictedReturn7dPct ?? commodity.change;
  return (
    <>
      <section className="dashboard-hero sih-hero" style={{ backgroundImage: "url(/manus-storage/pragati-sih-hero_422c0393.png)" }}>
        <div className="sih-hero-grid" aria-hidden="true"><span /><span /><span /></div>
        <div className="sih-hero-coordinates" aria-hidden="true">AR // 22.57°N · 88.36°E</div>
        <div className="hero-copy">
          <p className="eyebrow"><span className="status-light" /> {prediction ? "LOCAL FASTAPI MODEL CONNECTED" : modelStatus === "loading" ? "LOADING LOCAL MODEL" : "PROFILE DATA · MODEL UNAVAILABLE"}</p>
          <h1>{commodity.risk === "High" ? `${commodity.name} price pressure is rising.` : `${commodity.name} is in the watch window.`} <em>Latest local model signal, with one clear view of price and risk.</em></h1>
          <p className="hero-description">Selected evidence profile: {prediction ? `${prediction.sourceCentre}, ${prediction.state} · observation ${prediction.observationDate}` : `${commodity.centre}, ${commodity.state}`} · current source data is available through 14 August 2026.</p>
          <div className="hero-footnotes"><span><ShieldCheck size={15} />Evidence basis: price, rainfall, 7/30-day baselines</span><span><ChartNoAxesCombined size={15} />{prediction ? `7-day model estimate · ${(prediction.spikeProbability * 100).toFixed(1)}% spike probability` : `90-day forecast · ${commodity.confidence}% confidence`}</span></div>
        </div>
        <div className="hero-signal-card">
          <span>DECISION SIGNAL · SELECTED MARKET</span>
          <h3>{prediction?.commodity ?? commodity.name}<StatusPill risk={liveRisk} compact /></h3>
          <div><b>{formatRupee(prediction?.observedPricePerKg ?? commodity.retailPrice)}</b><small>Current retail / {commodity.unit}</small></div>
          <div className="signal-card-bottom"><span>7-day estimate <strong>{formatRupee(forecastPrice)}</strong></span><span>Expected <strong className="orange-text">{signedPercent(forecastMovement)}</strong></span></div>
        </div>
      </section>

      <section className="metrics-grid">
        <MetricCard label="Latest observation" value="14 Aug" detail="2026 source-data cutoff" icon={Target} delay={40} />
        <MetricCard label="Update window" value="2025–26" detail="01 Jan 2025 to 14 Aug 2026" icon={ChartNoAxesCombined} delay={80} />
        <MetricCard label="Commodities" value="07" detail="modelled price series" icon={PackageCheck} delay={120} />
        <MetricCard label="Reporting centres" value="12" detail="source market locations" icon={Gauge} delay={160} />
        <MetricCard label="Model inputs" value="43" detail="features per prediction" trend="neutral" icon={Sparkles} delay={200} />
      </section>

      <div className="primary-grid">
        <IndiaSignalMap commodity={commodity} />
        <WatchList commodity={commodity} onSelect={onSelect} />
      </div>
      <div className="secondary-grid">
        <PriceChart commodity={commodity} />
        <WeatherImpact commodity={commodity} />
      </div>
      <section className="model-status-card">
        <div><span className="status-light" /> MODEL STATUS: {prediction ? "LOCAL FASTAPI ACTIVE" : modelStatus === "loading" ? "CONNECTING" : "STATIC PROFILE"}</div>
        <p>Features analysed</p>
        <span>Historical price</span><span>Rainfall</span><span>Temperature</span><span>Humidity</span><span>Monsoon</span><span>Crude oil</span><span>Moving averages</span><span>Seasonal pattern</span>
        <b>{prediction ? `Model features: ${prediction.featureCount} · horizon: 7 days` : "Forecast horizon: 90 days"}</b>
      </section>
    </>
  );
}

function PriceIntelligencePage({ commodity }: { commodity: CommodityProfile }) {
  const rows = priceRows.filter((row) => row.commodity === commodity.name);
  return (
    <div className="detail-page">
      <InsightCard commodity={commodity} />
      <CommoditySummary commodity={commodity} />
      <PriceChart commodity={commodity} forecastOnly />
      <section className="panel data-table-panel">
        <SectionTitle eyebrow="CENTRE LEVEL DATA" title={`${commodity.name} observations`} action={<button className="quiet-button"><Settings2 size={14} /> Sort: recent</button>} />
        <div className="table-wrap"><table>
          <thead><tr><th>Date</th><th>State</th><th>Centre</th><th>Retail price</th><th>Wholesale</th><th><CloudRain size={13} /> Rainfall</th><th>Temp.</th><th>Humidity</th><th>Oil price</th><th>Risk</th></tr></thead>
          <tbody>{rows.map((row) => <tr key={row.id}><td>{row.date}</td><td>{row.state}</td><td><b>{row.centre}</b></td><td>{formatRupee(row.retail)}</td><td>{formatRupee(row.wholesale)}</td><td>{row.rainfall} mm</td><td>{row.temperature}°C</td><td>{row.humidity}%</td><td>${row.crudeOil}</td><td><StatusPill risk={row.risk} compact /></td></tr>)}</tbody>
        </table></div>
      </section>
    </div>
  );
}

function ForecastPage({ commodity, prediction, modelStatus }: { commodity: CommodityProfile; prediction: ModelPrediction | null; modelStatus: ModelStatus }) {
  const [duration, setDuration] = useState("30 Days");
  const expectedChange = prediction?.predictedReturn7dPct ?? commodity.change;
  const spikeProbability = prediction ? prediction.spikeProbability * 100 : Math.min(89, Math.round(commodity.change * 6.4));
  return <div className="detail-page">
    <section className="forecast-summary-card"><div><p className="micro-label">SELECTED OUTLOOK</p><h2>{commodity.name} · {duration}</h2><p>Forecasts separate observed records from the predicted horizon and include an interpretable confidence level.</p></div><div className="forecast-periods">{["7 Days", "15 Days", "30 Days", "60 Days", "90 Days"].map((period) => <button className={duration === period ? "active" : ""} onClick={() => setDuration(period)} key={period}>{period}</button>)}</div></section>
    <CommoditySummary commodity={commodity} prediction={prediction} />
    <div className="forecast-main-grid"><PriceChart commodity={commodity} forecastOnly /><section className="panel outlook-panel"><p className="micro-label">{prediction ? "LOCAL FASTAPI MODEL OUTPUT" : "PROFILE MODEL OUTPUT"}</p><h3>Market outlook</h3><strong className="outlook-increase"><ArrowUpRight /> {expectedChange >= 0 ? "Increasing" : "Easing"}</strong><dl><div><dt>Expected 7-day change</dt><dd>{signedPercent(expectedChange)}</dd></div><div><dt>Spike probability</dt><dd>{spikeProbability.toFixed(1)}%</dd></div><div><dt>Inference status</dt><dd>{prediction ? "Live local" : modelStatus === "loading" ? "Loading" : "Unavailable"}</dd></div></dl>{prediction && <p className="model-live-note">{prediction.modelSource} · {prediction.sourceCentre}, {prediction.state} · observed {prediction.observationDate}</p>}<p className="context-note"><span>Interpretation</span> This forecast is decision support and should be read alongside market validation.</p></section></div>
  </div>;
}

function WeatherPage({ commodity }: { commodity: CommodityProfile }) {
  const data = commodity.rainfallSeries.map((rainfall, index) => ({ date: timeline[index], rainfall, price: commodity.history[index] }));
  return <div className="detail-page">
    <section className="weather-hero-panel" style={{ backgroundImage: "url(/manus-storage/pragati-weather-analysis_8053f073.png)" }}><div><p className="eyebrow">SELECTED MARKET · {commodity.state.toUpperCase()}</p><h2>Weather signals, measured alongside the market.</h2><p>Use this view to examine rainfall, temperature and humidity observations in context—not as standalone price causes.</p></div><div className="weather-hero-badge"><CloudRain /><strong>{commodity.rainfall} mm</strong><span>Selected rainfall</span></div></section>
    <WeatherImpact commodity={commodity} />
    <section className="panel comparison-chart"><SectionTitle eyebrow="COMPARISON" title="Rainfall vs commodity price" /><div className="chart-frame tall-chart"><ResponsiveContainer width="100%" height="100%"><LineChart data={data} margin={{ top: 12, right: 15, bottom: 0, left: -18 }}><CartesianGrid vertical={false} stroke="#dce5ed" strokeDasharray="3 4" /><XAxis dataKey="date" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7d91" }} interval={1} /><YAxis yAxisId="left" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7d91" }} /><YAxis yAxisId="right" orientation="right" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: "#6b7d91" }} /><Tooltip content={<TooltipContent />} /><Line yAxisId="left" dataKey="rainfall" name="Rainfall (mm)" stroke="#4d94c5" strokeWidth={2.5} dot={false} /><Line yAxisId="right" dataKey="price" name="Retail price" stroke="#e18e28" strokeWidth={2.5} dot={false} /></LineChart></ResponsiveContainer></div></section>
  </div>;
}

function AlertsPage({ onSelect }: { onSelect: (id: string) => void }) {
  return <div className="detail-page"><section className="alerts-header"><div><p className="eyebrow">ACTIVE REVIEW QUEUE</p><h2>Three commodities require attention.</h2><p>Alerts are prioritised from movement against baselines and the selected forecast profile.</p></div><span>Updated from selected data profile</span></section><div className="alert-grid">{commodities.filter((item) => item.risk === "High" || item.change > 5).map((item) => <article className="alert-card" key={item.id}><div><StatusPill risk={item.risk} compact /><span className="alert-symbol"><TriangleAlert size={19} /></span></div><h3>{item.name}</h3><p>Current price <b>{formatRupee(item.retailPrice)} / {item.unit}</b></p><div className="alert-price-row"><span>Forecast <b>{formatRupee(item.forecast)}</b></span><span>Expected <b>+{item.change}%</b></span></div><button onClick={() => onSelect(item.id)}>Analyse <ChevronRight size={15} /></button></article>)}</div></div>;
}

function BufferStockPage({ commodity }: { commodity: CommodityProfile }) {
  const rows = commodities.filter((item) => ["Gram Dal", "Tur Dal", "Onion"].includes(item.name));
  return <div className="detail-page"><section className="buffer-intro" style={{ backgroundImage: "url(/manus-storage/pragati-buffer-stock_c246f598.png)" }}><div><p className="eyebrow">HUMAN-IN-THE-LOOP DECISION SUPPORT</p><h2>Buffer stock signals should support—not replace—public decisions.</h2><p>Use current price, forecast pressure and available stock indicators to identify where review may be valuable.</p></div><span><Bot size={18} /> AI-assisted only</span></section><section className="panel buffer-table"><SectionTitle eyebrow="PRIORITISED REVIEW" title="Buffer stock recommendations" /><div className="table-wrap"><table><thead><tr><th>Commodity</th><th>Current price</th><th>Forecast</th><th>Price risk</th><th>Available buffer</th><th>Recommended action</th></tr></thead><tbody>{rows.map((item) => <tr key={item.id}><td><b>{item.name}</b></td><td>{formatRupee(item.retailPrice)}</td><td>{formatRupee(item.forecast)}</td><td><StatusPill risk={item.risk} compact /></td><td>{item.buffer.toLocaleString("en-IN")} MT</td><td><span className="recommendation">{item.risk === "High" ? "Consider release" : "Monitor"}</span></td></tr>)}</tbody></table></div></section><section className="buffer-note"><TriangleAlert size={17} /><p><b>Decision guardrail:</b> Recommendations indicate a review priority based on the selected profile. They are not automated procurement or market intervention instructions.</p></section></div>;
}

function ReportsPage() {
  const reports = [
    ["Daily Commodity Price Report", "National observations and selected market signals", "Today"],
    ["Price Forecast Report", "Forecast horizon, confidence and market outlook", "This week"],
    ["Price Spike Report", "High-priority signals and price baseline deviations", "Today"],
    ["Weather Impact Report", "Rainfall, temperature and humidity context", "This week"],
    ["Buffer Stock Report", "Review priorities and AI-support recommendations", "On demand"],
  ];
  return <div className="detail-page"><section className="report-grid">{reports.map(([title, detail, status]) => <article className="report-card" key={title}><span className="report-icon"><FileText size={21} /></span><small>{status}</small><h3>{title}</h3><p>{detail}</p><div><button onClick={() => toast.success("Report generation has been queued for this prototype.")}>Generate report</button><button aria-label={`Download ${title}`} onClick={() => toast.message("Attach the live dataset to enable report export.")}><Download size={16} /></button></div></article>)}</section><section className="export-callout"><div><FileDown size={22} /><span><b>Ready for official circulation?</b> Connect the price-weather CSV to enable filtered CSV and PDF exports.</span></div><button onClick={() => toast.message("CSV mapping interface is ready for the uploaded dataset.")}>Export selected data</button></section></div>;
}

function AboutPage() {
  return <div className="detail-page about-page"><section className="about-hero"><p className="eyebrow">PREDICT · EXPLAIN · PREPARE</p><h2>Commodity intelligence designed for accountable public action.</h2><p>Pragati AI is an AI-enabled price intelligence platform designed to help monitor essential commodity prices, identify emerging risks and review external factors with a clear, evidence-led interface.</p></section><section className="objective-grid">{[["Monitor", "Track commodity prices across reporting centres."], ["Predict", "Review short-term model signals."], ["Explain", "Identify factors associated with price changes."], ["Support", "Provide insights for procurement and buffer-stock review."]].map(([title, text], index) => <article key={title}><span>0{index + 1}</span><h3>{title}</h3><p>{text}</p></article>)}</section><section className="coverage-card"><p>DATA COVERAGE</p><div><strong>07</strong><span>Modelled commodities</span></div><div><strong>12</strong><span>Reporting centres</span></div><div><strong>Price + Weather</strong><span>Intelligence inputs</span></div><div><strong>14 Aug 2026</strong><span>Latest source observation</span></div></section></div>;
}

function AIChat({ commodity, onClose }: { commodity: CommodityProfile; onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [messages, setMessages] = useState<{ role: "user" | "ai"; text: string }[]>([
    { role: "ai", text: `I’m ready to review ${commodity.name}. I’ll distinguish observed records, forecast signals and contextual factors.` },
  ]);
  const prompts = [`Why is ${commodity.name} price increasing?`, "Which commodities have the highest risk?", `How is rainfall affecting ${commodity.name}?`];
  const send = (value = prompt) => {
    if (!value.trim()) return;
    setMessages((items) => [...items, { role: "user", text: value }, { role: "ai", text: `For ${commodity.name}, the selected profile shows retail price at ${formatRupee(commodity.retailPrice)} and a ${commodity.change > 0 ? `+${commodity.change}%` : "limited"} forecast movement. Observed price is ${commodity.retailPrice >= commodity.roll30 ? "above" : "near"} its 30-day mean. Rainfall (${commodity.rainfall} mm), seasonal patterns and the oil/transport proxy are treated as contextual inputs; they do not establish causation on their own.` }]);
    setPrompt("");
  };
  return <div className="modal-backdrop"><section className="chat-modal" role="dialog" aria-modal="true" aria-label="Ask Pragati AI"><header><div><span className="chat-bot-icon"><Bot size={18} /></span><div><b>Ask Pragati AI</b><small><span className="status-light" />Contextual analysis active</small></div></div><button onClick={onClose} aria-label="Close chat"><X size={19} /></button></header><div className="chat-content"><div className="chat-intro"><p>Ask about prices, rainfall, forecasts and risk. Responses distinguish observed facts from model-based estimates.</p><div>{prompts.map((item) => <button onClick={() => send(item)} key={item}>{item}</button>)}</div></div>{messages.map((message, index) => <article className={`chat-message ${message.role}`} key={index}><span>{message.role === "ai" ? "PA" : "YOU"}</span><p>{message.text}</p></article>)}</div><form onSubmit={(event) => { event.preventDefault(); send(); }}><input value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder="Ask Pragati AI a question…" autoFocus /><button aria-label="Send question"><Send size={17} /></button></form></section></div>;
}

export default function Home() {
  const appRef = useRef<HTMLDivElement>(null);
  const [activeView, setActiveView] = useState<ViewKey>("Dashboard");
  const [selectedId, setSelectedId] = useState("gram-dal");
  const [query, setQuery] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdated, setLastUpdated] = useState("Live profile");
  const commodity = useMemo(() => getCommodity(selectedId), [selectedId]);
  const [modelPrediction, setModelPrediction] = useState<ModelPrediction | null>(null);
  const [modelStatus, setModelStatus] = useState<ModelStatus>("loading");
  const loadLocalPrediction = useCallback(async () => {
    setModelStatus("loading");
    try {
      const prediction = await getLatestPrediction(commodity.name);
      setModelPrediction(prediction);
      setModelStatus("ready");
      setLastUpdated(`Model ${prediction.observationDate}`);
    } catch {
      setModelPrediction(null);
      setModelStatus("unavailable");
      setLastUpdated("Local model offline");
    }
  }, [commodity.name]);
  useEffect(() => { void loadLocalPrediction(); }, [loadLocalPrediction]);
  const suggestions = commodities.filter((item) => item.name.toLowerCase().includes(query.toLowerCase())).slice(0, 5);
  const chooseCommodity = (id: string) => { setSelectedId(id); setQuery(""); setActiveView("Price Intelligence"); };
  const setView = (view: ViewKey) => { setActiveView(view); setSidebarOpen(false); };
  const refreshSignals = () => {
    if (refreshing) return;
    setRefreshing(true);
    window.setTimeout(() => { void loadLocalPrediction().then(() => { setRefreshing(false); toast.success("Local model prediction refreshed"); }); }, 360);
  };
  const handleDepthMove = (event: PointerEvent<HTMLDivElement>) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width - 0.5) * 2;
    const y = ((event.clientY - rect.top) / rect.height - 0.5) * 2;
    appRef.current?.style.setProperty("--pointer-x", x.toFixed(3));
    appRef.current?.style.setProperty("--pointer-y", y.toFixed(3));
  };
  const resetDepth = () => {
    appRef.current?.style.setProperty("--pointer-x", "0");
    appRef.current?.style.setProperty("--pointer-y", "0");
  };
  const isAnalysis = ["Price Intelligence", "Commodity Analysis"].includes(activeView);
  let content: React.ReactNode;
  if (activeView === "Dashboard") content = <DashboardPage commodity={commodity} onSelect={chooseCommodity} prediction={modelPrediction} modelStatus={modelStatus} />;
  else if (isAnalysis) content = <PriceIntelligencePage commodity={commodity} />;
  else if (activeView === "Rainfall & Weather") content = <WeatherPage commodity={commodity} />;
  else if (activeView === "Price Alerts") content = <AlertsPage onSelect={chooseCommodity} />;
  else if (activeView === "Buffer Stock") content = <BufferStockPage commodity={commodity} />;
  else if (activeView === "Reports") content = <ReportsPage />;
  else content = <AboutPage />;

  return <div className="pragati-app sih-lattice" ref={appRef} onPointerMove={handleDepthMove} onPointerLeave={resetDepth}>
    <div className="cinematic-scene" aria-hidden="true">
      <span className="scene-orbit orbit-a" /><span className="scene-orbit orbit-b" /><span className="scene-beam beam-a" /><span className="scene-beam beam-b" />
      {Array.from({ length: 10 }, (_, index) => <span className="scene-particle" style={{ left: `${(index * 17 + 7) % 94}%`, top: `${(index * 29 + 5) % 89}%`, animationDelay: `${index * -0.62}s`, animationDuration: `${6 + (index % 5) * 1.25}s` }} key={index} />)}
    </div>
    <aside className={`sidebar ${sidebarOpen ? "sidebar-open" : ""}`}>
      <div className="brand-block"><img src="/manus-storage/pragati-sih-logo_5240e1fc.png" alt="Pragati AI agri-orbit glyph" /><div><strong className="brand-wordmark">PRAGATI <em>AI</em></strong><span>Spatial Price Intelligence</span></div><button className="mobile-close" onClick={() => setSidebarOpen(false)}><X size={18} /></button></div>
      <div className="rail-label"><span>SIH // COMMAND SURFACE</span><i>INDIA · ESSENTIAL COMMODITIES</i></div>
      <nav>{navigation.slice(0, 6).map(({ label, icon: Icon }) => <button className={activeView === label || (label === "Price Intelligence" && activeView === "Commodity Analysis") ? "nav-active" : ""} onClick={() => setView(label)} key={label}><Icon size={17} /><span>{label}</span>{label === "Price Alerts" && <i>3</i>}</button>)}</nav>
      <div className="sidebar-spacer" />
      <nav className="sidebar-bottom-nav">{navigation.slice(6).map(({ label, icon: Icon }) => <button className={activeView === label ? "nav-active" : ""} onClick={() => setView(label)} key={label}><Icon size={17} /><span>{label}</span></button>)}</nav>
      <div className="sidebar-model"><span><Sparkles size={15} /> AI MODEL ACTIVE</span><p>Last signal refresh<br /><b>Selected price-weather profile</b></p></div>
    </aside>
    {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}
    <main className="main-canvas">
      <header className="topbar"><button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation"><Menu size={20} /></button><div className="mobile-brand"><img src="/manus-storage/pragati-sih-logo_5240e1fc.png" alt="" /><b>PRAGATI AI</b></div><div className="search-shell"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter" && suggestions[0]) chooseCommodity(suggestions[0].id); }} placeholder="Search commodity signal…" aria-label="Search commodity" />{query && <div className="search-results"><p>SEARCH RESULTS</p>{suggestions.length ? suggestions.map((item) => <button onClick={() => chooseCommodity(item.id)} key={item.id}><span style={{ color: item.colour }}>{item.icon}</span><b>{item.name}</b><small>{item.category}</small><ChevronRight size={15} /></button>) : <span className="no-result">No matching commodity in selected profile</span>}</div>}</div><div className="topbar-actions"><button className="refresh-button" onClick={refreshSignals} title="Refresh local model signal"><RefreshCw size={15} className={refreshing ? "spin-once" : ""} /><span>{lastUpdated}</span></button><button className="bell-button" onClick={() => setView("Price Alerts")} aria-label="View alerts"><Bell size={18} /><i /></button><button className="ask-button" onClick={() => setChatOpen(true)}><Bot size={16} /><span>Review evidence</span></button></div></header>
      <div className="content-area view-transition" key={`${activeView}-${selectedId}`}><section className="page-heading sih-heading"><div><p>{pageCopy[activeView].eyebrow}</p><h1>{pageCopy[activeView].title}</h1><span>{pageCopy[activeView].description}</span></div><div className="heading-select"><span>Active commodity</span><SelectControl value={selectedId} onChange={setSelectedId} /></div></section>{content}</div>
    </main>
    <nav className="mobile-bottom-nav"><button onClick={() => setView("Dashboard")} className={activeView === "Dashboard" ? "active" : ""}><LayoutDashboard size={17} /><span>Home</span></button><button onClick={() => setView("Price Intelligence")} className={isAnalysis ? "active" : ""}><ChartNoAxesCombined size={17} /><span>Prices</span></button><button onClick={() => setChatOpen(true)}><span className="mobile-ai"><Bot size={19} /></span><span>Ask AI</span></button><button onClick={() => setView("Price Alerts")} className={activeView === "Price Alerts" ? "active" : ""}><Bell size={17} /><span>Alerts</span></button><button onClick={() => setSidebarOpen(true)}><MoreHorizontal size={17} /><span>More</span></button></nav>
    {chatOpen && <AIChat commodity={commodity} onClose={() => setChatOpen(false)} />}
  </div>;
}
