import { useMemo } from "react";
import { AdminInventoryItem } from "../../../services/adminInventoryService";
import { StockFilter } from "../../../types";

interface InventoryDoughnutChartProps {
  inventory: AdminInventoryItem[];
  onSelectStockFilter?: (filter: StockFilter) => void;
}

export function InventoryDoughnutChart({
  inventory,
  onSelectStockFilter,
}: InventoryDoughnutChartProps) {
  // Calculate distribution
  const inStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity > 10).length;
  }, [inventory]);

  const lowStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity <= 10 && p.stockQuantity > 0).length;
  }, [inventory]);

  const outOfStockCount = useMemo(() => {
    return inventory.filter((p) => p.stockQuantity === 0).length;
  }, [inventory]);

  const total = inventory.length;

  const inStockPct = total > 0 ? Math.round((inStockCount / total) * 100) : 0;
  const lowStockPct = total > 0 ? Math.round((lowStockCount / total) * 100) : 0;
  const outOfStockPct = total > 0 ? Math.round((outOfStockCount / total) * 100) : 0;

  // SVG circular arc calculations
  const radius = 64;
  const strokeWidth = 18;
  const circumference = 2 * Math.PI * radius;

  // Offset calculations for 3 arcs
  const inStockDash = (inStockCount / (total || 1)) * circumference;
  const lowStockDash = (lowStockCount / (total || 1)) * circumference;
  const outOfStockDash = (outOfStockCount / (total || 1)) * circumference;

  const inStockOffset = 0;
  const lowStockOffset = -inStockDash;
  const outOfStockOffset = -(inStockDash + lowStockDash);

  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-xs flex flex-col justify-between">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-100 pb-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-lg bg-blue-50 text-blue-600 text-xs font-bold">
              🍩
            </span>
            <h3 className="font-poppins text-sm font-bold text-[#0F2044]">
              Inventory Distribution
            </h3>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Real-time stock capacity health across all {total} store SKUs
          </p>
        </div>
      </div>

      {/* Doughnut Graphic & Legend */}
      <div className="flex flex-col sm:flex-row items-center justify-around gap-4 py-3">
        {/* SVG Doughnut */}
        <div className="relative flex items-center justify-center shrink-0">
          <svg width="170" height="170" viewBox="0 0 170 170" className="-rotate-90">
            {/* Background ring */}
            <circle
              cx="85"
              cy="85"
              r={radius}
              fill="transparent"
              stroke="#F1F5F9"
              strokeWidth={strokeWidth}
            />

            {total > 0 && (
              <>
                {/* In Stock Segment */}
                <circle
                  cx="85"
                  cy="85"
                  r={radius}
                  fill="transparent"
                  stroke="#10B981"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${inStockDash} ${circumference}`}
                  strokeDashoffset={inStockOffset}
                  strokeLinecap="butt"
                  className="transition-all duration-500"
                />

                {/* Low Stock Segment */}
                <circle
                  cx="85"
                  cy="85"
                  r={radius}
                  fill="transparent"
                  stroke="#F59E0B"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${lowStockDash} ${circumference}`}
                  strokeDashoffset={lowStockOffset}
                  strokeLinecap="butt"
                  className="transition-all duration-500"
                />

                {/* Out of Stock Segment */}
                <circle
                  cx="85"
                  cy="85"
                  r={radius}
                  fill="transparent"
                  stroke="#EF4444"
                  strokeWidth={strokeWidth}
                  strokeDasharray={`${outOfStockDash} ${circumference}`}
                  strokeDashoffset={outOfStockOffset}
                  strokeLinecap="butt"
                  className="transition-all duration-500"
                />
              </>
            )}
          </svg>

          {/* Center Info */}
          <div className="absolute text-center flex flex-col items-center justify-center pointer-events-none">
            <span className="font-poppins text-2xl font-extrabold text-[#0F2044] leading-tight">
              {total}
            </span>
            <span className="text-[9.5px] uppercase tracking-wider font-bold text-slate-400">
              Total SKUs
            </span>
          </div>
        </div>

        {/* Legend & Breakdown Pills */}
        <div className="flex flex-col gap-2 w-full sm:w-auto">
          {/* Healthy In Stock */}
          <button
            type="button"
            onClick={() => onSelectStockFilter && onSelectStockFilter("in_stock")}
            className="flex items-center justify-between gap-4 p-2 rounded-xl border border-slate-100 hover:bg-slate-50 transition text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-emerald-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-[#0F2044]">In Stock (&gt;10)</p>
                <p className="text-[10px] text-slate-400">{inStockPct}% of catalog</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-poppins text-xs font-bold text-emerald-600">
                {inStockCount}
              </span>
              <span className="block text-[9px] text-slate-400">SKUs</span>
            </div>
          </button>

          {/* Low Stock */}
          <button
            type="button"
            onClick={() => onSelectStockFilter && onSelectStockFilter("low_stock")}
            className="flex items-center justify-between gap-4 p-2 rounded-xl border border-amber-100 bg-amber-50/40 hover:bg-amber-50/80 transition text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-amber-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-amber-950">Low Stock (≤10)</p>
                <p className="text-[10px] text-amber-700">{lowStockPct}% of catalog</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-poppins text-xs font-bold text-amber-800">
                {lowStockCount}
              </span>
              <span className="block text-[9px] text-amber-700">Reorder</span>
            </div>
          </button>

          {/* Out of Stock */}
          <button
            type="button"
            onClick={() => onSelectStockFilter && onSelectStockFilter("out_of_stock")}
            className="flex items-center justify-between gap-4 p-2 rounded-xl border border-red-100 bg-red-50/40 hover:bg-red-50/80 transition text-left cursor-pointer group"
          >
            <div className="flex items-center gap-2">
              <span className="h-3 w-3 rounded-full bg-red-500 shrink-0" />
              <div>
                <p className="text-xs font-bold text-red-950">Out of Stock (0)</p>
                <p className="text-[10px] text-red-700">{outOfStockPct}% of catalog</p>
              </div>
            </div>
            <div className="text-right">
              <span className="font-poppins text-xs font-bold text-red-600">
                {outOfStockCount}
              </span>
              <span className="block text-[9px] text-red-600">Critical</span>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}

