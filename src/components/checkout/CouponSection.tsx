import { useState, FormEvent } from "react";
import { Coupon } from "../../types";
import { AVAILABLE_COUPONS, validateCoupon } from "../../utils/billing";
import { fmt } from "../../utils/formatters";
import { IcCheck } from "../common/Icons";

interface CouponSectionProps {
  subtotal: number;
  appliedCoupon: Coupon | null;
  onApplyCoupon: (coupon: Coupon) => void;
  onRemoveCoupon: () => void;
}

export function CouponSection({
  subtotal,
  appliedCoupon,
  onApplyCoupon,
  onRemoveCoupon,
}: CouponSectionProps) {
  const [couponInput, setCouponInput] = useState("");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const handleApply = (e?: FormEvent) => {
    if (e) e.preventDefault();
    const clean = couponInput.trim().toUpperCase();
    setErrorMessage(null);
    setSuccessMessage(null);

    const result = validateCoupon(clean, subtotal, appliedCoupon);
    if (!result.valid || !result.coupon) {
      setErrorMessage(result.error || "Invalid coupon code.");
      return;
    }

    onApplyCoupon(result.coupon);
    setCouponInput("");
    setSuccessMessage(`Coupon ${result.coupon.code} applied successfully!`);
  };

  const handleQuickFill = (code: string) => {
    setCouponInput(code);
    setErrorMessage(null);
    setSuccessMessage(null);
    const result = validateCoupon(code, subtotal, appliedCoupon);
    if (!result.valid || !result.coupon) {
      setErrorMessage(result.error || "Coupon criteria not met.");
      return;
    }
    onApplyCoupon(result.coupon);
    setSuccessMessage(`Coupon ${result.coupon.code} applied successfully!`);
  };

  return (
    <div className="rounded-3xl border border-slate-200/80 bg-white p-5 shadow-xs">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-poppins text-sm font-bold text-[#101828]">
          Offers &amp; Coupons
        </h3>
        <span className="text-[11px] text-[#667085] font-medium">
          Store Promo Codes
        </span>
      </div>

      {/* Applied Coupon Banner */}
      {appliedCoupon ? (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/80 p-3.5 flex items-center justify-between qless-scale-in">
          <div className="flex items-center gap-2.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#16A36A] text-white shadow-2xs">
              <IcCheck />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-mono text-xs font-bold text-[#16A36A] tracking-wider">
                  {appliedCoupon.code}
                </span>
                <span className="rounded bg-white/90 px-1.5 py-0.2 text-[10px] font-bold text-[#16A36A] border border-emerald-200/60">
                  APPLIED
                </span>
              </div>
              <p className="text-[11px] text-[#15803d]">
                {appliedCoupon.description}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onRemoveCoupon}
            className="rounded-xl bg-white px-3 py-1.5 text-xs font-semibold text-red-600 border border-red-200 shadow-2xs hover:bg-red-50 transition active:scale-95 cursor-pointer"
            aria-label={`Remove coupon ${appliedCoupon.code}`}
          >
            Remove
          </button>
        </div>
      ) : (
        /* Coupon Input Form */
        <form onSubmit={handleApply} className="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                id="coupon-code-input"
                value={couponInput}
                onChange={(e) => {
                  setCouponInput(e.target.value);
                  if (errorMessage) setErrorMessage(null);
                  if (successMessage) setSuccessMessage(null);
                }}
                placeholder="Enter promo code (e.g. SAVE10)"
                className="w-full rounded-xl border border-slate-200 bg-slate-50/50 py-2.5 px-3.5 font-mono text-xs font-bold uppercase text-[#101828] placeholder-[#9AA3AF] placeholder:normal-case transition focus:border-[#16A36A] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#16A36A]/20"
                aria-label="Enter promotional coupon code"
              />
            </div>

            <button
              type="submit"
              disabled={!couponInput.trim()}
              className="rounded-xl bg-[#101828] px-4 py-2.5 font-poppins text-xs font-semibold text-white shadow-xs transition hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 cursor-pointer"
            >
              Apply
            </button>
          </div>

          {/* Validation Feedback Messages */}
          {errorMessage && (
            <div
              role="alert"
              className="rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700 qless-fade-in flex items-start gap-2"
            >
              <span className="font-bold">✕</span>
              <p className="flex-1">{errorMessage}</p>
            </div>
          )}

          {successMessage && (
            <div
              role="status"
              className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-[#16A36A] qless-fade-in flex items-start gap-2"
            >
              <span className="font-bold">✓</span>
              <p className="flex-1">{successMessage}</p>
            </div>
          )}

          {/* Quick Clickable Demo Coupon Badges */}
          <div className="pt-1.5">
            <p className="text-[10px] font-bold uppercase tracking-wider text-[#667085] mb-2">
              Available Store Coupons
            </p>
            <div className="flex flex-wrap gap-1.5">
              {AVAILABLE_COUPONS.map((coupon) => {
                const meetsMin = !coupon.minSubtotal || subtotal >= coupon.minSubtotal;
                return (
                  <button
                    key={coupon.code}
                    type="button"
                    onClick={() => handleQuickFill(coupon.code)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-1.5 text-left text-xs transition active:scale-95 cursor-pointer ${
                      meetsMin
                        ? "border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100/70 text-[#101828]"
                        : "border-slate-200 bg-slate-50 hover:bg-slate-100 text-[#667085]"
                    }`}
                  >
                    <span className="font-mono font-bold text-[#16A36A]">
                      {coupon.code}
                    </span>
                    <span className="text-[11px] text-[#667085]">
                      · {coupon.code === "SAVE10" ? "10% OFF" : `₹50 OFF (min ${fmt(500)})`}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </form>
      )}
    </div>
  );
}
