import { PaymentMethod } from "../../types";
import { CardFormData } from "./CardPaymentForm";
import { fmt } from "../../utils/formatters";

interface PaymentMethodSectionProps {
  selectedMethod: PaymentMethod;
  onSelectMethod: (method: PaymentMethod) => void;
  finalTotal: number;
  sessionId?: string;
  walletBalance?: number;
  onAddDemoWalletBalance?: (amount: number) => void;
  cardFormData?: CardFormData;
  onCardFormChange?: (data: CardFormData) => void;
  cardErrors?: Partial<Record<keyof CardFormData, string>>;
  disabled: boolean;
}

const METHODS_CONFIG: {
  id: PaymentMethod;
  name: string;
  badge: string;
  icon: string;
  caption: string;
  disabled?: boolean;
}[] = [
  {
    id: "cash",
    name: "Cash — Pay at Cashier Counter",
    badge: "Active Pilot Method",
    icon: "💵",
    caption: "Pay with physical cash at Counter #03 before exit verification",
    disabled: false,
  },
  {
    id: "upi",
    name: "UPI (Test Mode)",
    badge: "Razorpay Test",
    icon: "⚡",
    caption: "Test digital payment via Razorpay mock UPI gateway",
    disabled: false,
  },
  {
    id: "card",
    name: "Debit / Credit Card (Test Mode)",
    badge: "Razorpay Test",
    icon: "💳",
    caption: "Test digital payment via Razorpay mock Card gateway",
    disabled: false,
  },
  {
    id: "wallet",
    name: "QLess Wallet",
    badge: "Unavailable",
    icon: "👛",
    caption: "QLess Wallet is not available during test mode",
    disabled: true,
  },
];

