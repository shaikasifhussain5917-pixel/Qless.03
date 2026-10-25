import { useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { fmt } from "../../utils/formatters";

interface UpiPaymentViewProps {
  finalTotal: number;
  sessionId: string;
}

export function UpiPaymentView({ finalTotal, sessionId }: UpiPaymentViewProps) {
  const [copied, setCopied] = useState(false);
  const upiId = "qless.mart@okhdfcbank";
  const upiUri = `upi://pay?pa=${upiId}&pn=QLess%20Smart%20Self-Checkout&am=${finalTotal}&cu=INR&tn=Order%20Session%20${sessionId}`;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(upiId).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2200);
      });
    } else {
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    }
  };

  return (
    <div className="rounded-2xl border border-white/60 bg-white/95 p-5 shadow-[0_8px_24px_rgba(15,32,68,0.06)] qless-fade-in space-y-4">
      <div className="flex items-center justify-between border-b border-black/5 pb-3">
        <div>
          <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
            Unified Payments Interface (UPI)
          </h4>
          <p className="text-[11px] text-[#7A8493]">
            Instant bank-to-bank simulated checkout
          </p>
        </div>
        <div className="flex items-center gap-1">
          <span className="rounded-md bg-[#F4F6F8] px-1.5 py-0.5 text-[10px] font-bold text-[#0F2044]">GPay</span>
          <span className="rounded-md bg-[#F4F6F8] px-1.5 py-0.5 text-[10px] font-bold text-[#5F259F]">PhonePe</span>
          <span className="rounded-md bg-[#F4F6F8] px-1.5 py-0.5 text-[10px] font-bold text-[#002E6E]">Paytm</span>
        </div>
      </div>

      {/* QR Code Illustration */}
      <div className="flex flex-col sm:flex-row items-center gap-4 rounded-xl border border-black/5 bg-[#F9FAFB] p-4">
        <div className="flex flex-col items-center bg-white p-3 rounded-xl border border-black/5 shadow-xs shrink-0">
          <QRCodeSVG
            value={upiUri}
            size={132}
            level="M"
            includeMargin={false}
          />
          <span className="mt-1.5 text-[10px] font-mono font-bold text-[#7A8493]">
            SCAN WITH ANY UPI APP
          </span>
        </div>

        <div className="min-w-0 space-y-2 text-center sm:text-left">
          <div>
            <p className="text-xs text-[#7A8493]">Payable Amount</p>
            <p className="font-poppins text-xl font-bold text-[#0F2044]">
              {fmt(finalTotal)}
            </p>
          </div>

          <div className="rounded-xl border border-black/5 bg-white p-2.5 shadow-2xs">
            <p className="text-[10px] text-[#7A8493] uppercase font-bold tracking-wider">
              Supermarket UPI ID
            </p>
            <div className="flex items-center justify-between gap-2 mt-0.5">
              <span className="font-mono text-xs font-semibold text-[#0F2044] truncate select-all">
                {upiId}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-lg bg-[#F0F2F5] px-2.5 py-1 text-[11px] font-semibold text-[#0F2044] hover:bg-[#E4E7EB] transition active:scale-95 shrink-0"
              >
                {copied ? "Copied! ✓" : "Copy"}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Clear Demo Disclaimer */}
      <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-[11px] text-amber-900 leading-relaxed">
        <p className="font-bold flex items-center gap-1.5">
          <span>ℹ️</span> Simulated Payment Demo
        </p>
        <p className="mt-0.5 text-amber-800">
          This QR code illustrates a self-checkout terminal. Tapping <strong>"Authorize &amp; Pay"</strong> will initiate a simulated authorization without charging any bank account.
        </p>
      </div>
    </div>
  );
}
