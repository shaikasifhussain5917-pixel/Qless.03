
export function BarcodeSVG({ active }: { active: boolean }) {
  // Widths for 30 alternating bars — decorative
  const bars = [3, 1, 2, 1, 3, 2, 1, 3, 1, 2, 3, 1, 2, 1, 4, 1, 2, 3, 1, 2, 1, 3, 2, 1, 3, 1, 2, 1, 3, 2];
  let x = 0;
  return (
    <svg
      viewBox="0 0 120 60"
      className={`w-full max-w-[180px] ${active ? "qless-bar-flicker" : ""}`}
      aria-hidden="true"
    >
      {bars.map((w, i) => {
        const rect = (
          <rect
            key={i}
            x={x}
            y={4}
            width={w}
            height={i % 5 === 0 ? 48 : 42}
            rx={0.5}
            fill={i % 2 === 0 ? "#0F2044" : "transparent"}
            opacity={i % 2 === 0 ? (i % 7 === 0 ? 0.9 : 0.75) : 0}
          />
        );
        x += w + 1;
        return rect;
      })}
      {/* barcode number below */}
      <text x="60" y="58" textAnchor="middle" fontSize="6" fill="#7A8493" fontFamily="monospace">
        8901063103765
      </text>
    </svg>
  );
}
