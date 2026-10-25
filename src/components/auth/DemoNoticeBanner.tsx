interface DemoNoticeBannerProps {
  compact?: boolean;
}

export function DemoNoticeBanner({ compact = false }: DemoNoticeBannerProps) {
  if (compact) {
    return (
      <div className="flex items-center justify-between rounded-xl border border-amber-500/20 bg-amber-50/80 px-3 py-1.5 text-[11px] text-amber-800 backdrop-blur-sm">
        <span className="flex items-center gap-1.5 font-semibold">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500 animate-pulse" />
          DEMO AUTHENTICATION
        </span>
        <span className="text-[10px] text-amber-700/80">Local Simulation Only</span>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-amber-500/25 bg-amber-50/90 p-3 sm:p-3.5 text-xs text-amber-900 shadow-xs">
      <div className="flex items-start gap-2.5">
        <span className="text-base leading-none">⚠️</span>
        <div className="min-w-0 flex-1 leading-relaxed">
          <p className="font-semibold text-amber-950">DEMO AUTHENTICATION ACTIVE</p>
          <p className="mt-0.5 text-[11px] text-amber-800">
            This prototype simulates identity verification in browser memory. Passwords and session
            tokens are never transmitted over network or stored in plain text.
          </p>
        </div>
      </div>
    </div>
  );
}
