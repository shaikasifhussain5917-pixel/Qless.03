import { ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { DemoNoticeBanner } from "./DemoNoticeBanner";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle: string;
  roleBadge?: { label: string; colorClass: string };
  onBack?: () => void;
  maxWidthClass?: string;
  showRoleSwitcher?: boolean;
}

export function AuthLayout({
  children,
  title,
  subtitle,
  roleBadge,
  onBack,
  maxWidthClass = "max-w-[450px]",
  showRoleSwitcher = true,
}: AuthLayoutProps) {
  const navigate = useNavigate();

  return (
    <main
      className="relative min-h-screen px-4 py-6 sm:px-6 sm:py-8 text-[#0F2044] antialiased qless-app-bg flex items-center justify-center"
      style={{ backgroundImage: `url('/images/qless-bg.jpg')` }}
    >
      {/* Soft glassmorphism backdrop */}
      <div
        className="pointer-events-none fixed inset-0 z-0 bg-gradient-to-b from-white/85 via-white/70 to-white/85 backdrop-blur-[2px]"
        aria-hidden="true"
      />

      <div className={`relative z-[1] w-full ${maxWidthClass} mx-auto my-auto flex flex-col`}>
        {/* Top Header Bar */}
        <header className="flex items-center justify-between pb-3 mb-3 border-b border-black/5 gap-2">
          <div className="flex items-center gap-2.5 min-w-0 flex-1 overflow-hidden">
            {onBack ? (
              <button
                type="button"
                onClick={onBack}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/80 border border-black/5 text-[#7A8493] hover:text-[#0F2044] hover:bg-white shadow-xs transition active:scale-95"
                aria-label="Back"
              >
                <svg viewBox="0 0 24 24" fill="none" className="h-4 w-4" stroke="currentColor" strokeWidth="2.2">
                  <path d="M19 12H5M5 12l6-6M5 12l6 6" />
                </svg>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => navigate("/")}
                className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#0F2044] text-white font-bold text-sm shadow-xs"
                title="Go to QLess Home"
              >
                Q
              </button>
            )}

            <div>
              <p className="font-poppins text-lg font-extrabold tracking-[-0.03em] text-[#0F2044] leading-tight">
                QLESS
              </p>
              <p className="text-[11px] font-medium text-[#7A8493]">Smart Self-Checkout</p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {roleBadge && (
              <span className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold tracking-wide shadow-xs ${roleBadge.colorClass}`}>
                {roleBadge.label}
              </span>
            )}
            {showRoleSwitcher && (
              <button
                type="button"
                onClick={() => navigate("/auth/role")}
                className="flex items-center gap-1 rounded-full border border-black/5 bg-white/90 px-2.5 py-1 text-xs font-semibold text-[#0F2044] shadow-xs hover:bg-white transition active:scale-95"
                title="Select role or portal"
              >
                <span>🔄</span>
                <span className="hidden sm:inline">Portals</span>
              </button>
            )}
          </div>
        </header>

        {/* Auth Content Card */}
        <div className="rounded-3xl border border-white/70 bg-white/95 p-5 sm:p-7 shadow-[0_12px_36px_rgba(15,32,68,0.08)] backdrop-blur-xl">
          <div className="mb-5 text-center">
            <h1 className="font-poppins text-2xl font-extrabold tracking-tight text-[#0F2044]">
              {title}
            </h1>
            <p className="mt-1 text-xs sm:text-sm text-[#7A8493] leading-relaxed">
              {subtitle}
            </p>
          </div>

          {/* Child form / screen content */}
          {children}

          <div className="mt-5 pt-4 border-t border-black/5">
            <DemoNoticeBanner compact />
          </div>
        </div>

        {/* Footer */}
        <footer className="mt-4 text-center">
          <p className="font-alegreya text-xs text-[#7A8493]">
            Scan. Pay. Go. — Secure Self-Checkout Architecture
          </p>
        </footer>
      </div>
    </main>
  );
}
