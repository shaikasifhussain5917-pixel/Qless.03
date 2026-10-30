import { useState } from "react";
import { AVAILABLE_COUPONS } from "../../utils/billing";
import { fmt } from "../../utils/formatters";

interface AdminCouponsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function AdminCouponsModal({ isOpen, onClose }: AdminCouponsModalProps) {
  const [copiedCode, setCopiedCode] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleCopy = (code: string) => {
    navigator.clipboard?.writeText(code);
    setCopiedCode(code);
    setTimeout(() => setCopiedCode(null), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs qless-fade-in">
      <div className="relative w-full max-w-lg rounded-3xl border border-white/70 bg-white p-6 shadow-2xl space-y-4">
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-black/5 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-amber-100 text-amber-800 text-lg shadow-xs">
              🏷️
            </div>
            <div>
              <h3 className="font-poppins text-base font-bold text-[#0F2044]">
                Active Store Coupons &amp; Offers
              </h3>
              <p className="text-xs text-[#7A8493]">
                Authoritative supermarket discount promo codes accepted at checkout
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#F8F9FA] text-[#7A8493] hover:text-[#0F2044] hover:bg-black/5 transition"
            aria-label="Close coupons modal"
          >
            ✕
          </button>
        </div>

        {/* Coupons List */}
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {AVAILABLE_COUPONS.map((coupon) => (
            <div
              key={coupon.code}
              className="rounded-2xl border border-black/10 bg-[#F9FAFB] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-black/20 transition"
            >
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <span className="font-mono text-sm font-extrabold tracking-wider bg-white border border-black/10 rounded-lg px-2.5 py-1 text-[#0F2044] shadow-2xs">
                    {coupon.code}
                  </span>
                  <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
                    {coupon.discountType === "percentage" ? `${coupon.discountValue}% OFF` : `${fmt(coupon.discountValue)} OFF`}
                  </span>
                </div>
                <p className="text-xs font-medium text-[#0F2044] pt-1">
                  {coupon.description}
                </p>
                {coupon.minSubtotal && (
                  <p className="text-[11px] text-[#7A8493]">
                    Minimum order requirement: <strong className="text-[#0F2044]">{fmt(coupon.minSubtotal)}</strong>
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() => handleCopy(coupon.code)}
                className="self-start sm:self-center shrink-0 min-h-[38px] rounded-xl border border-black/10 bg-white px-3.5 py-1.5 text-xs font-bold text-[#0F2044] hover:bg-[#F8F9FA] active:scale-95 transition shadow-2xs"
              >
                {copiedCode === coupon.code ? "✓ Copied!" : "Copy Code"}
              </button>
            </div>
          ))}
        </div>

        {/* Info Note */}
        <div className="rounded-xl bg-amber-50/80 border border-amber-200 p-3 text-[11px] text-amber-900 leading-relaxed">
          💡 <strong>Promo Policy:</strong> Coupons are validated against the authoritative order subtotal during self-checkout before payment confirmation.
        </div>

        {/* Close Button */}
        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] rounded-xl bg-[#0F2044] px-5 py-2 font-poppins text-xs font-bold text-white hover:bg-[#1A3163] transition active:scale-95"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

