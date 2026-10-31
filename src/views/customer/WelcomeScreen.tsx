import { useNavigate } from "react-router-dom";
import { CustomerLayout } from "../../layouts/CustomerLayout";
import { IcArrowRight, IcCheck, IcScan, IcShield, IcUser } from "../../components/common/Icons";

export function WelcomeScreen() {
  const navigate = useNavigate();

  const handleStartShopping = () => {
    navigate("/scan-store");
  };

  return (
    <CustomerLayout
      showHeader={false}
      showFooter={true}
      maxWidthClass="max-w-[480px]"
    >
      <div className="flex flex-1 flex-col justify-between py-2 sm:py-4 qless-fade-in">
        {/* Top Brand Header */}
        <div className="text-center pt-3 pb-4">
          <div className="mx-auto mb-3.5 flex h-16 w-16 items-center justify-center rounded-2xl bg-white shadow-xs border border-slate-200/80 p-2.5">
            <img
              src="/images/qless-logo.png"
              alt="QLess Brand Logo"
              className="h-full w-full object-contain"
              onError={(e) => {
                (e.target as HTMLElement).style.display = "none";
              }}
            />
          </div>

          <div className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-3.5 py-1 text-xs font-semibold text-[#16A36A] shadow-2xs mb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[#16A36A] animate-pulse" />
            Smart Self-Checkout Supermarket
          </div>

          <h1 className="font-poppins text-2xl sm:text-4xl font-extrabold tracking-[-0.04em] text-[#101828] leading-[1.15]">
            Skip the billing line. <br />
            <span className="text-[#16A36A]">Scan. Pay. Go.</span>
          </h1>

          <p className="mx-auto mt-2 max-w-[380px] text-xs sm:text-sm text-[#667085] leading-relaxed">
            Turn your phone into a personal cashier. Scan items as you shop,
            settle digitally, and walk out without waiting in lines.
          </p>
        </div>

        {/* 3 Step Interactive Workflow Card */}
        <div className="my-3 sm:my-4 rounded-3xl border border-slate-200/80 bg-white p-5 sm:p-6 shadow-xs">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#667085] mb-4 text-center">
            How QLess Works in 3 Easy Steps
          </p>

          <div className="space-y-4">
            {/* Step 1 */}
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#16A36A] border border-emerald-200/60 font-poppins font-bold text-xs sm:text-sm shadow-2xs">
                01
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#101828]">
                  Scan from the Shelf
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#667085] leading-relaxed">
                  Pick any grocery product and point your camera at the barcode to instantly add it to your live cart.
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Step 2 */}
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#101828] text-white font-poppins font-bold text-xs sm:text-sm shadow-2xs">
                02
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#101828]">
                  Settle Payment Digitally or at Cash Desk
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#667085] leading-relaxed">
                  Review itemized prices and discounts. Pay via UPI, Cards, or fast settlement at Counter #03.
                </p>
              </div>
            </div>

            <div className="h-px bg-slate-100" />

            {/* Step 3 */}
            <div className="flex items-start gap-3.5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 text-[#16A36A] border border-emerald-200/60 font-poppins font-bold text-xs sm:text-sm shadow-2xs">
                03
              </div>
              <div className="min-w-0 flex-1">
                <h3 className="font-poppins text-xs sm:text-sm font-bold text-[#101828]">
                  Show QR at Exit Gate
                </h3>
                <p className="mt-0.5 text-[11px] sm:text-xs text-[#667085] leading-relaxed">
                  Flash your verified digital exit pass at the automated turnstile to walk straight out.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Feature Highlights Grid */}
        <div className="grid grid-cols-3 gap-2 my-2 text-center">
          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-[#16A36A]">
              <IcCheck />
            </div>
            <p className="font-poppins text-[11px] font-bold text-[#101828] truncate">Zero Queues</p>
            <p className="text-[10px] text-[#667085] truncate">Save 15+ mins</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <IcScan />
            </div>
            <p className="font-poppins text-[11px] font-bold text-[#101828] truncate">Live Budget</p>
            <p className="text-[10px] text-[#667085] truncate">Real-time total</p>
          </div>

          <div className="rounded-2xl border border-slate-200/80 bg-white p-3 shadow-2xs">
            <div className="mx-auto mb-1.5 flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-[#16A36A]">
              <IcShield />
            </div>
            <p className="font-poppins text-[11px] font-bold text-[#101828] truncate">Gate Verified</p>
            <p className="text-[10px] text-[#667085] truncate">Turnstile Pass</p>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="pt-3 pb-2 space-y-2.5">
          <button
            type="button"
            onClick={handleStartShopping}
            className="group flex min-h-[48px] h-13 w-full items-center justify-center gap-2.5 rounded-xl bg-[#16A36A] font-poppins text-sm font-bold text-white shadow-md transition hover:bg-[#15803d] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#16A36A]"
          >
            <span>Start Shopping</span>
            <span className="transition-transform group-hover:translate-x-1">
              <IcArrowRight />
            </span>
          </button>

          <button
            type="button"
            onClick={() => navigate("/auth/login")}
            className="flex min-h-[44px] h-11 w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white font-poppins text-xs font-semibold text-[#101828] hover:bg-slate-50 shadow-2xs transition active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          >
            <IcUser className="h-4 w-4 text-slate-500" />
            <span>Sign In to Account</span>
          </button>

          <p className="text-center text-xs text-[#667085]">
            Select your supermarket entrance gate to initiate a session
          </p>
        </div>
      </div>
    </CustomerLayout>
  );
}
