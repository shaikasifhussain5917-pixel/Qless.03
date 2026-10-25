import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { IcArrowRight, IcCheck, IcScan, IcShield } from "../../components/common/Icons";
export function WelcomeScreen() {
  const navigate = useNavigate();

  const handleStartShopping = () => {
    navigate("/scan-store");
  };

  return (
    <CustomerLayout
      showHeader={false}
      showFooter={true}
      maxWidthClass="max-w-[540px]"
    >
      <div className="flex flex-1 flex-col justify-between py-2 sm:py-4 qless-fade-in">
        {/* Top Brand Header */}
        <div className="text-center pt-2 pb-4">
          <div className="mx-auto mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-[0_10px_25px_rgba(15,32,68,0.12)] border border-black/5 overflow-hidden p-2">
            <img
              src="/images/qless-logo.png"
              alt="QLess Brand Logo"
              className="h-full w-full object-contain"
              onError={(e) => {
                // Graceful fallback if image path has issue
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-[#2E9E44]/25 bg-[#EEF8F0] px-3.5 py-1 text-xs font-semibold text-[#2E9E44] shadow-sm mb-3">
            <span className="h-2 w-2 rounded-full bg-[#2E9E44] animate-pulse" />
            Smart Self-Checkout Supermarket
          </div>

          <h1 className="font-poppins text-2xl sm:text-4xl font-extrabold tracking-[-0.04em] text-[#0F2044] leading-[1.15]">
            Skip the billing line. <br />
            <span className="text-[#2E9E44]">Scan. Pay. Go.</span>
          </h1>

          <p className="mx-auto mt-2 max-w-[420px] text-xs sm:text-sm text-[#758092] leading-relaxed">
            Turn your smartphone into a personal cashier. Scan shelf barcodes as you shop,
            pay instantly, and exit in seconds without waiting in long queues.
          </p>
        </div>

        {/* 3 Step Interactive Workflow Card */}
        <div className="my-3 sm:my-4 rounded-3xl border border-white/60 bg-white/85 p-4 sm:p-6 shadow-[0_12px_36px_rgba(15,32,68,0.08)] backdrop-blur-xl">
          <p className="text-[11px] sm:text-xs font-bold uppercase tracking-wider text-[#8A94A3] mb-3 sm:mb-4 text-center">
            How QLess Works in 3 Easy Steps
          </p>

          <div className="space-y-3 sm:space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3 sm:gap-3.5 group">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44] shadow-sm font-poppins font-bold text-xs sm:text-sm transition group-hover:scale-105">
                01
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044]">
                  Scan from the Shelf
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#7A8493] leading-relaxed">
                  Pick any grocery item and point your phone camera at the barcode to instantly add it to your live cart.
                </p>
              </div>
            </div>

            <div className="h-px bg-black/5 mx-2" />

            {/* Step 2 */}
            <div className="flex items-start gap-3 sm:gap-3.5 group">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-[#0F2044] text-white shadow-sm font-poppins font-bold text-xs sm:text-sm transition group-hover:scale-105">
                02
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044]">
                  Settle at Express Cash Desk
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#7A8493] leading-relaxed">
                  Review itemized prices and live discounts. Settle cash in seconds at our dedicated assisted cashier desk.
                </p>
              </div>
            </div>

            <div className="h-px bg-black/5 mx-2" />

            {/* Step 3 */}
            <div className="flex items-start gap-3 sm:gap-3.5 group">
              <div className="flex h-10 w-10 sm:h-11 sm:w-11 shrink-0 items-center justify-center rounded-2xl bg-[#EEF8F0] text-[#2E9E44] shadow-sm font-poppins font-bold text-xs sm:text-sm transition group-hover:scale-105">
                03
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#0F2044]">
                  Show QR at Exit Gate
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#7A8493] leading-relaxed">
                  Flash your verified digital receipt pass at the automated exit turnstile to walk straight out.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Pills */}
        <div className="grid grid-cols-3 gap-1.5 sm:gap-2 my-2 text-center">
          <div className="rounded-2xl border border-white/50 bg-white/70 p-2 sm:p-2.5 backdrop-blur-md shadow-sm">
            <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF8F0] text-[#2E9E44]">
              <IcCheck />
            </div>
            <p className="font-poppins text-[10px] sm:text-[11px] font-bold text-[#0F2044] truncate">Zero Queues</p>
            <p className="text-[9px] sm:text-[10px] text-[#7A8493] font-alegreya truncate">Save 15+ mins</p>
          </div>

          <div className="rounded-2xl border border-white/50 bg-white/70 p-2 sm:p-2.5 backdrop-blur-md shadow-sm">
            <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-[#0F2044]/10 text-[#0F2044]">
              <IcScan />
            </div>
            <p className="font-poppins text-[10px] sm:text-[11px] font-bold text-[#0F2044] truncate">Live Budget</p>
            <p className="text-[9px] sm:text-[10px] text-[#7A8493] font-alegreya truncate">Real-time total</p>
          </div>

          <div className="rounded-2xl border border-white/50 bg-white/70 p-2 sm:p-2.5 backdrop-blur-md shadow-sm">
            <div className="mx-auto mb-1 flex h-7 w-7 items-center justify-center rounded-lg bg-[#EEF8F0] text-[#2E9E44]">
              <IcShield />
            </div>
            <p className="font-poppins text-[10px] sm:text-[11px] font-bold text-[#0F2044] truncate">Gate Verified</p>
            <p className="text-[9px] sm:text-[10px] text-[#7A8493] font-alegreya truncate">Turnstile Pass</p>
          </div>
        </div>

        {/* Action Button */}
        <div className="pt-2 sm:pt-3 pb-2 space-y-2">
          <button
            onClick={handleStartShopping}
            className="group flex min-h-[48px] h-12 sm:h-14 w-full items-center justify-center gap-3 rounded-2xl bg-[#2E9E44] font-poppins text-sm sm:text-base font-semibold text-white shadow-[0_12px_28px_rgba(46,158,68,0.28)] transition-all hover:scale-[1.01] active:scale-[0.98] hover:bg-[#288B3B]"
          >
            <span>Start Shopping</span>
            <span className="transition-transform group-hover:translate-x-1">
              <IcArrowRight />
            </span>
          </button>

          <button
            onClick={() => navigate("/auth/role")}
            className="flex min-h-[44px] h-11 w-full items-center justify-center gap-2 rounded-2xl border border-black/10 bg-white/80 font-poppins text-xs font-semibold text-[#0F2044] hover:bg-white shadow-2xs transition active:scale-[0.98]"
          >
            <span>🔑</span>
            <span>Switch Role / Sign In (Customer · Admin · Guard)</span>
          </button>

          <p className="mt-1 text-center font-alegreya text-xs text-[#7A8493]">
            Select your local supermarket to initiate a session
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}
