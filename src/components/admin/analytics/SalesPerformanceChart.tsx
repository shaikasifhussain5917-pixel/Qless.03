import { useState, useMemo } from "react";
import { CompletedOrder } from "../../../types";
import { fmt } from "../../../utils/formatters";

interface SalesPerformanceChartProps {
  orders: CompletedOrder[];
}

type Timeframe = "daily" | "weekly" | "monthly";

export function SalesPerformanceChart({ orders }: SalesPerformanceChartProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>("daily");
  const [hoveredPoint, setHoveredPoint] = useState<{
    label: string;
    revenue: number;
    count: number;
    x: number;
    y: number;
  } | null>(null);

  // Filter to confirmed orders only
  const confirmedOrders = useMemo(() => {
    return orders.filter(
      (o) => (o.paymentStatus || "").toUpperCase() === "CONFIRMED"
    );
  }, [orders]);

  // Aggregate by selected timeframe
  const chartData = useMemo(() => {
    if (confirmedOrders.length === 0) return [];

    const map = new Map<string, { label: string; revenue: number; count: number; date: Date }>();

    for (const order of confirmedOrders) {
      const rawDate = order.createdAt ? new Date(order.createdAt) : new Date();
      if (isNaN(rawDate.getTime())) continue;

      let key = "";
      let label = "";

      if (timeframe === "daily") {
        key = rawDate.toISOString().slice(0, 10); // YYYY-MM-DD
        label = rawDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" });
      } else if (timeframe === "weekly") {
        // Find Monday of the week
        const d = new Date(rawDate);
        const day = d.getDay();
        const diff = d.getDate() - day + (day === 0 ? -6 : 1);
        d.setDate(diff);
        key = d.toISOString().slice(0, 10);
        label = `Wk ${d.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}`;
      } else {
        // Monthly
        key = `${rawDate.getFullYear()}-${String(rawDate.getMonth() + 1).padStart(2, "0")}`;
        label = rawDate.toLocaleDateString("en-IN", { month: "short", year: "2-digit" });
      }

      const existing = map.get(key);
      const rev = Number(order.finalTotal) || 0;

      if (existing) {
        existing.revenue += rev;
        existing.count += 1;
      } else {
        map.set(key, { label, revenue: rev, count: 1, date: rawDate });
      }
    }

    const sorted = Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([, val]) => val);

    // If there is only 1 point, add padding point for area rendering
    if (sorted.length === 1) {
      const single = sorted[0];
      const prevDate = new Date(single.date);
      prevDate.setDate(prevDate.getDate() - 1);
      return [
        { label: prevDate.toLocaleDateString("en-IN", { day: "numeric", month: "short" }), revenue: 0, count: 0, date: prevDate },
        single,
      ];
    }

    return sorted;
  }, [confirmedOrders, timeframe]);

  // Aggregate metrics for timeframe
  const totalPeriodRevenue = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.revenue, 0);
  }, [chartData]);

  const totalPeriodOrders = useMemo(() => {
    return chartData.reduce((sum, d) => sum + d.count, 0);
  }, [chartData]);

  // SVG Geometry Calculation
  const width = 640;
  const height = 200;
  const paddingLeft = 45;
  const paddingRight = 20;
  const paddingTop = 20;
  const paddingBottom = 30;

  const chartW = width - paddingLeft - paddingRight;
  const chartH = height - paddingTop - paddingBottom;

  const maxRevenue = useMemo(() => {
    const max = Math.max(...chartData.map((d) => d.revenue), 100);
    return Math.ceil(max / 100) * 100;
  }, [chartData]);

  const points = useMemo(() => {
    if (chartData.length < 2) return [];

    return chartData.map((d, i) => {
      const x = paddingLeft + (i / (chartData.length - 1)) * chartW;
      const y = paddingTop + chartH - (d.revenue / maxRevenue) * chartH;
      return { x, y, data: d };
    });
  }, [chartData, chartW, chartH, maxRevenue]);

  // Path strings
  const linePath = useMemo(() => {
    if (points.length < 2) return "";
    return points.reduce((acc, p, i) => {
      return i === 0 ? `M ${p.x} ${p.y}` : `${acc} L ${p.x} ${p.y}`;
    }, "");
  }, [points]);

  const areaPath = useMemo(() => {
    if (points.length < 2) return "";
    const first = points[0];
    const last = points[points.length - 1];
    const bottom = paddingTop + chartH;
    return `${linePath} L ${last.x} ${bottom} L ${first.x} ${bottom} Z`;
  }, [linePath, points, chartH]);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
      {/* Chart Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-emerald-50 text-emerald-600 text-xs font-bold">
              📈
            </span>
            <h3 className="font-poppins text-sm font-bold text-[#0F2044]">
              Sales Performance
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Confirmed customer self-checkout transaction revenue over time
          </p>
        </div>

        {/* Timeframe Tabs & Period Total */}
        <div className="flex items-center gap-3 self-start sm:self-auto">
          <div className="text-right hidden sm:block">
            <p className="font-poppins text-sm font-extrabold text-[#0F2044] leading-tight">
              {fmt(totalPeriodRevenue)}
            </p>
            <p className="text-[10px] text-slate-400">
              {totalPeriodOrders} confirmed order{totalPeriodOrders === 1 ? "" : "s"}
            </p>
          </div>

          <div className="inline-flex rounded-xl bg-slate-100 p-0.5 border border-slate-200/60">
            {(["daily", "weekly", "monthly"] as Timeframe[]).map((tf) => (
              <button
                key={tf}
                type="button"
                onClick={() => setTimeframe(tf)}
                className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold transition capitalize cursor-pointer ${
                  timeframe === tf
                    ? "bg-white text-[#0F2044] shadow-2xs font-bold"
                    : "text-slate-500 hover:text-[#0F2044]"
                }`}
              >
                {tf}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Chart Canvas */}
      <div className="relative pt-3 w-full">
        {chartData.length === 0 ? (
          <div className="h-[200px] flex flex-col items-center justify-center text-slate-400 text-center px-4">
            <span className="text-2xl mb-1.5">📊</span>
            <p className="font-semibold text-xs text-slate-600">No Confirmed Orders Recorded Yet</p>
            <p className="text-[11px] text-slate-400 max-w-xs mt-0.5">
              Live customer self-checkout orders from Supabase will dynamically generate the revenue curve.
            </p>
          </div>
        ) : (
          <div className="w-full overflow-hidden">
            <svg
              viewBox={`0 0 ${width} ${height}`}
              className="w-full h-[200px] overflow-visible"
              preserveAspectRatio="none"
            >
              <defs>
                <linearGradient id="salesGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#10B981" stopOpacity="0.25" />
                  <stop offset="100%" stopColor="#10B981" stopOpacity="0.0" />
                </linearGradient>
              </defs>

              {/* Horizontal Gridlines */}
              {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                const y = paddingTop + chartH * (1 - ratio);
                const val = Math.round(maxRevenue * ratio);
                return (
                  <g key={ratio}>
                    <line
                      x1={paddingLeft}
                      y1={y}
                      x2={width - paddingRight}
                      y2={y}
                      stroke="#E2E8F0"
                      strokeDasharray="3 3"
                      strokeWidth="1"
                    />
                    <text
                      x={paddingLeft - 6}
                      y={y + 3.5}
                      textAnchor="end"
                      className="text-[9px] fill-slate-400 font-mono"
                    >
                      ₹{val >= 1000 ? `${(val / 1000).toFixed(1)}k` : val}
                    </text>
                  </g>
                );
              })}

              {/* Gradient Area */}
              {areaPath && <path d={areaPath} fill="url(#salesGradient)" />}

              {/* Line */}
              {linePath && (
                <path
                  d={linePath}
                  fill="none"
                  stroke="#10B981"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              )}

              {/* Interactive Data Points */}
              {points.map((p, i) => (
                <g key={i}>
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={hoveredPoint?.label === p.data.label ? "6" : "3.5"}
                    fill="#FFFFFF"
                    stroke="#10B981"
                    strokeWidth={hoveredPoint?.label === p.data.label ? "3" : "2"}
                    className="cursor-pointer transition-all duration-150"
                    onMouseEnter={() =>
                      setHoveredPoint({
                        label: p.data.label,
                        revenue: p.data.revenue,
                        count: p.data.count,
                        x: p.x,
                        y: p.y,
                      })
                    }
                    onMouseLeave={() => setHoveredPoint(null)}
                  />
                  {/* X Axis Label */}
                  <text
                    x={p.x}
                    y={height - 8}
                    textAnchor="middle"
                    className="text-[9.5px] fill-slate-400 font-medium"
                  >
                    {p.data.label}
                  </text>
                </g>
              ))}
            </svg>

            {/* Hover Tooltip Overlay */}
            {hoveredPoint && (
              <div
                className="pointer-events-none absolute z-10 -translate-x-1/2 -translate-y-full rounded-xl bg-[#0F2044] px-2.5 py-1.5 text-white shadow-lg transition-all text-center"
                style={{
                  left: `${(hoveredPoint.x / width) * 100}%`,
                  top: `${(hoveredPoint.y / height) * 100 - 8}%`,
                }}
              >
                <p className="text-[10px] text-slate-300 font-medium">{hoveredPoint.label}</p>
                <p className="font-poppins text-xs font-bold text-emerald-400">
                  {fmt(hoveredPoint.revenue)}
                </p>
                <p className="text-[9px] text-slate-400">
                  {hoveredPoint.count} order{hoveredPoint.count === 1 ? "" : "s"}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

