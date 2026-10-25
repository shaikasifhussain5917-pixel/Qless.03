import { useState, useMemo } from "react";
import { STORE_AISLES, getAisleByCode } from "../../data/mockStoreLayout";

interface StoreFloorPlanProps {
  highlightedAisleCode?: string;
  highlightedRackCode?: string;
  highlightedShelfCode?: string;
  routeAisleCodes?: string[];
  activeStepAisleCode?: string;
  className?: string;
  showLegend?: boolean;
  onSelectAisle?: (aisleCode: string) => void;
  onSelectRack?: (aisleCode: string, rackCode: string) => void;
}

export function StoreFloorPlan({
  highlightedAisleCode,
  highlightedRackCode,
  highlightedShelfCode,
  routeAisleCodes = [],
  activeStepAisleCode,
  className = "",
  showLegend = true,
  onSelectAisle,
  onSelectRack,
}: StoreFloorPlanProps) {
  const [focusedAisle, setFocusedAisle] = useState<string | null>(null);
  const [focusedRack, setFocusedRack] = useState<string | null>(null);

  // SVG coordinates for each aisle gondola / island in QLess Mart (STORE001)
  const aisleLayouts: Record<
    string,
    { x: number; y: number; w: number; h: number; racks: string[]; labelPos: "inside" | "top" }
  > = {
    A01: { x: 30, y: 70, w: 100, h: 220, racks: ["R01", "R02", "R03", "R04"], labelPos: "inside" },
    A02: { x: 160, y: 70, w: 110, h: 100, racks: ["R05", "R06", "R07", "R08"], labelPos: "inside" },
    A03: { x: 300, y: 70, w: 110, h: 100, racks: ["R09", "R10", "R11", "R12"], labelPos: "inside" },
    A04: { x: 440, y: 70, w: 110, h: 100, racks: ["R13", "R14", "R15", "R16"], labelPos: "inside" },
    A05: { x: 160, y: 195, w: 110, h: 95, racks: ["R17", "R18", "R19", "R20"], labelPos: "inside" },
    A06: { x: 300, y: 195, w: 110, h: 95, racks: ["R21", "R22", "R23", "R24"], labelPos: "inside" },
    A07: { x: 440, y: 195, w: 110, h: 95, racks: ["R25", "R26", "R27", "R28"], labelPos: "inside" },
    A08: { x: 580, y: 70, w: 110, h: 220, racks: ["R29", "R30", "R31", "R32"], labelPos: "inside" },
  };

  const selectedAisle = useMemo(() => {
    if (!highlightedAisleCode) return null;
    return getAisleByCode(highlightedAisleCode);
  }, [highlightedAisleCode]);

  return (
    <div className={`flex flex-col w-full rounded-2xl border border-black/10 bg-slate-50/70 p-3 sm:p-4 ${className}`}>
      {/* Accessible Live Region for Screen Readers */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">
        {selectedAisle
          ? `Destination selected: ${selectedAisle.name} (${selectedAisle.code}), Rack ${highlightedRackCode || "all racks"}, Shelf ${highlightedShelfCode || "all shelves"}. Zone: ${selectedAisle.zone}.`
          : "Store layout map showing supermarket aisles, entrance turnstiles, and exit gates."}
      </div>

      {/* Floor Plan Header / Disclaimer */}
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-1.5 text-xs">
        <div className="flex items-center gap-1.5 font-poppins font-bold text-[#0F2044]">
          <span className="flex h-5 w-5 items-center justify-center rounded-md bg-[#0F2044] text-[10px] text-white">
            📍
          </span>
          <span>QLess Mart (STORE001) Layout</span>
        </div>
        <span className="rounded-full bg-slate-200/80 px-2.5 py-0.5 text-[10px] font-medium text-slate-700">
          Store Layout Guide · Fixed Schematic (Non-GPS)
        </span>
      </div>

      {/* SVG Floor Plan Diagram */}
      <div className="relative w-full overflow-hidden rounded-xl border border-slate-200 bg-white shadow-inner">
        <svg
          viewBox="0 0 720 380"
          className="w-full h-auto select-none"
          role="region"
          aria-label={`Interactive store map for QLess Mart. ${
            selectedAisle
              ? `Destination highlighted in ${selectedAisle.name} (${selectedAisle.code}), Rack ${highlightedRackCode || ""}`
              : "Showing store layout"
          }`}
        >
          <defs aria-hidden="true">
            {/* Subtle grid pattern */}
            <pattern id="store-grid" width="20" height="20" patternUnits="userSpaceOnUse">
              <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#F1F5F9" strokeWidth="1" />
            </pattern>

            {/* Pulsing beacon glow filter */}
            <filter id="beacon-glow" x="-30%" y="-30%" width="160%" height="160%">
              <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#2E9E44" floodOpacity="0.45" />
            </filter>
          </defs>

          {/* Grid Background */}
          <rect width="720" height="380" fill="#F8FAFC" aria-hidden="true" />
          <rect width="720" height="380" fill="url(#store-grid)" aria-hidden="true" />

          {/* Exterior Store Perimeter */}
          <rect
            x="15"
            y="15"
            width="690"
            height="350"
            rx="16"
            fill="none"
            stroke="#CBD5E1"
            strokeWidth="2"
            strokeDasharray="4 2"
            aria-hidden="true"
          />

          {/* Aisles Rendering */}
          {STORE_AISLES.map((aisle) => {
            const layout = aisleLayouts[aisle.code];
            if (!layout) return null;

            const isTargetAisle = highlightedAisleCode === aisle.code;
            const isInRoute = routeAisleCodes.includes(aisle.code);
            const isActiveRouteStep = activeStepAisleCode === aisle.code;
            const isAisleFocused = focusedAisle === aisle.code;

            let fill = "#FFFFFF";
            let stroke = "#E2E8F0";
            let strokeWidth = 1.5;
            let textPrimary = "#1E293B";

            if (isTargetAisle || isActiveRouteStep) {
              fill = "#EEF8F0";
              stroke = "#2E9E44";
              strokeWidth = 2.5;
              textPrimary = "#166534";
            } else if (isInRoute) {
              fill = "#EFF6FF";
              stroke = "#3B82F6";
              strokeWidth = 2;
              textPrimary = "#1E40AF";
            }

            return (
              <g
                key={aisle.code}
                tabIndex={0}
                role="button"
                aria-label={`Aisle ${aisle.code}: ${aisle.name}. Zone: ${aisle.zone}. Contains racks ${layout.racks.join(", ")}.${
                  isTargetAisle ? " Selected target destination." : isInRoute ? " Route waypoint." : ""
                }`}
                aria-roledescription="Supermarket aisle"
                onFocus={() => setFocusedAisle(aisle.code)}
                onBlur={() => setFocusedAisle(null)}
                onClick={() => onSelectAisle?.(aisle.code)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectAisle?.(aisle.code);
                  }
                }}
                className="transition-all duration-200 cursor-pointer outline-hidden focus:outline-hidden"
                filter={isTargetAisle ? "url(#beacon-glow)" : undefined}
              >
                {/* Gondola block */}
                <rect
                  x={layout.x}
                  y={layout.y}
                  width={layout.w}
                  height={layout.h}
                  rx="8"
                  fill={fill}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                />

                {/* Visible Focus Indicator Ring */}
                {isAisleFocused && (
                  <rect
                    x={layout.x - 3}
                    y={layout.y - 3}
                    width={layout.w + 6}
                    height={layout.h + 6}
                    rx="11"
                    fill="none"
                    stroke="#0F2044"
                    strokeWidth="2.5"
                    strokeDasharray="4 2"
                    aria-hidden="true"
                    className="pointer-events-none"
                  />
                )}

                {/* Aisle code badge */}
                <rect
                  x={layout.x + 8}
                  y={layout.y + 8}
                  width="36"
                  height="18"
                  rx="4"
                  fill={isTargetAisle ? "#2E9E44" : isInRoute ? "#3B82F6" : "#0F2044"}
                  aria-hidden="true"
                />
                <text
                  x={layout.x + 26}
                  y={layout.y + 21}
                  textAnchor="middle"
                  fill="#FFFFFF"
                  fontSize="10"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  aria-hidden="true"
                >
                  {aisle.code}
                </text>

                {/* Aisle Name text */}
                <text
                  x={layout.x + 8}
                  y={layout.y + 42}
                  fill={textPrimary}
                  fontSize="10.5"
                  fontFamily="sans-serif"
                  fontWeight="bold"
                  aria-hidden="true"
                >
                  {aisle.name.length > 18 ? `${aisle.name.slice(0, 16)}…` : aisle.name}
                </text>

                {/* Rack Indicators inside aisle */}
                <g transform={`translate(${layout.x + 8}, ${layout.y + 54})`}>
                  {layout.racks.map((rack, rIdx) => {
                    const isTargetRack = isTargetAisle && highlightedRackCode === rack;
                    const isRackFocused = focusedRack === `${aisle.code}-${rack}`;
                    return (
                      <g
                        key={rack}
                        transform={`translate(${(rIdx % 2) * 46}, ${Math.floor(rIdx / 2) * 20})`}
                        tabIndex={0}
                        role="button"
                        aria-label={`Rack ${rack} in ${aisle.name}${isTargetRack ? " (Selected target rack)" : ""}`}
                        onFocus={(e) => {
                          e.stopPropagation();
                          setFocusedRack(`${aisle.code}-${rack}`);
                        }}
                        onBlur={() => setFocusedRack(null)}
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectRack?.(aisle.code, rack);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" || e.key === " ") {
                            e.preventDefault();
                            e.stopPropagation();
                            onSelectRack?.(aisle.code, rack);
                          }
                        }}
                        className="cursor-pointer outline-hidden transition"
                      >
                        <rect
                          width="42"
                          height="16"
                          rx="3"
                          fill={isTargetRack ? "#2E9E44" : "#F1F5F9"}
                          stroke={isRackFocused ? "#0F2044" : isTargetRack ? "#166534" : "#E2E8F0"}
                          strokeWidth={isRackFocused ? 2 : 1}
                        />
                        <text
                          x="21"
                          y="11.5"
                          textAnchor="middle"
                          fontSize="8.5"
                          fontFamily="sans-serif"
                          fontWeight={isTargetRack || isRackFocused ? "bold" : "normal"}
                          fill={isTargetRack ? "#FFFFFF" : isRackFocused ? "#0F2044" : "#64748B"}
                          aria-hidden="true"
                        >
                          {rack}
                        </text>
                      </g>
                    );
                  })}
                </g>

                {/* Target Beacon Pin for Selected Destination */}
                {isTargetAisle && (
                  <g transform={`translate(${layout.x + layout.w - 18}, ${layout.y + 16})`} aria-hidden="true">
                    <circle r="9" fill="#2E9E44" fillOpacity="0.3" className="qless-beacon-glow" />
                    <circle r="5" fill="#2E9E44" stroke="#FFFFFF" strokeWidth="1.5" />
                  </g>
                )}
              </g>
            );
          })}

          {/* ──────────────── Entrance Gate (Bottom Left) ──────────────── */}
          <g transform="translate(40, 312)" role="group" aria-label="Store entrance and turnstiles gate">
            <rect width="180" height="42" rx="10" fill="#F0FDF4" stroke="#86EFAC" strokeWidth="1.5" />
            <text x="90" y="24" textAnchor="middle" fill="#166534" fontSize="11" fontFamily="sans-serif" fontWeight="bold">
              🚪 ENTRANCE & TURNSTILES
            </text>
            <text x="90" y="36" textAnchor="middle" fill="#15803D" fontSize="8.5" fontFamily="sans-serif">
              Scan gate QR · Enter here
            </text>
          </g>

          {/* ──────────────── Customer Service Desk (Bottom Center) ──────────────── */}
          <g transform="translate(260, 312)" role="group" aria-label="Customer service assistance desk">
            <rect width="180" height="42" rx="10" fill="#F8FAFC" stroke="#CBD5E1" strokeWidth="1.5" />
            <text x="90" y="24" textAnchor="middle" fill="#334155" fontSize="11" fontFamily="sans-serif" fontWeight="bold">
              ℹ️ CUSTOMER DESK
            </text>
            <text x="90" y="36" textAnchor="middle" fill="#64748B" fontSize="8.5" fontFamily="sans-serif">
              Assistance for missing items
            </text>
          </g>

          {/* ──────────────── Self-Checkout & Exit Gate (Bottom Right) ──────────────── */}
          <g transform="translate(480, 312)" role="group" aria-label="Self-checkout and exit turnstiles">
            <rect width="200" height="42" rx="10" fill="#FEF2F2" stroke="#FCA5A5" strokeWidth="1.5" />
            <text x="100" y="24" textAnchor="middle" fill="#991B1B" fontSize="11" fontFamily="sans-serif" fontWeight="bold">
              💳 CHECKOUT & EXIT GATES
            </text>
            <text x="100" y="36" textAnchor="middle" fill="#B91C1C" fontSize="8.5" fontFamily="sans-serif">
              Scan exit pass at turnstiles
            </text>
          </g>

          {/* Walkway Arrows */}
          <g stroke="#94A3B8" strokeWidth="1" strokeDasharray="3 3" fill="none" opacity="0.6" aria-hidden="true">
            <path d="M 130 310 L 130 180 L 150 180" />
            <path d="M 270 180 L 290 180" />
            <path d="M 410 180 L 430 180" />
            <path d="M 550 180 L 580 180 L 580 310" />
          </g>
        </svg>
      </div>

      {/* Legend & Textual Accessibility Alternative */}
      {showLegend && (
        <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/60 pt-2.5 text-[11px] text-[#64748B]">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-full bg-[#2E9E44]" />
              <span className="font-medium text-[#0F2044]">Target Destination</span>
            </div>
            {routeAisleCodes.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="h-2.5 w-2.5 rounded-full bg-[#3B82F6]" />
                <span className="font-medium text-[#0F2044]">Route Stop</span>
              </div>
            )}
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#F0FDF4] border border-[#86EFAC]" />
              <span>Entrance</span>
            </div>
            <div className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm bg-[#FEF2F2] border border-[#FCA5A5]" />
              <span>Checkout / Exit</span>
            </div>
          </div>

          {selectedAisle && (
            <div className="font-semibold text-[#2E9E44]">
              {selectedAisle.code} — {selectedAisle.name}
              {highlightedRackCode && ` · Rack ${highlightedRackCode}`}
              {highlightedShelfCode && ` · Shelf ${highlightedShelfCode}`}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
