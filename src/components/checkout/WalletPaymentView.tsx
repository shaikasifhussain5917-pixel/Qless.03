import { fmt } from "../../utils/formatters";

interface WalletPaymentViewProps {
  walletBalance: number;
  finalTotal: number;
  onAddDemoBalance: (amount: number) => void;
}

export function WalletPaymentView({
  walletBalance,
  finalTotal,
  onAddDemoBalance,
}: WalletPaymentViewProps) {
  const isSufficient = walletBalance >= finalTotal;
  const remaining = isSufficient ? walletBalance - finalTotal : 0;
  const deficit = !isSufficient ? finalTotal - walletBalance : 0;

  return (
    <div className="rounded-2xl border border-white/60 bg-white/95 p-5 shadow-[0_8px_24px_rgba(15,32,68,0.06)] qless-fade-in space-y-4">
      <div className="flex items-center justify-between border-b border-black/5 pb-3">
        <div>
          <h4 className="font-poppins text-sm font-bold text-[#0F2044]">
            QLess Smart Wallet
          </h4>
          <p className="text-[11px] text-[#7A8493]">
            Instant one-tap digital stored balance
          </p>
        </div>

        <button
          type="button"
          onClick={() => onAddDemoBalance(500)}
          className="rounded-xl border border-[#2E9E44]/40 bg-[#EEF8F0] px-2.5 py-1 text-[11px] font-bold text-[#2E9E44] transition hover:bg-[#E2F4E6] active:scale-95"
        >
          +₹500 Demo Credit
        </button>
      </div>

      {/* Balance Summary Card */}
      <div className="rounded-xl border border-black/5 bg-[#F9FAFB] p-4 space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-[#7A8493]">Current Wallet Balance</span>
          <span className="font-poppins text-base font-bold text-[#0F2044]">
            {fmt(walletBalance)}
          </span>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-[#7A8493]">Amount to Deduct</span>
          <span className="font-poppins text-base font-bold text-[#0F2044]">
            {fmt(finalTotal)}
          </span>
        </div>

        <div className="border-t border-black/5 pt-2.5 flex items-center justify-between">
          <span className="text-xs font-semibold text-[#0F2044]">
            Remaining Balance After Payment
          </span>
          <span
            className={`font-poppins text-base font-bold ${
              isSufficient ? "text-[#2E9E44]" : "text-red-600"
            }`}
          >
            {isSufficient ? fmt(remaining) : "₹0.00"}
          </span>
        </div>
      </div>

      {/* Insufficient Balance Alert */}
      {!isSufficient && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-3.5 text-xs text-red-800 qless-scale-in space-y-2">
          <div className="flex items-start gap-2">
            <span className="text-red-600 font-bold">⚠️</span>
            <div>
              <p className="font-bold">Insufficient Wallet Balance</p>
              <p className="mt-0.5 text-[11px] text-red-700">
                Your wallet balance is {fmt(walletBalance)}, which is {fmt(deficit)} short of the {fmt(finalTotal)} required for this bill.
              </p>
            </div>
          </div>

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={() => onAddDemoBalance(Math.ceil(deficit / 100) * 100)}
              className="rounded-lg bg-red-700 px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-red-800 transition active:scale-95"
            >
              Top Up {fmt(Math.ceil(deficit / 100) * 100)} Demo Funds
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