export function PaymentMethodSection({
  selectedMethod,
  onSelectMethod,
  finalTotal,
  disabled,
}: PaymentMethodSectionProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-poppins text-base font-bold text-[#0F2044]">
          Select Payment Method
        </h3>
        <p className="text-xs text-[#7A8493]">
          Choose Cash at Counter #03 or Razorpay Test Mode (UPI / Card).
        </p>
      </div>

      {/* Accessible Radio Cards */}
      <div
        role="radiogroup"
        aria-label="Payment method selection"
        className="space-y-2.5"
      >
        {METHODS_CONFIG.map((method) => {
          const isSelected = selectedMethod === method.id;
          const isItemDisabled = disabled || !!method.disabled;

          return (
            <div
              key={method.id}
              role="radio"
              aria-checked={isSelected}
              aria-disabled={isItemDisabled}
              tabIndex={isItemDisabled ? -1 : 0}
              onClick={() => {
                if (!isItemDisabled) {
                  onSelectMethod(method.id);
                }
              }}
              onKeyDown={(e) => {
                if (isItemDisabled) return;
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onSelectMethod(method.id);
                }
              }}
              className={`rounded-2xl border-2 p-3.5 transition-all outline-none ${
                isItemDisabled
                  ? "cursor-not-allowed border-black/5 bg-slate-50/70 opacity-60"
                  : isSelected
                  ? "cursor-pointer border-[#2E9E44] bg-[#EEF8F0]/70 shadow-[0_4px_14px_rgba(46,158,68,0.12)] focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
                  : "cursor-pointer border-black/5 bg-white/80 hover:border-black/15 hover:bg-white focus-visible:ring-2 focus-visible:ring-[#2E9E44]"
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 min-w-0 pr-2">
                  {/* Radio circle indicator */}
                  <div
                    className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-all ${
                      isSelected
                        ? "border-[#2E9E44] bg-[#2E9E44]"
                        : isItemDisabled
                        ? "border-slate-300 bg-slate-100 text-slate-400"
                        : "border-[#D8DDE3] bg-white"
                    }`}
                  >
                    {isSelected && (
                      <div className="h-2 w-2 rounded-full bg-white" />
                    )}
                  </div>

                  <span className="text-xl shrink-0" aria-hidden="true">
                    {method.icon}
                  </span>

                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
                      <span className="font-poppins text-sm font-bold text-[#0F2044]">
                        {method.name}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] font-bold shrink-0 ${
                          method.disabled
                            ? "bg-amber-100 border border-amber-300 text-amber-800"
                            : "bg-emerald-100 border border-emerald-300 text-emerald-800"
                        }`}
                      >
                        {method.badge}
                      </span>
                    </div>
                    <p className="text-[11px] text-[#7A8493] truncate">
                      {method.caption}
                    </p>
                  </div>
                </div>

                <div className="text-right shrink-0">
                  {method.disabled ? (
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-md border border-amber-200">
                      Unavailable
                    </span>
                  ) : (
                    <span className="font-poppins text-xs font-bold text-[#0F2044]">
                      {fmt(finalTotal)}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Selected Payment Method Sub-View */}
      <div className="pt-1">
        {selectedMethod === "cash" && (
          <div className="rounded-2xl border border-amber-200 bg-amber-50/90 p-4 text-xs text-amber-950 qless-fade-in shadow-xs space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0" aria-hidden="true">💵</span>
              <div className="space-y-1">
                <h4 className="font-poppins text-sm font-bold text-amber-900">
                  Cash Counter Settlement
                </h4>
                <p className="text-xs leading-relaxed text-amber-800 font-medium">
                  Your order will be created now. Please visit Cashier Counter #03 to pay in physical cash. Your exit pass will remain locked until an authorized cashier confirms your payment.
                </p>
                <div className="mt-2 flex items-center gap-2 text-[11px] text-amber-900 bg-amber-100/70 rounded-lg px-2.5 py-1.5 border border-amber-200">
                  <span>ℹ️</span>
                  <span>Order reference will be displayed after submission for the cashier counter.</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedMethod === "upi" && (
          <div className="rounded-2xl border border-emerald-300 bg-emerald-50/95 p-4 text-xs text-emerald-950 qless-fade-in shadow-xs space-y-2.5">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0" aria-hidden="true">⚡</span>
              <div className="space-y-1.5 flex-1">
                <div className="flex items-center justify-between">
                  <h4 className="font-poppins text-sm font-bold text-emerald-900">
                    UPI Test Mode (College Review Guide)
                  </h4>
                  <span className="rounded bg-emerald-200/80 px-2 py-0.5 text-[10px] font-bold text-emerald-900 uppercase tracking-wider">
                    Sandbox
                  </span>
                </div>
                <p className="text-xs leading-relaxed text-emerald-800 font-medium">
                  Consumer apps (GPay, PhonePe, Paytm) cannot scan or route funds to test-mode QR codes because sandbox VPAs are not on the live NPCI banking switch.
                </p>
                <div className="mt-2 rounded-xl border border-emerald-200 bg-white/90 p-2.5 text-[11px] text-emerald-950 space-y-2">
                  <p className="font-semibold text-emerald-900">
                    How to demonstrate successful UPI payment:
                  </p>
                  <ol className="list-decimal list-inside space-y-1 text-slate-700">
                    <li>Click <strong>&ldquo;Complete Payment &amp; Generate Pass&rdquo;</strong> below.</li>
                    <li>In the Razorpay popup, select <strong>UPI ID / VPA</strong>.</li>
                    <li>
                      Enter the test VPA:{" "}
                      <code className="rounded bg-emerald-100 px-1.5 py-0.5 font-mono font-bold text-emerald-900">
                        success@razorpay
                      </code>
                    </li>
                    <li>Click <strong>&ldquo;Pay Now&rdquo;</strong> to simulate immediate bank authorization.</li>
                  </ol>
                  <div className="pt-1 flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard?.writeText("success@razorpay");
                        alert("Copied test VPA 'success@razorpay' to clipboard!");
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-[#0F2044] px-3 py-1.5 text-[11px] font-bold text-white hover:bg-slate-800 transition active:scale-95 shadow-xs"
                    >
                      <span>📋</span>
                      <span>Copy Test VPA (success@razorpay)</span>
                    </button>
                    <span className="text-[10px] text-slate-500">
                      (Use <code className="font-mono text-rose-700">failure@razorpay</code> to test decline)
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {selectedMethod === "card" && (
          <div className="rounded-2xl border border-blue-200 bg-blue-50/90 p-4 text-xs text-blue-950 qless-fade-in shadow-xs space-y-2">
            <div className="flex items-start gap-3">
              <span className="text-2xl shrink-0" aria-hidden="true">💳</span>
              <div className="space-y-1">
                <h4 className="font-poppins text-sm font-bold text-blue-900">
                  Card Payment Test Mode
                </h4>
                <p className="text-xs leading-relaxed text-blue-800 font-medium">
                  Use Razorpay test cards in the checkout popup to simulate successful Visa / Mastercard approval without real money.
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
